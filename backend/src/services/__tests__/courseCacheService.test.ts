/**
 * Course Cache Service Tests
 *
 * Covers the Redis-backed cache-aside layer used for hot course & credential reads:
 * - get/set round trips and hit/miss metrics
 * - getOrSet compute-on-miss / serve-from-cache behavior
 * - Cache stampede protection (single-flight coalescing of concurrent misses)
 * - Key invalidation (single key, pattern, all-course, all-credential)
 * - Graceful fallback when Redis is unavailable or errors
 * - Credential helpers and metrics summary
 */

import { CourseCacheService, KEY_PREFIX, DEFAULT_TTL } from '../courseCacheService';
import { createClient } from 'redis';

// Mock the redis client with an in-memory fake so no real Redis is required.
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

// Mock logger to keep test output clean
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedCreateClient = createClient as jest.Mock;

interface FakeRedis {
  client: any;
  store: Map<string, string>;
  failNext: () => void;
  failAll: () => void;
}

function createFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  let failNextCommand = false;
  let failAllCommands = false;

  const maybeThrow = () => {
    if (failAllCommands) {
      throw new Error('Redis connection lost');
    }
    if (failNextCommand) {
      failNextCommand = false;
      throw new Error('Redis connection lost');
    }
  };

  const client: any = {
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn().mockResolvedValue('OK'),
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn(async (key: string) => {
      maybeThrow();
      return store.has(key) ? store.get(key) : null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      maybeThrow();
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (keys: string | string[]) => {
      maybeThrow();
      const arr = Array.isArray(keys) ? keys : [keys];
      arr.forEach((k) => store.delete(k));
      return arr.length;
    }),
    scan: jest.fn(async (_cursor: number, opts: any) => {
      maybeThrow();
      const pattern = opts?.MATCH ?? '*';
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const keys = Array.from(store.keys()).filter((k) => regex.test(k));
      return { cursor: 0, keys };
    }),
  };

  return {
    client,
    store,
    failNext: () => {
      failNextCommand = true;
    },
    failAll: () => {
      failAllCommands = true;
    },
  };
}

