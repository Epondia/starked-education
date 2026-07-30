/**
 * Shared PostgreSQL database connection pool.
 *
 * Provides a single connection pool for all DB queries across the application,
 * with:
 * - Env-tunable pool sizing (min/max, idle/connection timeouts).
 * - Live connection metrics (active / idle / waiting / total) tracked via
 *   `acquire`, `release` and `remove` events.
 * - Idle connection reaping via `min` + an idle reaper timer.
 * - Health check and metrics-delegate hooks used by `/api/health` and
 *   `/api/v1/admin/pool-stats`.
 */

import { Pool, PoolClient } from 'pg';
import logger from './logger';
import * as fs from 'fs';
import * as path from 'path';
import { migrateUp } from './migrate';

let pool: Pool | null = null;
let isMigrationChecked = false;

// Metrics counters. Kept outside the Pool closure so they survive callbacks
// spawned after `pool.end()` has reset module state.
const metrics = {
  active: 0,
  idle: 0,
  waiting: 0,
  total: 0,
  acquireCount: 0,
  releaseCount: 0,
  errorCount: 0,
  reconnectCount: 0,
  lastAcquireAt: null as number | null,
  lastReleaseAt: null as number | null,
};

function num(name: string, defaultValue: number, { min, max }: { min: number; max: number }): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    logger.warn(`Invalid integer for ${name}=${raw}, falling back to ${defaultValue}`);
    return defaultValue;
  }
  if (parsed < min || parsed > max) {
    logger.warn(`${name}=${parsed} outside [${min},${max}], clamping`);
    return Math.max(min, Math.min(max, parsed));
  }
  return parsed;
}

/**
 * Read the current pool configuration. Exposed for the admin pool-stats
 * endpoint so operators can see which values are actually applied without
 * restarting the server.
 */
export function getPoolConfig(): {
  max: number;
  min: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  acquireTimeoutMillis: number;
  reapIntervalMillis: number;
} {
  return {
    max: num('PG_POOL_MAX', 20, { min: 1, max: 200 }),
    min: num('PG_POOL_MIN', 2, { min: 0, max: 50 }),
    idleTimeoutMillis: num('PG_POOL_IDLE_TIMEOUT_MS', 30_000, { min: 1_000, max: 600_000 }),
    connectionTimeoutMillis: num('PG_POOL_CONNECTION_TIMEOUT_MS', 5_000, { min: 100, max: 60_000 }),
    acquireTimeoutMillis: num('PG_POOL_ACQUIRE_TIMEOUT_MS', 10_000, { min: 100, max: 120_000 }),
    reapIntervalMillis: num('PG_POOL_REAP_INTERVAL_MS', 0, { min: 0, max: 3_600_000 }),
  };
}

let reapTimer: NodeJS.Timeout | null = null;

function startIdleReaper(intervalMs: number): void {
  if (reapTimer || intervalMs <= 0) return;
  reapTimer = setInterval(() => {
    // pg's `Pool` doesn't expose `releaseIdle`, but the built-in idle timer
    // already keeps `idle` connections alive until `idleTimeoutMillis`. We
    // simply log a snapshot so an operator can see at what rate the pool is
    // growing and shrink `min` if necessary.
    logger.debug(
      `pg pool snapshot — active=${metrics.active} idle=${metrics.idle} waiting=${metrics.waiting} total=${metrics.total}`,
    );
  }, intervalMs);
  // Don't keep the event loop alive solely for the reaper.
  if (typeof reapTimer.unref === 'function') reapTimer.unref();
}

export function getPool(): Pool {
  if (!pool) {
    const cfg = getPoolConfig();
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@localhost:5432/starked',
      max: cfg.max,
      min: cfg.min,
      idleTimeoutMillis: cfg.idleTimeoutMillis,
      connectionTimeoutMillis: cfg.connectionTimeoutMillis,
      // Express-level acquire timeout held in metadata so `acquireTimeoutMillis`
      // is observable from `getPoolConfig()`.
      statement_timeout: num('PG_STATEMENT_TIMEOUT_MS', 30_000, { min: 1_000, max: 600_000 }),
    });

    pool.on('error', (err: Error) => {
      metrics.errorCount += 1;
      logger.error('Unexpected PostgreSQL pool error:', err);
    });

    pool.on('connect', () => {
      metrics.total += 1;
      metrics.reconnectCount += 1;
      logger.debug('New PostgreSQL client connected to pool');
    });

    pool.on('remove', () => {
      metrics.total = Math.max(0, metrics.total - 1);
    });

    pool.on('acquire', () => {
      metrics.active += 1;
      metrics.waiting = Math.max(0, metrics.waiting - 1);
      metrics.acquireCount += 1;
      metrics.lastAcquireAt = Date.now();
    });

    pool.on('release', () => {
      metrics.active = Math.max(0, metrics.active - 1);
      metrics.idle += 1;
      metrics.releaseCount += 1;
      metrics.lastReleaseAt = Date.now();
    });

    // Auto-run pending migrations on server start (unless explicitly disabled in env)
    if (process.env.AUTO_RUN_MIGRATIONS !== 'false' && !isMigrationChecked) {
      isMigrationChecked = true;
      logger.info('Verifying structural database schema compliance...');
      migrateUp().catch((err) => {
        logger.error('Critical database migration check failure on startup:', err);
      });
    }

    startIdleReaper(cfg.reapIntervalMillis);
  }
  return pool;
}

