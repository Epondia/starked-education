# Rate Limiting Configuration

## Overview

The StarkEd backend implements comprehensive rate limiting across all API endpoints to prevent abuse, ensure fair resource usage, and protect against DDoS attacks. The system uses **express-rate-limit** with a custom **Redis store** for distributed rate limit tracking.

## Architecture

### Global Baseline Rate Limiter
A global rate limiter is applied to all `/api/v1/*` routes as a baseline protection layer. This ensures every endpoint has at least minimum protection even if no specific endpoint limiter is configured.

| Level | Window | Max Requests | Scope |
|-------|--------|-------------|-------|
| Global (Default) | 15 minutes | 50 | Per IP |

### Role-Based Rate Limiting (Tiered)
When a user is authenticated, rate limits can be applied based on their role using the `tieredRateLimiter` middleware:

| Role | Window | Max Requests | Burst |
|------|--------|-------------|-------|
| Student | 15 minutes | 100 | 20 |
| Instructor | 15 minutes | 500 | 50 |
| Admin | 15 minutes | 2000 | 100 |
| Default (unauthenticated) | 15 minutes | 50 | 10 |

### Endpoint-Specific Rate Limits

Individual endpoint categories have custom rate limiters tailored to their sensitivity:

| Endpoint Category | Window | Max Requests | Limiter Name |
|-------------------|--------|-------------|--------------|
| **Auth** (login/register) | 1 minute | 5 | `authLimiter` |
| **Transactions** | 1 minute | 10 | `transactionLimiter` |
| **IPFS Uploads** | 1 hour | 20 | `ipfsLimiter` |
| **Content Write** | 1 minute | 30 | `contentWriteLimiter` |
| **Search Write** | 1 minute | 30 | `searchWriteLimiter` |
| **Course Write** | 1 minute | 30 | `courseWriteLimiter` |
| **Read (GET)** | 1 minute | 100 | `readLimiter` / `liberalLimiter` |
| **Moderate Write** | 1 minute | 30 | `moderateLimiter` |
| **Strict** (sensitive ops) | 1 minute | 5 | `strictLimiter` |

### Public Rate Limit Tiers (Unauthenticated)

Public endpoints use the following predefined rate limit tiers:

| Tier | Window | Max Requests | Usage |
|------|--------|-------------|-------|
| Strict | 1 minute | 5 | Authentication attempts |
| Moderate | 1 minute | 30 | Content write operations |
| Liberal | 1 minute | 100 | Read operations |

## Response Headers

When rate limited, the following headers are included in the response:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 49
X-RateLimit-Reset: 1620000000
Retry-After: 900
```

## 429 Too Many Requests Response

When a rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "message": "Too many requests, please try again after 15 minutes"
}
```

With a `429` HTTP status code and a `Retry-After` header containing the number of seconds to wait.

## Redis Integration

Rate limiting uses a custom `RedisStore` class for distributed rate limit tracking:

```javascript
const redisStore = new RedisStore({
  prefix: 'rl:',       // Key prefix for Redis
  expiry: 900,         // TTL in seconds
});
```

The store uses atomic Redis operations (MULTI/EXEC) to ensure consistency across multiple server instances. If Redis is unavailable, the limiter falls back gracefully.

### Key Format

Rate limit keys follow the pattern:
- By IP: `rl:<prefix>:ip:<ip_address>`
- By User: `rl:<prefix>:user:<user_id>`

## Security Logging

When a rate limit is exceeded, the system:
1. Logs a warning via the application logger
2. Records a security event with the `securityService.logSecurityEvent()` method
3. Captures: IP address, request path, method, rate limit prefix, and authenticated user (if any)

## Whitelist/Skip Configuration

Requests can bypass rate limiting under the following conditions:
- **Whitelisted IPs**: Configured via `SECURITY_WHITELIST` environment variable
- **Test environment**: Rate limiting is disabled in `NODE_ENV=test` (unless `x-test-security: true` header is set)

## Usage Examples

### Adding Rate Limiting to a Route

```javascript
const { readLimiter, moderateLimiter } = require('../middleware/rateLimiter');

// Apply read limiter to GET endpoints
router.get('/items', readLimiter, async (req, res) => {
  // handler
});

// Apply write limiter to POST endpoints
router.post('/items', moderateLimiter, async (req, res) => {
  // handler
});
```

### Creating a Custom Rate Limiter

```javascript
const { createRateLimiter } = require('../middleware/rateLimiter');

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,               // 10 requests
  message: 'Custom rate limit message',
  keyPrefix: 'rl:custom:',
  keyByUser: true,       // Rate limit by user ID instead of IP
});
```

## Configuration

Rate limit settings are configured in `backend/src/config/security.js`:

```javascript
tiers: {
  student:    { windowMs: 15min, max: 100  },
  instructor: { windowMs: 15min, max: 500  },
  admin:      { windowMs: 15min, max: 2000 },
  default:    { windowMs: 15min, max: 50   },
},
endpoints: {
  auth:         { windowMs: 1hr, max: 5    },
  transactions: { windowMs: 1min, max: 10  },
  ipfs:         { windowMs: 1hr, max: 20   },
},
```

## Middleware Files

- `backend/src/middleware/rateLimiter.js` - Main implementation with Redis store
- `backend/src/middleware/rateLimit.ts` - TypeScript rate limiting middleware
- `backend/src/config/security.js` - Rate limit configuration
- `backend/src/index.js` - Global limiter applied to all routes
