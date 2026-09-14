// eslint-disable-next-line @typescript-eslint/no-var-requires
const net = require('net');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rateLimit = require('express-rate-limit');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const redisConfig = require('../config/redis');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const securityConfig = require('../config/security');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const logger = require('../utils/logger');

const ONE_MINUTE = 60 * 1000;

/**
 * Number of trusted reverse-proxy hops in front of the application, read from
 * the `RATE_LIMIT_TRUST_PROXY` environment variable on every call so tests and
 * operators can change it without a restart.
 *
 * - `0` (default, or `false`/empty): the `X-Forwarded-For` header is NEVER
 *   consulted. Keys are derived from the direct socket address (`req.ip`), so a
 *   client cannot rotate spoofed headers to evade rate limits.
 * - `N > 0` (`true`/`1` means 1 hop): the client address is taken from the Nth
 *   entry from the right of the `X-Forwarded-For` chain, which is the standard
 *   algorithm when N trusted proxies sit in front of the app. Only enable this
 *   when every proxy is under your control and sanitizes incoming headers.
 *
 * @returns {number} number of trusted proxy hops (0 disables header trust)
 */
const getTrustedProxyHops = () => {
  const raw = process.env.RATE_LIMIT_TRUST_PROXY;
  if (raw === undefined || raw === null || raw === '') return 0;
  if (raw === 'true' || raw === '1') return 1;
  if (raw === 'false' || raw === '0') return 0;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
};

/**
 * Returns true when `value` is a syntactically valid IPv4 or IPv6 address.
 * Used to discard forged or malformed `X-Forwarded-For` entries.
 */
const isValidIp = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 45) return false;
  return net.isIP(value.trim()) !== 0;
};

/**
 * Resolves the effective client IP used for rate-limit keying, guarding
 * against proxy/header spoofing:
 *
 * - By default the `X-Forwarded-For` header is ignored entirely and the direct
 *   socket address is used, so spoofed headers cannot create fresh counters.
 * - When `RATE_LIMIT_TRUST_PROXY` is configured, the header chain is only
 *   honored for entries that pass `net.isIP()` validation; anything else falls
 *   back to the direct socket address.
 */
const getClientIp = (req) => {
  const trustedProxyHops = getTrustedProxyHops();
  if (trustedProxyHops > 0) {
    const xff = req.headers && req.headers['x-forwarded-for'];
    if (typeof xff === 'string') {
      const chain = xff.split(',').map((entry) => entry.trim()).filter(isValidIp);
      if (chain.length > 0) {
        // Each trusted proxy appends the peer it saw, so the client address is
        // the (hops + 1)-th entry from the right; shorter chains fall back to
        // the leftmost (original client) entry.
        const index = Math.max(chain.length - trustedProxyHops - 1, 0);
        return chain[index];
      }
    }
  }
  const direct = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  return isValidIp(direct) ? direct : 'unknown';
};

const publicRateLimitTiers = {
  strict: {
    windowMs: ONE_MINUTE,
    max: 5,
    message: 'Too many authentication attempts, please try again after a minute',
    keyPrefix: 'rl:public:strict:',
    keyByUser: false,
  },
  moderate: {
    windowMs: ONE_MINUTE,
    max: 30,
    message: 'Too many content write requests, please try again after a minute',
    keyPrefix: 'rl:public:moderate:',
    keyByUser: true,
  },
  liberal: {
    windowMs: ONE_MINUTE,
    max: 100,
    message: 'Too many read requests, please try again after a minute',
    keyPrefix: 'rl:public:liberal:',
    keyByUser: false,
  },
};

/**
 * Custom Simple Redis Store for express-rate-limit
 */
class RedisStore {
  constructor(options = {}) {
    this.prefix = options.prefix || 'rl:';
    this.expiry = options.expiry || 60; // default 60 seconds
  }