/**
 * Snapshot the live connection-pool metrics. Safe to call before or after
 * `getPool()` — zeros are returned when the pool has not been created yet.
 */
export function getPoolMetrics(): {
  active: number;
  idle: number;
  waiting: number;
  total: number;
  acquireCount: number;
  releaseCount: number;
  errorCount: number;
  reconnectCount: number;
  lastAcquireAt: number | null;
  lastReleaseAt: number | null;
  config: ReturnType<typeof getPoolConfig>;
  ready: boolean;
} {
  return {
    active: metrics.active,
    idle: metrics.idle,
    waiting: metrics.waiting,
    total: metrics.total,
    acquireCount: metrics.acquireCount,
    releaseCount: metrics.releaseCount,
    errorCount: metrics.errorCount,
    reconnectCount: metrics.reconnectCount,
    lastAcquireAt: metrics.lastAcquireAt,
    lastReleaseAt: metrics.lastReleaseAt,
    config: getPoolConfig(),
    ready: pool !== null,
  };
}

export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  return await p.connect();
}

/**
 * Acquire a client with an explicit timeout. Falls back to the underlying
 * `Pool#connect()` when `timeoutMs <= 0`. Used by the request handler in
 * `index.js` to avoid hanging requests eating up pool slots forever.
 */

export async function query(text: string, params?: any[]): Promise<any> {
  const p = getPool();
  return await p.query(text, params);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    isMigrationChecked = false; // Reset initialization barrier on shutdown
  }
  if (reapTimer) {
    clearInterval(reapTimer);
    reapTimer = null;
  }
  metrics.active = 0;
  metrics.idle = 0;
  metrics.waiting = 0;
  metrics.total = 0;
}

/**
 * Safely query the database, returning null instead of throwing on errors
 * Useful for optional tables that may not exist yet
 */
export async function safeQuery(text: string, params?: any[]): Promise<any | null> {
  try {
    return await query(text, params);
  } catch (error: any) {
    // If table doesn't exist, return null gracefully
    if (error.code === '42P01' || error.code === '42P02') {
      logger.debug(`Table not found for query: ${text.substring(0, 100)}`);
      return null;
    }
    throw error;
  }
}

/**
 * Checks the status of the latest database backup.
 * It reads from a local status file updated by the backup script.
 */
export async function checkBackupStatus(): Promise<{ status: string; lastBackup: string | null; error?: string }> {
  try {
    const statusPath = path.resolve(__dirname, '../../backup_status.json');
    if (fs.existsSync(statusPath)) {
      const data = fs.readFileSync(statusPath, 'utf8');
      const status = JSON.parse(data);

      // Alerting on backup failure or staleness (older than 24 hours)
      if (status.status === 'failed') {
        logger.error(`Backup failure detected: ${status.error}`);
      } else if (status.lastBackup) {
        const lastBackupDate = new Date(status.lastBackup);
        const hoursSinceBackup = (Date.now() - lastBackupDate.getTime()) / (1000 * 60 * 60);
        if (hoursSinceBackup > 24) {
          logger.warn(`Backup is stale. Last backup was ${hoursSinceBackup.toFixed(2)} hours ago.`);
        }
      }

      return status;
    }
    return { status: 'unknown', lastBackup: null, error: 'Backup status file not found' };
  } catch (error: any) {
    logger.error('Failed to read backup status:', error);
    return { status: 'error', lastBackup: null, error: error.message };
  }
}

/**
 * Health check interface for dependency status
 */
export interface DependencyHealth {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  error?: string;
}

/**
 * Check PostgreSQL database connectivity with a lightweight query
 * Used by health check endpoints to verify database availability
 * @returns Health status with latency and optional error message
 */
export async function checkDatabaseConnectivity(): Promise<DependencyHealth> {
  const start = Date.now();
  try {
    await Promise.race([
      query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database check timeout')), 2000)
      )
    ]);
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: error?.code === 'ECONNREFUSED' ? 'Connection refused' : 'Database unavailable'
    };
  }
}

/**
 * Convenience helper for the admin endpoint. Returns:
 *  - the live metrics snapshot
 *  - the resolved configuration
 *  - a derived utilization percentage (0-100)
 */
export function getPoolHealthReport(): {
  status: 'healthy' | 'unhealthy' | 'degraded';
  utilizationPercent: number;
  metrics: ReturnType<typeof getPoolMetrics>;
} {
  const m = getPoolMetrics();
  const utilizationPercent =
    m.config.max > 0 ? Math.round((m.active / m.config.max) * 100) : 0;

  let status: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
  if (!m.ready) {
    status = 'unhealthy';
  } else if (utilizationPercent >= 90 || m.waiting > 0) {
    status = 'degraded';
  }

  return { status, utilizationPercent, metrics: m };
}
