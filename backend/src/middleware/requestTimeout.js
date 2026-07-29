/**
 * Request Timeout Middleware (Issue #190)
 *
 * Prevents long-running requests from exhausting server resources by
 * enforcing per-route timeout limits. Each request is wrapped with a
 * timer; if the handler does not respond within the limit the connection
 * is terminated with a 408 Request Timeout.
 *
 * Configuration
 * -------------
 * - defaultTimeoutMs: fallback for routes that don't match any rule (30 s)
 * - uploadTimeoutMs:  applied to /upload paths (120 s)
 * - maxTimeoutMs:     hard upper-bound no request may exceed (300 s)
 * - skipPaths:        paths that should never be timed-out (health checks, …)
 *
 * Timeout values can be overridden per-route via:
 *   app.post('/api/slow-job', requestTimeout({ defaultTimeoutMs: 90000 }), handler);
 */

const logger = require('../utils/logger');

const DEFAULT_OPTIONS = {
  defaultTimeoutMs: 30_000,
  uploadTimeoutMs: 120_000,
  maxTimeoutMs: 300_000,
  skipPaths: ['/health', '/api/health', '/api/v1/health'],
};

/**
 * Determine the timeout for a given request.
 * Returns null when the path should be skipped entirely.
 */
function resolveTimeoutMs(req, options) {
  const path = (req.originalUrl || req.path || '');

  // Explicitly skipped paths (health checks, metrics, …)
  if (options.skipPaths.some((prefix) => path.startsWith(prefix))) {
    return null;
  }

  // Upload / file-heavy endpoints get the longer upload timeout
  if (/\/upload/i.test(path)) {
    return Math.min(options.uploadTimeoutMs, options.maxTimeoutMs);
  }

  return Math.min(options.defaultTimeoutMs, options.maxTimeoutMs);
}

/**
 * Factory that returns Express middleware.
 *
 * Usage:
 *   app.use(requestTimeout({ defaultTimeoutMs: 30000 }));
 *
 * Per-route override (applied BEFORE the route handler):
 *   app.post('/heavy', requestTimeout({ defaultTimeoutMs: 90000 }), handler);
 */
function requestTimeout(userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };

  return (req, res, next) => {
    const timeoutMs = resolveTimeoutMs(req, options);

    // No timeout for skipped paths
    if (timeoutMs === null) {
      return next();
    }

    let timedOut = false;

    // Schedule the timeout
    const timer = setTimeout(() => {
      timedOut = true;
      logger.warn('request_timeout', {
        method: req.method,
        path: req.originalUrl || req.path,
        timeoutMs,
        ip: req.ip,
      });

      // Terminate the connection if headers haven't been sent yet
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          error: {
            code: 'REQUEST_TIMEOUT',
            message: `Request exceeded the ${timeoutMs / 1000}s timeout limit.`,
          },
        });
        // Close the socket after the response has been flushed
        res.once('finish', () => {
          if (req.socket && !req.socket.destroyed) {
            req.socket.destroy();
          }
        });
      }
    }, timeoutMs);

    // Clean up the timer once the response finishes
    const cleanup = () => {
      clearTimeout(timer);
    };

    res.once('finish', cleanup);
    res.once('close', () => {
      if (!timedOut) cleanup();
    });

    // If the req is aborted or the connection drops, clean up early
    req.once('aborted', cleanup);
    req.once('close', cleanup);

    next();
  };
}

module.exports = { requestTimeout, resolveTimeoutMs, DEFAULT_OPTIONS };