  async increment(key) {
    const fullKey = this.prefix + key;
    try {
      // Atomic fixed-window counter:
      // 1. SET ... NX anchors the TTL to the first request of the window.
      // 2. INCRBY counts the hit.
      // 3. TTL returns the seconds remaining, giving an accurate reset time
      //    for the Retry-After / X-RateLimit-Reset headers.
      const multi = redisConfig.client.multi();
      multi.set(fullKey, 0, { EX: this.expiry, NX: true });
      multi.incrBy(fullKey, 1);
      multi.ttl(fullKey);
      const results = await multi.exec();

      const currentCount = Array.isArray(results[1]) ? results[1][1] : results[1];
      const ttlSeconds = Array.isArray(results[2]) ? results[2][1] : this.expiry;

      return {
        totalHits: Number(currentCount) || 0,
        resetTime: new Date(Date.now() + (Number(ttlSeconds) || this.expiry) * 1000)
      };
    } catch (error) {
      logger.error(`RedisStore error for key ${fullKey}:`, error);
      // Fail open: if Redis is unavailable, do not block traffic.
      return { totalHits: 0, resetTime: new Date() };
    }
  }

  async decrement(key) {
    const fullKey = this.prefix + key;
    try {
      await redisConfig.client.decr(fullKey);
    } catch (error) {
      logger.error(`RedisStore decrement error for key ${fullKey}:`, error);
    }
  }

  async resetKey(key) {
    const fullKey = this.prefix + key;
    try {
      await redisConfig.client.del(fullKey);
    } catch (error) {
      logger.error(`RedisStore resetKey error for key ${fullKey}:`, error);
    }
  }
}

/**
 * Factory for creating rate limiters with custom Redis store
 */
const createRateLimiter = (options = {}) => {
  const {
    windowMs = securityConfig.tiers.default.windowMs,
    max = securityConfig.tiers.default.max,
    message = securityConfig.tiers.default.message,
    keyPrefix = 'rl:',
    keyByUser = true,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const securityService = require('../services/securityService');

  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message,
    },
    standardHeaders: true,
    legacyHeaders: true,
    store: new RedisStore({
      prefix: keyPrefix,
      expiry: Math.ceil(windowMs / 1000),
    }),
    handler: (req, res, next, options) => {
      const clientIp = getClientIp(req);
      logger.warn(`Rate limit exceeded: ${clientIp} - ${req.method} ${req.path}`);
      
      // Log security event for rate limit breach
      securityService.logSecurityEvent(clientIp, 'rate_limit_exceeded', {
        path: req.path,
        method: req.method,
        prefix: keyPrefix,
        user: req.user ? req.user.id : 'anonymous'
      });

      res.status(options.statusCode).send(options.message);
    },
    keyGenerator: (req) => {
      if (keyByUser && req.user && (req.user.id || req.user.sub || req.user.userId)) {
        return `user:${req.user.id || req.user.sub || req.user.userId}`;
      }
      return `ip:${getClientIp(req)}`;
    },
    skip: (req) => {
      // Skip whitelisted IPs or in test environment (unless explicitly testing security)
      if (process.env.NODE_ENV === 'test' && req.headers['x-test-security'] === 'true') {
        return false;
      }
      return securityConfig.whitelist.includes(getClientIp(req)) || process.env.NODE_ENV === 'test';
    }
  });
};

// Global rate limiter
const globalLimiter = createRateLimiter({
  windowMs: securityConfig.tiers.default.windowMs,
  max: securityConfig.tiers.default.max,
  keyPrefix: 'rl:global:',
});

// Tier-based limiters (to be used after authentication)
const studentLimiter = createRateLimiter({
  windowMs: securityConfig.tiers.student.windowMs,
  max: securityConfig.tiers.student.max,
  message: securityConfig.tiers.student.message,
  keyPrefix: 'rl:student:',
});

const instructorLimiter = createRateLimiter({
  windowMs: securityConfig.tiers.instructor.windowMs,
  max: securityConfig.tiers.instructor.max,
  message: securityConfig.tiers.instructor.message,
  keyPrefix: 'rl:instructor:',
});

const adminLimiter = createRateLimiter({
  windowMs: securityConfig.tiers.admin.windowMs,
  max: securityConfig.tiers.admin.max,
  message: securityConfig.tiers.admin.message,
  keyPrefix: 'rl:admin:',
});

// Endpoint-specific limiters
const authLimiter = createRateLimiter({
  ...publicRateLimitTiers.strict,
  keyPrefix: 'rl:auth:',
});

const transactionLimiter = createRateLimiter({
  windowMs: securityConfig.endpoints.transactions.windowMs,
  max: securityConfig.endpoints.transactions.max,
  message: securityConfig.endpoints.transactions.message,
  keyPrefix: 'rl:tx:',
});

