/**
 * Course Cache Service
 * Redis-based caching layer for frequently accessed course data.
 *
 * Features:
 * - Cache-aside pattern for course listings & details
 * - TTL-based automatic invalidation
 * - Cache warming on course creation/update
 * - Hit/miss metrics for monitoring
 * - Graceful fallback when Redis is unavailable
 */

import { createClient, RedisClientType } from 'redis';
import logger from '../utils/logger';

/** Default TTLs in seconds */
const DEFAULT_TTL = {
  COURSE_LIST: 300,       // 5 minutes
  COURSE_DETAIL: 600,     // 10 minutes
  TRENDING: 180,          // 3 minutes
  CATEGORIES: 900,        // 15 minutes
  SUGGESTIONS: 120,       // 2 minutes
  RECOMMENDATIONS: 300,   // 5 minutes
  CREDENTIAL_DETAIL: 86400, // 24 hours
  CREDENTIAL_LIST: 60,    // 1 minute
};

/** Prefixes for cache keys to avoid collisions */
const KEY_PREFIX = {
  COURSE_LIST: 'cache:course:list:',
  COURSE_DETAIL: 'cache:course:detail:',
  TRENDING: 'cache:course:trending:',
  CATEGORIES: 'cache:course:categories',
  CATEGORY_TREE: 'cache:course:categories:tree',
  SUGGESTIONS: 'cache:course:suggestions:',
  POPULAR_SEARCHES: 'cache:course:popular_searches:',
  RECOMMENDATIONS: 'cache:course:recommendations:',
  SIMILAR: 'cache:course:similar:',
  CREDENTIAL: 'cache:credential:detail:',
  CREDENTIAL_LIST: 'cache:credential:list:',
};

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  errors: number;
  lastError?: string;
}

export interface CourseCacheOptions {
  ttl?: number;
  tags?: string[];
}

