/**
 * Tests for Issue #17: rate limit endpoint configuration and wiring.
 *
 * These tests deliberately avoid an active Redis connection so the suite
 * can run in CI environments without Redis. They verify the security
 * config buckets and the middleware module exports that Issue #17 requires.
 */

describe('Rate limit endpoint configuration (Issue #17)', () => {
  let securityConfig;

  beforeAll(() => {
    // Ensure any env overrides for the file don't leak in elsewhere.
    delete process.env.RL_LOGIN_WINDOW_MS;
    delete process.env.RL_LOGIN_MAX;
    delete process.env.RL_REGISTER_WINDOW_MS;
    delete process.env.RL_REGISTER_MAX;
    delete process.env.RL_PAYMENT_WINDOW_MS;
    delete process.env.RL_PAYMENT_MAX;
    delete process.env.RL_ADMIN_WINDOW_MS;
    delete process.env.RL_ADMIN_MAX;
    delete process.env.RL_ADMIN_ANON_WINDOW_MS;
    delete process.env.RL_ADMIN_ANON_MAX;
    securityConfig = require('../../src/config/security');
  });

  test('login endpoint: 5 max per 15-minute window keyed by IP', () => {
    expect(securityConfig.endpoints.login.max).toBe(5);
    expect(securityConfig.endpoints.login.windowMs).toBe(15 * 60 * 1000);
    expect(securityConfig.endpoints.login.keyByUser).toBe(false);
  });

  test('register endpoint: 3 accounts per hour keyed by IP', () => {
    expect(securityConfig.endpoints.register.max).toBe(3);
    expect(securityConfig.endpoints.register.windowMs).toBe(60 * 60 * 1000);
    expect(securityConfig.endpoints.register.keyByUser).toBe(false);
  });

  test('payment endpoint: 10 per minute keyed by authenticated user', () => {
    expect(securityConfig.endpoints.payment.max).toBe(10);
    expect(securityConfig.endpoints.payment.windowMs).toBe(1 * 60 * 1000);
    expect(securityConfig.endpoints.payment.keyByUser).toBe(true);
  });

  test('admin endpoint: 100 per minute for authenticated admins', () => {
    expect(securityConfig.endpoints.admin.max).toBe(100);
    expect(securityConfig.endpoints.admin.windowMs).toBe(1 * 60 * 1000);
    expect(securityConfig.endpoints.admin.keyByUser).toBe(true);
  });

  test('admin anonymous fallback limit is at most 20 per minute', () => {
    expect(securityConfig.endpoints.adminAnonymous.max).toBeLessThanOrEqual(20);
    expect(securityConfig.endpoints.adminAnonymous.windowMs).toBe(1 * 60 * 1000);
    expect(securityConfig.endpoints.adminAnonymous.keyByUser).toBe(false);
  });

  test('admin tier grants higher limit than anonymous', () => {
    expect(securityConfig.endpoints.admin.max).toBeGreaterThan(
      securityConfig.endpoints.adminAnonymous.max,
    );
  });

  test('limits are environment-configurable via documented env vars', () => {
    process.env.RL_LOGIN_MAX = '7';
    process.env.RL_PAYMENT_MAX = '15';
    process.env.RL_ADMIN_MAX = '250';
    // jest.resetModules() drops jest's internal module registry so the next
    // require() re-evaluates the module's top-level env reads.
    jest.resetModules();
    const overridden = require('../../src/config/security');

    expect(overridden.endpoints.login.max).toBe(7);
    expect(overridden.endpoints.payment.max).toBe(15);
    expect(overridden.endpoints.admin.max).toBe(250);

    // Restore defaults for any subsequent tests in this file.
    delete process.env.RL_LOGIN_MAX;
    delete process.env.RL_PAYMENT_MAX;
    delete process.env.RL_ADMIN_MAX;
    jest.resetModules();
  });

  test('every endpoint bucket has a non-empty user-facing message', () => {
    for (const [key, bucket] of Object.entries(securityConfig.endpoints)) {
      expect(typeof bucket.message).toBe('string');
      expect(bucket.message.length).toBeGreaterThan(10);
    }
  });
});

describe('Rate limiter middleware module exports (Issue #17)', () => {
  test('exposes the new endpoint-specific limiters', () => {
    // The rateLimiter module builds middleware objects synchronously on
    // require; no network I/O happens until a request flows through, so
    // the type-of-export smoke test is enough.
    const rl = require('../../src/middleware/rateLimiter');

    expect(typeof rl.loginLimiter).toBe('function');
    expect(typeof rl.registerLimiter).toBe('function');
    expect(typeof rl.paymentLimiter).toBe('function');
    expect(typeof rl.adminEndpointLimiter).toBe('function');
    expect(typeof rl.adminAnonymousLimiter).toBe('function');
    expect(typeof rl.adminTierLimiter).toBe('function');
  });
});

describe('Route wiring for rate limiters (Issue #17)', () => {
  test('paymentRoutes imports the shared paymentLimiter', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/routes/paymentRoutes.ts'),
      'utf8',
    );
    expect(source).toMatch(/paymentLimiter/);
  });

  test('admin route applies adminTierLimiter', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/routes/admin.js'),
      'utf8',
    );
    expect(source).toMatch(/adminTierLimiter/);
  });

  test('index.js mounts /health before globalLimiter', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/index.js'),
      'utf8',
    );
    const healthIdx = source.indexOf("app.use('/health'");
    const globalIdx = source.indexOf('app.use(globalLimiter)');
    expect(healthIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeGreaterThan(healthIdx);
  });

  test('login route no longer uses authLimiter (it used loginLimiter instead)', () => {
    const source = require('fs').readFileSync(
      require.resolve('../../src/routes/auth.js'),
      'utf8',
    );
    expect(source).toMatch(/router\.post\('\/login'\s*,\s*loginLimiter/);
    expect(source).toMatch(/router\.post\('\/register'\s*,\s*registerLimiter/);
  });
});
