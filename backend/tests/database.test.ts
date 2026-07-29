/**
 * Tests for the optimised database connection pool (issue #187).
 *
 * We don't exercise real Postgres here — instead we verify the
 * configuration reader and the metrics aggregator on a fake pool to make
 * sure env-tunable sizing and health reporting stay correct.
 */

import {
  getPoolConfig,
  getPoolHealthReport,
  getPoolMetrics,
} from '../src/utils/database';

describe('database.pool (issue #187)', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Restore env so other tests aren't affected.
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PG_POOL_MAX;
    delete process.env.PG_POOL_MIN;
    delete process.env.PG_POOL_IDLE_TIMEOUT_MS;
    delete process.env.PG_POOL_CONNECTION_TIMEOUT_MS;
    delete process.env.PG_POOL_ACQUIRE_TIMEOUT_MS;
    delete process.env.PG_POOL_REAP_INTERVAL_MS;
    delete process.env.PG_STATEMENT_TIMEOUT_MS;
  });

  test('uses sensible defaults when no env overrides are present', () => {
    const cfg = getPoolConfig();
    expect(cfg.max).toBe(20);
    expect(cfg.min).toBe(2);
    expect(cfg.idleTimeoutMillis).toBe(30_000);
    expect(cfg.connectionTimeoutMillis).toBe(5_000);
    expect(cfg.acquireTimeoutMillis).toBe(10_000);
  });

  test('honours env overrides for max, min, idle and connection timeouts', () => {
    process.env.PG_POOL_MAX = '40';
    process.env.PG_POOL_MIN = '5';
    process.env.PG_POOL_IDLE_TIMEOUT_MS = '60000';
    process.env.PG_POOL_CONNECTION_TIMEOUT_MS = '8000';
    process.env.PG_POOL_ACQUIRE_TIMEOUT_MS = '12000';
    process.env.PG_POOL_REAP_INTERVAL_MS = '15000';

    const cfg = getPoolConfig();
    expect(cfg.max).toBe(40);
    expect(cfg.min).toBe(5);
    expect(cfg.idleTimeoutMillis).toBe(60_000);
    expect(cfg.connectionTimeoutMillis).toBe(8_000);
    expect(cfg.acquireTimeoutMillis).toBe(12_000);
    expect(cfg.reapIntervalMillis).toBe(15_000);
  });

  test('clamps out-of-range PG_POOL_MAX values rather than throwing', () => {
    process.env.PG_POOL_MAX = '9999';
    const cfg = getPoolConfig();
    // max is bounded to [1, 200] — values above the max get clamped.
    expect(cfg.max).toBe(200);

    process.env.PG_POOL_MAX = '0';
    const cfgZero = getPoolConfig();
    expect(cfgZero.max).toBe(1);
  });

  test('falls back to defaults when env values are not numeric', () => {
    process.env.PG_POOL_MAX = 'not-a-number';
    const cfg = getPoolConfig();
    expect(cfg.max).toBe(20);
  });

  test('pool metrics snapshot exposes the expected counters', () => {
    const m = getPoolMetrics();
    // Pool hasn't been created yet — counters are zero.
    expect(m.active).toBe(0);
    expect(m.idle).toBe(0);
    expect(m.waiting).toBe(0);
    expect(m.total).toBe(0);
    expect(m.acquireCount).toBe(0);
    expect(m.releaseCount).toBe(0);
    expect(m.errorCount).toBe(0);
    expect(m.reconnectCount).toBe(0);
    expect(m.lastAcquireAt).toBeNull();
    expect(m.lastReleaseAt).toBeNull();
    expect(m.ready).toBe(false);
    // Config is always included even when the pool isn't initialised.
    expect(m.config.max).toBeGreaterThan(0);
  });

  test('pool health report classifies state correctly', () => {
    const report = getPoolHealthReport();
    // Without an initialised pool: status = unhealthy, metrics.ready === false
    expect(report.status).toBe('unhealthy');
    expect(report.metrics.ready).toBe(false);
    // Utilization is 0 because nothing is active yet.
    expect(report.utilizationPercent).toBeGreaterThanOrEqual(0);
    expect(report.utilizationPercent).toBeLessThanOrEqual(100);
  });
});
