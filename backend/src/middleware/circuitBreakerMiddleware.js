/**
 * Circuit Breaker Middleware (Issue #307)
 *
 * Provides an Express middleware that wraps the existing CircuitBreakerRegistry
 * to protect routes from cascading failures when downstream services are
 * unavailable or slow.
 *
 * States:
 *   CLOSED  – normal operation, requests pass through.
 *   OPEN    – failing; requests are rejected with 503 immediately.
 *   HALF_OPEN – testing recovery; a limited number of probe requests are
 *               allowed through.  A success returns to CLOSED; a failure
 *               re-opens the circuit.
 *
 * Usage:
 *   const { circuitBreakerMiddleware } = require('../middleware/circuitBreakerMiddleware');
 *
 *   // Protect an entire route group with a named circuit
 *   router.use('/ipfs', circuitBreakerMiddleware('ipfs'), ipfsRoutes);
 *
 *   // Or protect a single handler
 *   router.post('/upload', circuitBreakerMiddleware('ipfs', {
 *     failureThreshold: 3,
 *     timeoutWindow: 15000,
 *     halfOpenMaxRequests: 1,
 *   }), uploadHandler);
 *
 * Events are logged via the project's Winston logger for monitoring.
 */

const logger = require('../utils/logger');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { circuitBreakerRegistry } = require('../utils/circuitBreaker');

/**
 * Factory that returns Express circuit-breaker middleware.
 *
 * @param {string} name               – unique circuit-breaker name (e.g. 'ipfs')
 * @param {object} [breakerConfig]    – optional CircuitBreakerConfig overrides
 * @param {number} [breakerConfig.failureThreshold]     – failures before OPEN (default 5)
 * @param {number} [breakerConfig.timeoutWindow]        – ms before HALF_OPEN (default 30000)
 * @param {number} [breakerConfig.halfOpenMaxRequests]  – max probe requests (default 3)
 * @returns {Function} Express middleware
 */
function circuitBreakerMiddleware(name, breakerConfig = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('circuitBreakerMiddleware: name must be a non-empty string');
  }

  // Register (or retrieve) the breaker in the global registry.
  // This merges caller-supplied config with defaults.
  const breaker = circuitBreakerRegistry.getOrCreate(name, {
    failureThreshold: breakerConfig.failureThreshold,
    timeoutWindow: breakerConfig.timeoutWindow,
    halfOpenMaxRequests: breakerConfig.halfOpenMaxRequests,
    name,
  });

  return function cbMiddleware(req, res, next) {
    if (!breaker.isAvailable()) {
      const metrics = breaker.getMetrics();
      logger.warn(JSON.stringify({
        type: 'circuit_breaker_rejected',
        circuit: name,
        state: metrics.state,
        failureCount: metrics.failureCount,
        totalTrips: metrics.totalTrips,
        method: req.method,
        path: req.originalUrl || req.url,
        requestId: req.requestId || 'unknown',
        timestamp: new Date().toISOString(),
      }));

      return res.status(503).json({
        success: false,
        error: 'Service Unavailable',
        message: `Circuit breaker [${name}] is ${metrics.state}. The service is temporarily unavailable. Please try again later.`,
        circuit: name,
        retryAfter: Math.ceil((breakerConfig.timeoutWindow || 30000) / 1000),
      });
    }

    // Intercept `res.end` to record success/failure on the breaker.
    // A 5xx status after the handler runs is treated as a downstream failure.
    const originalEnd = res.end;
    res.end = function (...args) {
      // Restore immediately so nested calls don't double-record
      res.end = originalEnd;

      const statusCode = res.statusCode || 200;

      if (statusCode >= 500) {
        // Treat server errors as circuit failures – record synchronously
        breaker.recordFailure();

        logger.warn(JSON.stringify({
          type: 'circuit_breaker_failure_recorded',
          circuit: name,
          statusCode,
          method: req.method,
          path: req.originalUrl || req.url,
          requestId: req.requestId || 'unknown',
          timestamp: new Date().toISOString(),
        }));
      } else if (statusCode < 400) {
        // Successful response – record a success for circuit recovery
        breaker.recordSuccess();
      }

      return originalEnd.apply(this, args);
    };

    next();
  };
}

/**
 * Convenience middleware to expose circuit-breaker status on a health endpoint.
 * Mount on any route that should return the current state of all circuits.
 */
function circuitBreakerStatusHandler(req, res) {
  const allMetrics = circuitBreakerRegistry.getAllMetrics();
  res.json({
    circuitBreakers: allMetrics,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  circuitBreakerMiddleware,
  circuitBreakerStatusHandler,
};
