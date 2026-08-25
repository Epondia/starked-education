/**
 * Rate Limiting Middleware
 * Provides rate limiting functionality for API endpoints
 *
 * Counters are stored in Redis via the same `RedisStore` used by
 * `rateLimiter.js`, so limits are shared across every instance of the
 * application (distributed rate limiting). Keys are derived from a validated
 * client IP plus the request route, giving independent per-route buckets that
 * still behave consistently across processes.
 */

import rateLimit from 'express-rate-limit';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { RedisStore, getClientIp } = require('./rateLimiter');

const ONE_MINUTE = 60 * 1000;

export interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export const publicRateLimitTiers = {
  strict: {
    windowMs: ONE_MINUTE,
    max: 5,
    message: 'Too many authentication attempts, please try again after a minute',
  },
  moderate: {
    windowMs: ONE_MINUTE,
    max: 30,
    message: 'Too many content write requests, please try again after a minute',
  },
  liberal: {
    windowMs: ONE_MINUTE,
    max: 100,
    message: 'Too many read requests, please try again after a minute',
  },
} as const;

export const rateLimitMiddleware = (options: RateLimitOptions) => {
  const windowMs = options.windowMs;
  return rateLimit({
    windowMs,
    max: options.max,
    message: options.message || 'Too many requests from this IP, please try again later.',
    standardHeaders: options.standardHeaders !== false, // Send rate limit info in headers
    legacyHeaders: options.legacyHeaders !== false, // Send X-RateLimit-* headers
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skipFailedRequests: options.skipFailedRequests || false,
    // Redis-backed store so counters are shared across server instances.
    store: new RedisStore({
      prefix: 'rl:ts:',
      expiry: Math.ceil(windowMs / 1000),
    }),
    // Per-route + per-IP keying: distinct endpoints keep independent counters
    // while the same endpoint stays limited across all instances.
    keyGenerator: (req) => `ip:${getClientIp(req)}:${req.method}:${req.path}`,
    skip: (req) => {
      // Skip in the test environment unless explicitly testing security, so
      // behaviour matches the main limiter in `rateLimiter.js`.
      if (process.env.NODE_ENV === 'test' && req.headers['x-test-security'] === 'true') {
        return false;
      }
      return process.env.NODE_ENV === 'test';
    },
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Predefined rate limit configurations
export const rateLimits = {
  strict: rateLimitMiddleware(publicRateLimitTiers.strict),

  moderate: rateLimitMiddleware(publicRateLimitTiers.moderate),

  liberal: rateLimitMiddleware(publicRateLimitTiers.liberal),

  auth: rateLimitMiddleware(publicRateLimitTiers.strict),

  // Strict limits for file uploads
  upload: rateLimitMiddleware({
    ...publicRateLimitTiers.moderate,
    message: 'Too many file uploads, please try again after a minute.'
  }),

  // Moderate limits for general API usage
  general: rateLimitMiddleware(publicRateLimitTiers.moderate),

  // Lenient limits for read-only operations
  readOnly: rateLimitMiddleware(publicRateLimitTiers.liberal),

  // Very lenient limits for static content
  static: rateLimitMiddleware({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
  })
};
