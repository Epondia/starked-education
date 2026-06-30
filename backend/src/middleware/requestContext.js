/**
 * Request Context Middleware
 * Handles correlation ID generation and propagation for request tracing
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'creditCard',
  'ssn',
  'socialSecurityNumber',
];

/**
 * Redact sensitive data from an object
 */
function redactSensitiveData(obj) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const redacted = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object') {
        redacted[key] = redactSensitiveData(obj[key]);
      } else {
        redacted[key] = obj[key];
      }
    }
  }
  return redacted;
}

/**
 * Middleware to handle correlation ID
 * - Reads X-Correlation-ID header if present
 * - Generates new UUID if not present
 * - Adds correlation ID to request object
 * - Adds X-Correlation-ID to response headers
 * - Tracks request start time for duration logging
 */
function requestContext(req, res, next) {
  // Read correlation ID from header or generate new one
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  // Attach to request
  req.correlationId = correlationId;
  req.startTime = Date.now();
  
  // Add to response headers
  res.setHeader('X-Correlation-ID', correlationId);
  
  next();
}

/**
 * Middleware to log request duration
 * Should be used after all other middleware to capture total duration
 */
function requestDurationLogger(req, res, next) {
  const startTime = req.startTime || Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logger = require('../utils/logger');
    
    logger.info('Request completed', {
      correlationId: req.correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
  });
  
  next();
}

module.exports = {
  requestContext,
  requestDurationLogger,
  redactSensitiveData,
};