class CourseCacheService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  /**
   * In-flight getOrSet fetches keyed by cache key.
   * Used to coalesce concurrent cache misses (prevents cache stampede on cold start).
   */
  private pendingFetches = new Map<string, Promise<unknown>>();

  public metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    invalidations: 0,
    errors: 0,
  };

  /**
   * Public initialization — connect to Redis with retry and fallback support.
   * Safe to call multiple times; subsequent calls are no-ops.
   */
  async init(): Promise<void> {
    // Avoid multiple concurrent connection attempts
    if (this.connectionPromise) return this.connectionPromise;
    if (this.isConnected) return;

    this.connectionPromise = this._doConnect();
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async _doConnect(): Promise<void> {
    try {
      const url = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              logger.warn('Redis cache: max reconnection attempts reached, operating without cache');
              return false; // Stop reconnecting
            }
            const delay = Math.min(retries * 500, 3000);
            logger.info(`Redis cache: reconnecting in ${delay}ms (attempt ${retries})`);
            return delay;
          },
          connectTimeout: 5000,
        },
      }) as RedisClientType;

      this.client.on('error', (err: Error) => {
        this.metrics.errors++;
        this.metrics.lastError = err.message;
        logger.warn(`Redis cache error (non-fatal): ${err.message}`);
      });

      this.client.on('connect', () => {
        logger.info('Redis cache: connected');
      });

      this.client.on('ready', () => {
        this.isConnected = true;
        logger.info('Redis cache: ready');
      });

      this.client.on('end', () => {
        this.isConnected = false;
        logger.info('Redis cache: connection closed');
      });

      await this.client.connect();
      this.isConnected = true;
      logger.info('Course cache service connected to Redis');
    } catch (error: any) {
      this.isConnected = false;
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      logger.warn(`Redis cache unavailable, operating without cache: ${error.message}`);
      // Don't throw — allow the app to function without cache
    }
  }

  /**
   * Check if the cache is available.
   */
  isAvailable(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get a cached value. Returns null on cache miss or error.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) {
      this.metrics.misses++;
      return null;
    }

    try {
      const raw = await this.client!.get(key);
      if (raw === null) {
        this.metrics.misses++;
        return null;
      }
      this.metrics.hits++;
      return JSON.parse(raw) as T;
    } catch (error: any) {
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      logger.warn(`Cache get error for key ${key}: ${error.message}`);
      this.metrics.misses++;
      return null; // Graceful fallback
    }
  }

  /**
   * Set a cached value with optional TTL override.
   */
  async set<T>(key: string, value: T, options?: CourseCacheOptions): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const ttl = options?.ttl ?? DEFAULT_TTL.COURSE_LIST;
      const serialized = JSON.stringify(value);
      await this.client!.set(key, serialized, { EX: ttl });
      this.metrics.sets++;
    } catch (error: any) {
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      logger.warn(`Cache set error for key ${key}: ${error.message}`);
      // Don't throw — cache failures shouldn't break the app
    }
  }

  /**
   * Get-or-set pattern: retrieve from cache, or compute & store.
   * Concurrent misses for the same key are coalesced into a single factory call,
   * protecting against cache stampedes on cold start / TTL expiry.
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CourseCacheOptions,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      logger.debug(`Cache HIT for key: ${key.substring(0, 50)}`);
      return cached;
    }

    // Single-flight: if another request is already computing this key, reuse it.
    const inFlight = this.pendingFetches.get(key);
    if (inFlight) {
      logger.debug(`Cache STAMPEDE guard: coalescing request for key: ${key.substring(0, 50)}`);
      return inFlight as Promise<T>;
    }

    logger.debug(`Cache MISS for key: ${key.substring(0, 50)}`);
    const promise = (async () => {
      const value = await factory();
      await this.set(key, value, options);
      return value;
    })();

    this.pendingFetches.set(key, promise);
    try {
      return await promise;
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  // ── Credential helpers ────────────────────────────────────────────────────

  /**
   * Get a cached credential by ID. Returns null on miss or cache error.
   */
  async getCredential<T = any>(credentialId: string): Promise<T | null> {
    return this.get<T>(KEY_PREFIX.CREDENTIAL + credentialId);
  }

  /**
   * Cache a credential (write-through). Uses a 24h TTL by default.
   */
  async setCredential(credential: any, options?: CourseCacheOptions): Promise<void> {
    const credentialId = credential?.credentialId;
    if (!credentialId) return;
    await this.set(KEY_PREFIX.CREDENTIAL + credentialId, credential, {
      ttl: options?.ttl ?? DEFAULT_TTL.CREDENTIAL_DETAIL,
    });
  }

  /**
   * Invalidate a single credential cache entry.
   */
  async invalidateCredential(credentialId: string): Promise<void> {
    await this.invalidate(KEY_PREFIX.CREDENTIAL + credentialId);
  }

  /**
   * Invalidate all credential-related caches (details + lists).
   * Called when a credential is created, released, or revoked.
   */
  async invalidateAllCredentialCaches(): Promise<void> {
    await this.invalidatePattern('cache:credential:*');
    logger.info('All credential caches invalidated');
  }

  /**
   * Invalidate (delete) a specific cache entry.
   */
  async invalidate(key: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      await this.client!.del(key);
      this.metrics.invalidations++;
    } catch (error: any) {
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      logger.warn(`Cache invalidation error for key ${key}: ${error.message}`);
    }
  }

  /**
   * Invalidate multiple related cache entries by pattern.
   * Uses SCAN to find and delete matching keys.
   */
  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      let cursor = 0;
      let deleted = 0;
      do {
        const result = await this.client!.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await this.client!.del(result.keys);
          deleted += result.keys.length;
        }
      } while (cursor !== 0);

      this.metrics.invalidations += deleted;
      if (deleted > 0) {
        logger.debug(`Invalidated ${deleted} cache entries matching pattern: ${pattern}`);
      }
    } catch (error: any) {
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      logger.warn(`Cache pattern invalidation error: ${error.message}`);
    }
  }

  /**
   * Warm the cache by pre-populating frequently accessed course data.
   * Called after course creation or update.
   */
  async warmCourseListCache(courses: any[]): Promise<void> {
    if (!this.isAvailable()) return;
    await this.set(KEY_PREFIX.COURSE_LIST + 'default', courses, { ttl: DEFAULT_TTL.COURSE_LIST });
    logger.info(`Cache warmed: ${courses.length} courses in listing cache`);
  }

  /**
   * Invalidate all course-related caches.
   * Called when a course is created, updated, or deleted.
   */
  async invalidateAllCourseCaches(): Promise<void> {
    await this.invalidatePattern('cache:course:*');
    logger.info('All course caches invalidated');
  }

  /**
   * Get cache hit rate as a percentage.
   */
  getHitRate(): number {
    const total = this.metrics.hits + this.metrics.misses;
    if (total === 0) return 0;
    return Math.round((this.metrics.hits / total) * 100);
  }

  /**
   * Get a summary of cache metrics for monitoring.
   */
  getMetricsSummary() {
    return {
      ...this.metrics,
      hitRate: this.getHitRate(),
      isConnected: this.isConnected,
    };
  }

  /**
   * Health check for the cache service.
   */
  async healthCheck(): Promise<{ status: string; latency?: number }> {
    if (!this.isAvailable()) {
      return { status: 'disconnected' };
    }

    try {
      const start = Date.now();
      await this.client!.ping();
      const latency = Date.now() - start;
      return { status: 'connected', latency };
    } catch (error: any) {
      return { status: 'error' };
    }
  }

  /**
   * Graceful shutdown — disconnect Redis client.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
        this.isConnected = false;
        logger.info('Course cache service disconnected from Redis');
      } catch (error: any) {
        logger.warn(`Error disconnecting course cache: ${error.message}`);
      }
    }
  }
}

// Singleton instance
const courseCacheService = new CourseCacheService();

// Auto-connect on import (non-blocking)
courseCacheService.init().catch(() => {
  // Connection failure already logged; app continues without cache
});

export default courseCacheService;
export { CourseCacheService, DEFAULT_TTL, KEY_PREFIX };
