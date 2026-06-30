/**
 * Logger Utility
 * Centralized logging service using Winston with structured JSON format
 * and correlation ID support for request tracing
 */

const winston = require('winston');
const path = require('path');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

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
 * Redact sensitive data from log metadata
 */
function redactSensitiveData(info) {
  if (!info || typeof info !== 'object') {
    return info;
  }

  const redacted = { ...info };
  
  for (const key in redacted) {
    if (redacted.hasOwnProperty(key)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = redactSensitiveData(redacted[key]);
      }
    }
  }
  
  return redacted;
}

/**
 * Custom format to add correlation ID and structure logs as JSON
 */
const correlationFormat = winston.format((info) => {
  // Get correlation ID from async local storage or metadata
  const correlationId = info.correlationId || info.metadata?.correlationId;
  
  if (correlationId) {
    info.correlationId = correlationId;
  }
  
  // Redact sensitive data
  return redactSensitiveData(info);
});

/**
 * JSON format for production and log aggregation tools (ELK, Datadog)
 */
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  correlationFormat(),
  winston.format.json()
);

/**
 * Pretty format for development
 */
const prettyFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize(),
  correlationFormat(),
  winston.format.printf((info) => {
    const correlationId = info.correlationId ? `[${info.correlationId}] ` : '';
    const metadata = Object.keys(info).reduce((acc, key) => {
      if (key !== 'timestamp' && key !== 'level' && key !== 'message' && key !== 'correlationId') {
        acc[key] = info[key];
      }
      return acc;
    }, {});
    
    const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    return `${info.timestamp} ${info.level}: ${correlationId}${info.message}${metaStr}`;
  })
);

/**
 * Determine format based on environment
 */
const logFormat = process.env.NODE_ENV === 'production' ? jsonFormat : prettyFormat;

const transports = [
  // Console transport
  new winston.transports.Console({
    format: logFormat,
  }),
  // Error log file (always JSON)
  new winston.transports.File({
    filename: path.join('logs', 'error.log'),
    level: 'error',
    format: jsonFormat,
  }),
  // Combined log file (always JSON)
  new winston.transports.File({
    filename: path.join('logs', 'all.log'),
    format: jsonFormat,
  }),
  // Security log file (always JSON)
  new winston.transports.File({
    filename: path.join('logs', 'security.log'),
    level: 'warn',
    format: jsonFormat,
  }),
];

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  levels,
  format: logFormat,
  transports,
});

/**
 * Create a child logger with correlation ID
 */
function createChildLogger(correlationId) {
  return logger.child({ correlationId });
}

module.exports = logger;
module.exports.createChildLogger = createChildLogger;