const ipfsLimiter = createRateLimiter({
  windowMs: securityConfig.endpoints.ipfs.windowMs,
  max: securityConfig.endpoints.ipfs.max,
  message: securityConfig.endpoints.ipfs.message,
  keyPrefix: 'rl:ipfs:',
});

const strictLimiter = createRateLimiter(publicRateLimitTiers.strict);

const moderateLimiter = createRateLimiter(publicRateLimitTiers.moderate);

const liberalLimiter = createRateLimiter(publicRateLimitTiers.liberal);

const contentWriteLimiter = createRateLimiter({
  ...publicRateLimitTiers.moderate,
  keyPrefix: 'rl:content:write:',
});

const readLimiter = createRateLimiter({
  ...publicRateLimitTiers.liberal,
  keyPrefix: 'rl:public:read:',
});

const searchWriteLimiter = createRateLimiter({
  ...publicRateLimitTiers.moderate,
  keyPrefix: 'rl:search:write:',
});

const courseWriteLimiter = createRateLimiter({
  ...publicRateLimitTiers.moderate,
  keyPrefix: 'rl:courses:write:',
});

// Issue #17: Endpoint-specific limiters per the security best-practice guidance.
// Each feature uses an independent Redis key prefix so counters don't bleed.
const loginLimiter = (() => {
  const rest = securityConfig.endpoints.login;
  return createRateLimiter({
    ...rest,
    keyPrefix: 'rl:login:',
    keyByUser: false,
  });
})();

const registerLimiter = (() => {
  const rest = securityConfig.endpoints.register;
  return createRateLimiter({
    ...rest,
    keyPrefix: 'rl:register:',
    keyByUser: false,
  });
})();

const paymentLimiter = (() => {
  const rest = securityConfig.endpoints.payment;
  return createRateLimiter({
    ...rest,
    keyPrefix: 'rl:payment:',
    keyByUser: true,
  });
})();

// Admin endpoint-specific limit: authenticated admins get a generous limit;
// anonymous traffic hitting the admin routes is met with a stricter limit.
//
// Note: There is also a role-based `adminLimiter` above used by
// `tieredRateLimiter`. We deliberately give this limiter a different
// Redis key prefix (`rl:admin:ep:`) so its counter is independent.
const adminEndpointLimiter = (() => {
  const rest = securityConfig.endpoints.admin;
  return createRateLimiter({
    ...rest,
    keyPrefix: 'rl:admin:ep:',
    keyByUser: true,
  });
})();

const adminAnonymousLimiter = (() => {
  const rest = securityConfig.endpoints.adminAnonymous;
  return createRateLimiter({
    ...rest,
    keyPrefix: 'rl:admin:anon:',
    keyByUser: false,
  });
})();

/**
 * Selects the right admin limiter based on request authentication.
 * Authenticated admins get the higher tier; anonymous calls get the stricter one.
 */
const adminTierLimiter = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return adminEndpointLimiter(req, res, next);
  }
  return adminAnonymousLimiter(req, res, next);
};

/**
 * Middleware to select rate limiter based on user role
 */
const tieredRateLimiter = (req, res, next) => {
  // If not authenticated, use global limiter by IP
  if (!req.user) {
    return globalLimiter(req, res, next);
  }

  // If authenticated, use role-based limiter which now uses UserID in keyGenerator
  const role = req.user.role;
  if (role === 'admin') {
    return adminLimiter(req, res, next);
  } else if (role === 'instructor' || role === 'educator') {
    return instructorLimiter(req, res, next);
  } else if (role === 'student') {
    return studentLimiter(req, res, next);
  } else {
    return globalLimiter(req, res, next);
  }
};

module.exports = {
  globalLimiter,
  tieredRateLimiter,
  authLimiter,
  transactionLimiter,
  ipfsLimiter,
  strictLimiter,
  moderateLimiter,
  liberalLimiter,
  contentWriteLimiter,
  readLimiter,
  searchWriteLimiter,
  courseWriteLimiter,
  // Issue #17: Endpoint-specific limiters.
  loginLimiter,
  registerLimiter,
  paymentLimiter,
  adminEndpointLimiter,
  adminAnonymousLimiter,
  adminTierLimiter,
  publicRateLimitTiers,
  createRateLimiter,
  RedisStore,
  getClientIp,
  isValidIp
};
