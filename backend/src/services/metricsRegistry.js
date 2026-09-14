/**
 * Prometheus metrics registry for application observability.
 *
 * Exposes request count, latency, error, and queue-depth metrics in the
 * Prometheus text exposition format. Kept intentionally lightweight so it can
 * be imported by the request-logging middleware at startup without depending
 * on Redis or database connectivity.
 *
 * See routes/health.ts for the internal-only /metrics endpoint that renders
 * this registry.
 */

const {
  Registry,
  Counter,
  Histogram,
  Gauge,
} = require('prom-client');

const register = new Registry();

// Default histogram buckets (seconds), matching prom-client's defaults.
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests handled.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: DURATION_BUCKETS,
  registers: [register],
});

const httpErrorsTotal = new Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP requests that returned an error status (>= 400).',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const transactionQueueDepth = new Gauge({
  name: 'transaction_queue_depth',
  help: 'Current depth of the transaction queue.',
  labelNames: ['queue'],
  registers: [register],
});

/**
 * Record a completed HTTP request.
 *
 * @param {Object} params
 * @param {string} params.method      HTTP method (GET, POST, ...)
 * @param {string} params.route       Normalised, low-cardinality route label
 * @param {number} params.statusCode  Response status code
 * @param {number} params.durationMs  Request duration in milliseconds
 */
function recordRequest({ method, route, statusCode, durationMs }) {
  const labels = { method, route, status_code: String(statusCode) };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationMs / 1000);

  if (statusCode >= 400) {
    httpErrorsTotal.inc(labels);
  }
}

/**
 * Set the sampled depth of a queue.
 *
 * @param {string} queueName
 * @param {number} depth
 */
function setQueueDepth(queueName, depth) {
  transactionQueueDepth.set({ queue: queueName }, depth);
}

/**
 * Render all metrics in Prometheus text exposition format.
 *
 * @returns {Promise<string>}
 */
function getMetricsContent() {
  return register.metrics();
}

module.exports = {
  register,
  contentType: register.contentType,
  recordRequest,
  setQueueDepth,
  getMetricsContent,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpErrorsTotal,
  transactionQueueDepth,
};
