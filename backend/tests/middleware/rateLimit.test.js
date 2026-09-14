const express = require('express');
const request = require('supertest');
const redisConfig = require('../../src/config/redis');
const {
  authLimiter,
  contentWriteLimiter,
  readLimiter,
  publicRateLimitTiers,
} = require('../../src/middleware/rateLimiter');

const clearRateLimitKeys = async () => {
  const keys = await redisConfig.client.keys('rl:*');
  if (keys.length > 0) {
    await redisConfig.client.del(keys);
  }
};

const createTestApp = (limiter, handler = (_req, res) => res.json({ success: true })) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-user-id']) {
      req.user = { id: req.headers['x-user-id'], role: 'student' };
    }
    next();
  });
  app.all('/limited', limiter, handler);
  return app;
};

// Clear counters before every test in this file so counters never leak
// between describe blocks.
beforeEach(async () => {
  await clearRateLimitKeys();
});

describe('Public API rate limiting middleware', () => {
  beforeAll(async () => {
    if (!redisConfig.isConnected) {
      await redisConfig.initialize();
    }
  });

  afterAll(async () => {
    await redisConfig.disconnect();
  });

  test('defines the maintainer-requested public tiers', () => {
    expect(publicRateLimitTiers.strict).toMatchObject({
      windowMs: 60 * 1000,
      max: 5,
      keyByUser: false,
    });
    expect(publicRateLimitTiers.moderate).toMatchObject({
      windowMs: 60 * 1000,
      max: 30,
      keyByUser: true,
    });
    expect(publicRateLimitTiers.liberal).toMatchObject({
      windowMs: 60 * 1000,
      max: 100,
      keyByUser: false,
    });
  });

  test('enforces strict auth limits at 5 requests per minute per IP with X-RateLimit headers', async () => {
    const app = createTestApp(authLimiter);

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).post('/limited').set('x-test-security', 'true');
      expect(response.status).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBe('5');
    }

    const blocked = await request(app).post('/limited').set('x-test-security', 'true');

    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      message: 'Too many authentication attempts, please try again after a minute',
    });
    expect(blocked.headers['x-ratelimit-limit']).toBe('5');
  });

  test('enforces moderate content write limits per authenticated user', async () => {
    const app = createTestApp(contentWriteLimiter);

    for (let i = 0; i < 30; i += 1) {
      const response = await request(app)
        .post('/limited')
        .set('x-test-security', 'true')
        .set('x-user-id', 'user-a');
      expect(response.status).toBe(200);
    }

    const blocked = await request(app)
      .post('/limited')
      .set('x-test-security', 'true')
      .set('x-user-id', 'user-a');

    const otherUser = await request(app)
      .post('/limited')
      .set('x-test-security', 'true')
      .set('x-user-id', 'user-b');

    expect(blocked.status).toBe(429);
    expect(blocked.headers['x-ratelimit-limit']).toBe('30');
    expect(otherUser.status).toBe(200);
  });

  test('enforces liberal read limits at 100 requests per minute per IP', async () => {
    const app = createTestApp(readLimiter);

    for (let i = 0; i < 100; i += 1) {
      const response = await request(app).get('/limited').set('x-test-security', 'true');
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).get('/limited').set('x-test-security', 'true');

    expect(blocked.status).toBe(429);
    expect(blocked.headers['x-ratelimit-limit']).toBe('100');
  });
});

describe('Rate limit response headers (Issue #292)', () => {
  test('429 responses include a Retry-After header in seconds', async () => {
    const app = createTestApp(authLimiter);

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).post('/limited').set('x-test-security', 'true');
      expect(response.status).toBe(200);
    }

    const blocked = await request(app).post('/limited').set('x-test-security', 'true');

    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('X-RateLimit headers report limit and remaining on success and block', async () => {
    const app = createTestApp(authLimiter);

    const first = await request(app).post('/limited').set('x-test-security', 'true');
    expect(first.status).toBe(200);
    expect(first.headers['x-ratelimit-limit']).toBe('5');
    expect(first.headers['x-ratelimit-remaining']).toBe('4');

    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/limited').set('x-test-security', 'true');
    }

    const blocked = await request(app).post('/limited').set('x-test-security', 'true');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['x-ratelimit-remaining']).toBe('0');
  });
});

