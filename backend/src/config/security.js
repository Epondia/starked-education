/**
 * Security and Rate Limiting Configuration
 */
const securityConfig = {
  // Rate limiting tiers based on user roles
  tiers: {
    student: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per windowMs
      message: 'Too many requests from this student account, please try again after 15 minutes',
      burst: 20,
    },
    instructor: {
      windowMs: 15 * 60 * 1000,
      max: 500,
      message: 'Too many requests from this instructor account, please try again after 15 minutes',
      burst: 50,
    },
    admin: {
      windowMs: 15 * 60 * 1000,
      max: 2000,
      message: 'Too many requests from this admin account',
      burst: 100,
    },
    default: {
      windowMs: 15 * 60 * 1000,
      max: 50,
      message: 'Too many requests, please try again after 15 minutes',
      burst: 10,
    }
  },

  // Endpoint-specific limits
  endpoints: {
    auth: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 attempts per hour per IP
      message: 'Too many login attempts, please try again after an hour',
    },
    login: {
      // Issue #17: 5 attempts per IP, 15-minute cooldown after exceeded.
      windowMs: Number(process.env.RL_LOGIN_WINDOW_MS) || (15 * 60 * 1000),
      max: Number(process.env.RL_LOGIN_MAX) || 5,
      message: 'Too many login attempts from this IP, please try again after 15 minutes',
      keyByUser: false,
    },
    register: {
      // Issue #17: 3 accounts per hour per IP.
      windowMs: Number(process.env.RL_REGISTER_WINDOW_MS) || (60 * 60 * 1000),
      max: Number(process.env.RL_REGISTER_MAX) || 3,
      message: 'Too many accounts created from this IP, please try again after an hour',
      keyByUser: false,
    },
    payment: {
      // Issue #17: 10 requests per minute per authenticated user (per IP fallback).
      windowMs: Number(process.env.RL_PAYMENT_WINDOW_MS) || (1 * 60 * 1000),
      max: Number(process.env.RL_PAYMENT_MAX) || 10,
      message: 'Too many payment attempts, please slow down',
      keyByUser: true,
    },
    admin: {
      // Issue #17: 100 requests per minute per authenticated admin.
      windowMs: Number(process.env.RL_ADMIN_WINDOW_MS) || (1 * 60 * 1000),
      max: Number(process.env.RL_ADMIN_MAX) || 100,
      message: 'Admin rate limit exceeded, please slow down',
      keyByUser: true,
    },
    adminAnonymous: {
      // Stricter limit for anonymous traffic hitting admin paths (shouldn't normally happen).
      windowMs: Number(process.env.RL_ADMIN_ANON_WINDOW_MS) || (1 * 60 * 1000),
      max: Number(process.env.RL_ADMIN_ANON_MAX) || 20,
      message: 'Too many requests from this IP, please authenticate first',
      keyByUser: false,
    },
    transactions: {
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 10,
      message: 'Transaction rate limit exceeded',
    },
    ipfs: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 20,
      message: 'IPFS upload limit exceeded',
    }
  },

  // DDoS Protection settings
  ddos: {
    burst: 30,
    limit: 15,
    maxExpiry: 120, // seconds
    checkInterval: 1, // seconds
  },

  // Whitelist/Blacklist
  whitelist: (process.env.SECURITY_WHITELIST || '').split(','),
  blacklist: (process.env.SECURITY_BLACKLIST || '').split(','),

  // Monitoring
  logging: {
    enabled: true,
    file: 'logs/security.log',
    level: 'warn',
    performanceTracking: true,
  },

  // Advanced Restrictions
  geoRestrictions: {
    enabled: false,
    blockedCountries: [],
  },

  timeRestrictions: {
    enabled: false,
    startHour: 0, // 00:00 (Midnight)
    endHour: 6,   // 06:00 (6 AM)
  },

  // Automated blocking
  autoBlock: {
    enabled: true,
    threshold: 10, // suspicious events before blocking
    durationDays: 1,
  }
};

module.exports = securityConfig;