describe('CourseCacheService', () => {
  let service: CourseCacheService;
  let fake: FakeRedis;

  beforeEach(async () => {
    fake = createFakeRedis();
    mockedCreateClient.mockReturnValue(fake.client);
    service = new CourseCacheService();
    await service.init();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  // ─── get / set ────────────────────────────────────────────────────────────

  describe('get / set', () => {
    it('stores and retrieves values, tracking hit metrics', async () => {
      await service.set('cache:course:detail:c1', { id: 'c1' }, { ttl: 60 });

      const value = await service.get('cache:course:detail:c1');
      expect(value).toEqual({ id: 'c1' });
      expect(service.metrics.hits).toBe(1);
      expect(service.metrics.misses).toBe(0);
    });

    it('returns null on a miss and records a miss metric', async () => {
      const value = await service.get('cache:course:detail:missing');
      expect(value).toBeNull();
      expect(service.metrics.misses).toBe(1);
      expect(service.metrics.hits).toBe(0);
    });

    it('returns null (no throw) when the client is unavailable', async () => {
      await service.disconnect();
      expect(service.isAvailable()).toBe(false);

      const value = await service.get('cache:course:detail:c1');
      expect(value).toBeNull();
      expect(service.metrics.misses).toBe(1);
    });
  });

  // ─── getOrSet ─────────────────────────────────────────────────────────────

  describe('getOrSet', () => {
    it('computes on miss and serves from cache on subsequent calls', async () => {
      const factory = jest.fn().mockResolvedValue({ items: [1, 2, 3] });

      const first = await service.getOrSet('cache:course:list:test', factory, { ttl: 60 });
      expect(first).toEqual({ items: [1, 2, 3] });
      expect(factory).toHaveBeenCalledTimes(1);

      const second = await service.getOrSet('cache:course:list:test', factory, { ttl: 60 });
      expect(second).toEqual({ items: [1, 2, 3] });
      expect(factory).toHaveBeenCalledTimes(1); // served from cache
      expect(service.metrics.hits).toBe(1);
      expect(service.metrics.misses).toBe(1);
    });

    it('coalesces concurrent misses for the same key (stampede protection)', async () => {
      let calls = 0;
      const factory = jest.fn().mockImplementation(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { value: calls };
      });

      const [a, b] = await Promise.all([
        service.getOrSet('cache:course:list:hot', factory, { ttl: 60 }),
        service.getOrSet('cache:course:list:hot', factory, { ttl: 60 }),
      ]);

      expect(a).toEqual({ value: 1 });
      expect(b).toEqual({ value: 1 });
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('still returns the computed value when Redis fails (graceful degradation)', async () => {
      // Break the store so both the read (miss path) and the write fail
      fake.failAll();

      const result = await service.getOrSet(
        'cache:course:list:fallback',
        async () => ({ items: [1] }),
        { ttl: 60 },
      );

      expect(result).toEqual({ items: [1] });
      expect(service.metrics.errors).toBeGreaterThan(0);
    });
  });

  // ─── Invalidation ─────────────────────────────────────────────────────────

  describe('invalidation', () => {
    it('invalidates a single key', async () => {
      await service.set('cache:course:detail:c1', { id: 'c1' });
      await service.invalidate('cache:course:detail:c1');

      expect(await service.get('cache:course:detail:c1')).toBeNull();
      expect(service.metrics.invalidations).toBe(1);
    });

    it('invalidates all keys matching a pattern', async () => {
      await service.set('cache:course:list:1', { a: 1 });
      await service.set('cache:course:list:2', { a: 2 });
      await service.set('cache:credential:detail:cred-1', { b: 1 });

      await service.invalidatePattern('cache:course:*');

      expect(await service.get('cache:course:list:1')).toBeNull();
      expect(await service.get('cache:course:list:2')).toBeNull();
      expect(await service.get('cache:credential:detail:cred-1')).toEqual({ b: 1 });
    });

    it('invalidates all course caches while leaving credential caches intact', async () => {
      await service.set(KEY_PREFIX.COURSE_LIST + 'x', { a: 1 });
      await service.set(KEY_PREFIX.CREDENTIAL + 'cred-1', { b: 1 });

      await service.invalidateAllCourseCaches();

      expect(await service.get(KEY_PREFIX.COURSE_LIST + 'x')).toBeNull();
      expect(await service.get(KEY_PREFIX.CREDENTIAL + 'cred-1')).toEqual({ b: 1 });

      await service.invalidateAllCredentialCaches();
      expect(await service.get(KEY_PREFIX.CREDENTIAL + 'cred-1')).toBeNull();
    });
  });

  // ─── Graceful fallback ────────────────────────────────────────────────────

  describe('graceful fallback', () => {
    it('returns null without throwing when a read errors', async () => {
      fake.failNext();

      const value = await service.get('cache:course:detail:c1');
      expect(value).toBeNull();
      expect(service.metrics.errors).toBeGreaterThan(0);
      expect(service.metrics.lastError).toBe('Redis connection lost');
    });

    it('does not throw when a write errors', async () => {
      fake.failNext();

      await expect(service.set('cache:course:detail:c1', { id: 'c1' })).resolves.toBeUndefined();
      expect(service.metrics.errors).toBeGreaterThan(0);
    });
  });

  // ─── Credential helpers ───────────────────────────────────────────────────

  describe('credential helpers', () => {
    it('stores, reads, and invalidates credentials under the credential prefix', async () => {
      const credential = { credentialId: 'cred-1', recipient: 'R1', isReleased: false };

      await service.setCredential(credential);
      const cached = await service.getCredential('cred-1');
      expect(cached).toEqual(credential);

      await service.invalidateCredential('cred-1');
      expect(await service.getCredential('cred-1')).toBeNull();
    });

    it('uses the credential detail TTL by default', async () => {
      const credential = { credentialId: 'cred-2' };
      await service.setCredential(credential);

      const [, , options] = fake.client.set.mock.calls[0];
      expect(options).toEqual({ EX: DEFAULT_TTL.CREDENTIAL_DETAIL });
    });
  });

  // ─── Metrics ──────────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('exposes hit rate and a full metrics summary', async () => {
      await service.set('cache:course:list:k1', { v: 1 });
      await service.get('cache:course:list:k1'); // hit
      await service.get('cache:course:list:k1'); // hit
      await service.get('cache:course:list:missing'); // miss

      const summary = service.getMetricsSummary();
      expect(summary.hits).toBe(2);
      expect(summary.misses).toBe(1);
      expect(summary.hitRate).toBe(67); // 2/3 rounded
      expect(summary.isConnected).toBe(true);
    });

    it('health check reports disconnected when not connected', async () => {
      await service.disconnect();
      const health = await service.healthCheck();
      expect(health.status).toBe('disconnected');
    });
  });
});
