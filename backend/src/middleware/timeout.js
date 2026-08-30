/**
 * Per-Route Timeout Middleware
 *
 * Wraps the response `end` method so that if a handler does not finish within
 * the specified timeout the client receives a 408 Request Timeout.
 *
 * Usage:
 *   router.get('/fast', routeTimeout(5000), handler);   // 5 s
 *   router.post('/upload', routeTimeout(60000), handler); // 60 s
 *
 * The timeout is reset on each call to `res.end()` so streaming responses are
 * not prematurely killed.  The timeout value can be overridden per-request by
 * setting `req.routeTimeoutMs` before the middleware runs (useful for dynamic
 * limits).
 *
 * Events are logged via the project's Winston logger for monitoring.
 */

const logger = require('../utils/logger');

/**
 * Factory that returns Express timeout middleware.
 *
 * @param {number}  timeoutMs        – default timeout in milliseconds
 * @param {object}  [opts]           – optional overrides
 * @param {string}  [opts.label]     – human-readable label for log messages
 * @returns {Function} Express middleware
 */
function routeTimeout(timeoutMs = 30000, opts = {}) {
  const label = opts.label || 'route';

  if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
    throw new Error(`routeTimeout: timeoutMs must be a positive number, got ${timeoutMs}`);
  }

  return function timeoutMiddleware(req, res, next) {
    // Allow per-request override
    const effectiveTimeout = req.routeTimeoutMs || timeoutMs;

    let timer = null;
    let finished = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const scheduleTimeout = () => {
      cleanup();
      timer = setTimeout(() => {
        if (!finished && !res.headersSent) {
          finished = true;
          // Re-read in case the handler updated req.routeTimeoutMs
          const currentTimeout = req.routeTimeoutMs || timeoutMs;
          const elapsed = Date.now() - req._routeTimeoutStart;
          logger.warn(JSON.stringify({
            type: 'route_timeout',
            label,
            method: req.method,
            path: req.originalUrl || req.url,
            timeoutMs: currentTimeout,
            elapsedMs: elapsed,
            requestId: req.requestId || 'unknown',
            timestamp: new Date().toISOString(),
          }));

          res.status(408).json({
            success: false,
            error: 'Request Timeout',
            message: `The request to ${req.originalUrl || req.url} exceeded the ${currentTimeout}ms timeout.`,
            timeoutMs: currentTimeout,
          });
        }
      }, effectiveTimeout);
    };

    // Mark the start time on the request for logging
    req._routeTimeoutStart = Date.now();

    // Start the timer
    scheduleTimeout();

    // Intercept res.end to clean up the timer when the response finishes
    const originalEnd = res.end;
    res.end = function (...args) {
      if (!finished) {
        finished = true;
        cleanup();
      }
      return originalEnd.apply(this, args);
    };

    // Also handle the case where the socket closes before the response ends
    const onSocketClose = () => {
      if (!finished) {
        finished = true;
        cleanup();
      }
    };
    if (req.socket) {
      req.socket.once('close', onSocketClose);
    }

    next();
  };
}

module.exports = { routeTimeout };