describe('Client IP spoofing protection (Issue #292)', () => {
  test('forged X-Forwarded-For headers cannot create fresh counters by default', async () => {
    delete process.env.RATE_LIMIT_TRUST_PROXY;
    const app = createTestApp(authLimiter);

    // Each request spoofs a different client IP; with header trust disabled
    // they must all map to the same socket-address key and exhaust the limit.
    for (let i = 0; i < 5; i += 1) {
      const response = await request(app)
        .post('/limited')
        .set('x-test-security', 'true')
        .set('X-Forwarded-For', `1.2.3.${i}`);
      expect(response.status).toBe(200);
    }

    const blocked = await request(app)
      .post('/limited')
      .set('x-test-security', 'true')
      .set('X-Forwarded-For', '9.9.9.9');
    expect(blocked.status).toBe(429);
  });

  test('invalid X-Forwarded-For entries fall back to the socket address', async () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '1';
    try {
      const { getClientIp } = require('../../src/middleware/rateLimiter');
      const req = {
        headers: { 'x-forwarded-for': 'not-an-ip, 10.0.0.1' },
        ip: '::ffff:127.0.0.1',
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      };
      // The garbage entry is discarded; the valid entry is honoured.
      expect(getClientIp(req)).toBe('10.0.0.1');

      const garbageOnly = {
        headers: { 'x-forwarded-for': 'garbage, also-garbage' },
        ip: '::ffff:127.0.0.1',
        socket: { remoteAddress: '::ffff:127.0.0.1' },
      };
      expect(getClientIp(garbageOnly)).toBe('::ffff:127.0.0.1');
    } finally {
      delete process.env.RATE_LIMIT_TRUST_PROXY;
    }
  });

  test('RATE_LIMIT_TRUST_PROXY=1 honours X-Forwarded-For per client IP', async () => {
    process.env.RATE_LIMIT_TRUST_PROXY = '1';
    try {
      const { createRateLimiter } = require('../../src/middleware/rateLimiter');
      const limiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 2,
        keyPrefix: 'rl:test-trust:',
        keyByUser: false,
      });
      const app = createTestApp(limiter);

      await request(app).post('/limited').set('x-test-security', 'true').set('X-Forwarded-For', '10.0.0.1');
      await request(app).post('/limited').set('x-test-security', 'true').set('X-Forwarded-For', '10.0.0.2');
      await request(app).post('/limited').set('x-test-security', 'true').set('X-Forwarded-For', '10.0.0.1');

      const blocked = await request(app).post('/limited').set('x-test-security', 'true').set('X-Forwarded-For', '10.0.0.1');
      expect(blocked.status).toBe(429);

      // A different client keeps its own independent counter.
      const otherClient = await request(app).post('/limited').set('x-test-security', 'true').set('X-Forwarded-For', '10.0.0.2');
      expect(otherClient.status).toBe(200);
    } finally {
      delete process.env.RATE_LIMIT_TRUST_PROXY;
    }
  });
});

describe('rateLimit.ts distributed middleware (Issue #292)', () => {
  test('counters are per-route and per-IP and backed by Redis', async () => {
    const { rateLimitMiddleware } = require('../../src/middleware/rateLimit');
    const app = express();
    app.use(express.json());
    const handler = (_req, res) => res.json({ success: true });
    app.post('/route-a', rateLimitMiddleware({ max: 2, windowMs: 60 * 1000 }), handler);
    app.post('/route-b', rateLimitMiddleware({ max: 2, windowMs: 60 * 1000 }), handler);

    await request(app).post('/route-a').set('x-test-security', 'true');
    await request(app).post('/route-a').set('x-test-security', 'true');
    const blockedA = await request(app).post('/route-a').set('x-test-security', 'true');
    expect(blockedA.status).toBe(429);

    // An unrelated route keeps an independent bucket.
    const routeB = await request(app).post('/route-b').set('x-test-security', 'true');
    expect(routeB.status).toBe(200);

    // Counters live in Redis under the shared prefix (distributed store).
    const keys = await redisConfig.client.keys('rl:ts:*');
    expect(keys.length).toBeGreaterThan(0);
  });
});

describe('Global limiter registration (Issue #292)', () => {
  test('index.js registers globalLimiter exactly once (no double counting)', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/index.js'),
      'utf8',
    );
    const appLevel = (source.match(/app\.use\(globalLimiter\)/g) || []).length;
    expect(appLevel).toBe(1);
    expect(source).not.toMatch(/v1Router\.use\(globalLimiter\)/);
  });
});
