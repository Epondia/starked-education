/**
 * Structured Request/Response Logging Middleware
 * Logs all API requests and responses with structured JSON output
 * for debugging, monitoring, and audit trails.
 *
 * Features:
 * - Logs request method, URL, IP, user agent, timestamp
 * - Logs response status code and duration
 * - Masks sensitive data (passwords, tokens, authorization headers)
 * - Supports log levels (debug, info, warn, error)
 * - Integrates with existing Winston logger utility
 */

const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * Mask sensitive data in request bodies and headers
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'credit_card',
  'creditCard',
  'ssn',
  'privateKey',
  'private_key',
];

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
];

/**
 * Redact sensitive values from an object recursively
 */
function maskSensitiveData(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return obj;

  const masked = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      masked[key] = '[REDACTED]';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key], depth + 1);
    }
  }

  return masked;
}

/**
 * Mask sensitive headers
 */
function maskHeaders(headers) {
  const masked = { ...headers };
  for (const header of SENSITIVE_HEADERS) {
    if (masked[header]) {
      masked[header] = '[REDACTED]';
    }
  }
  return masked;
}

/**
 * Determine log level based on response status code
 */
function getLogLevelFromStatus(statusCode) {
  if (statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'http';
}

/**
 * Generate a unique request ID for tracing
 */
function generateRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * Structured request/response logging middleware
 */
function requestLogger(req, res, next) {
  // Generate unique request ID for tracing
  const requestId = generateRequestId();
  req.requestId = requestId;

  // Record start time
  const startTime = process.hrtime();

  // Extract request info
  const requestInfo = {
    requestId,
    method: req.method,
    url: req.originalUrl || req.url,
    path: req.path,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent') || 'unknown',
    referer: req.get('referer') || undefined,
    userId: req.user?.id || 'anonymous',
    timestamp: new Date().toISOString(),
  };

  // Log incoming request
  logger.http(JSON.stringify({
    type: 'request',
    ...requestInfo,
    headers: maskHeaders(req.headers),
    query: Object.keys(req.query || {}).length > 0 ? req.query : undefined,
    body: req.body && Object.keys(req.body).length > 0 ? maskSensitiveData(req.body) : undefined,
  }));

  // Capture the original end function to log response
  const originalEnd = res.end;

  res.end = function (chunk, encoding) {
    // Restore original end
    res.end = originalEnd;

    // Calculate duration
    const duration = process.hrtime(startTime);
    const durationMs = (duration[0] * 1000) + (duration[1] / 1000000);

    // Build response log
    const logLevel = getLogLevelFromStatus(res.statusCode);
    const responseInfo = {
      type: 'response',
      requestId,
      method: requestInfo.method,
      url: requestInfo.url,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      contentLength: res.get('content-length') || chunk?.length || 0,
      timestamp: new Date().toISOString(),
    };

    // Log with appropriate level
    const logMessage = JSON.stringify(responseInfo);

    switch (logLevel) {
      case 'error':
        logger.error(logMessage);
        break;
      case 'warn':
        logger.warn(logMessage);
        break;
      default:
        logger.http(logMessage);
    }

    // Call original end
    return originalEnd.call(this, chunk, encoding);
  };

  next();
}

module.exports = requestLogger;
