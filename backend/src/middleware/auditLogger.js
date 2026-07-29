/**
 * Audit Logging Middleware (Issue #205)
 *
 * Logs all security-sensitive operations for compliance and incident
 * investigation. Mutating requests (POST, PUT, PATCH, DELETE) are
 * automatically captured. Read-only requests (GET, HEAD, OPTIONS) are
 * skipped to keep the audit trail focused.
 *
 * What is logged
 * --------------
 * - Timestamp, method, path, IP, user-agent
 * - Authenticated user id + role (when available)
 * - Request body (redacted for auth-related endpoints)
 * - Response status code and duration
 *
 * Logs are written via Winston to a dedicated `audit.log` and also
 * forwarded to the security event stream.
 *
 * Sensitive fields (password, token, secret, key) are automatically
 * redacted from logged payloads.
 */

const logger = require('../utils/logger');

// Fields whose values are always replaced with [REDACTED]
const REDACTED_FIELDS = new Set([
  'password',
  'passwordConfirm',
  'newPassword',
  'oldPassword',
  'token',
  'secret',
  'privateKey',
  'seed',
  'mnemonic',
  'apiKey',
  'accessToken',
  'refreshToken',
  'authorization',
]);

/** Deep-clone an object and redact sensitive fields in place. */
function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redact);

  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key)) {
      out[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      out[key] = redact(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Express middleware.
 *
 * Mount AFTER authentication middleware so `req.user` is populated.
 */
function auditLogger(req, res, next) {
  // Skip read-only operations to keep the audit trail focused
  const mutatingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  if (!mutatingMethods.has(req.method)) {
    return next();
  }

  const start = process.hrtime();

  // Capture request metadata BEFORE the route handler runs
  const auditEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl || req.path,
    ip: req.ip,
    userAgent: (req.headers['user-agent'] || '').slice(0, 256),
    userId: req.user ? req.user.id || req.user.sub || req.user.userId : null,
    userRole: req.user ? req.user.role : null,
    body: redact(req.body),
  };

  // Attach to `res` so we can log it after the response finishes
  res.locals._auditEntry = auditEntry;
  res.locals._auditStart = start;

  // Log after the response is sent (or connection closes)
  const finalize = () => {
    const duration = process.hrtime(start);
    const durationMs = Math.round((duration[0] * 1000) + (duration[1] / 1e6));

    const entry = res.locals._auditEntry || auditEntry;
    entry.statusCode = res.statusCode;
    entry.durationMs = durationMs;

    // Log at different levels based on outcome
    if (res.statusCode >= 500) {
      logger.error('audit', entry);
    } else if (res.statusCode >= 400) {
      logger.warn('audit', entry);
    } else {
      logger.info('audit', entry);
    }
  };

  // 'finish' fires when response is fully sent; 'close' fires on
  // client disconnect — both should produce an audit trail.
  res.once('finish', finalize);
  res.once('close', finalize);

  next();
}

module.exports = { auditLogger, redact, REDACTED_FIELDS };
