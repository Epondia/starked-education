/**
 * Prometheus Metrics Endpoint Tests
 *
 * Verifies the /metrics endpoint renders Prometheus text exposition format,
 * records request count/latency/error metrics, avoids leaking high-cardinality
 * path segments, and is restricted to internal callers.
 */

import request from 'supertest';
import app from '../index';

// Mock external dependencies (mirrors health.test.ts) so importing the app
// does not attempt real network/database connections.
jest.mock('../utils/database');
jest.mock('../config/redis', () => ({ checkRedisConnectivity: jest.fn() }));
jest.mock('axios');
jest.mock('../services/search/ElasticsearchService', () => ({
  __esModule: true,
  default: { client: { ping: jest.fn() } },
}));

const { register, recordRequest, setQueueDepth, getMetricsContent } = require('../services/metricsRegistry');
const { isInternalRequest } = require('../routes/health');
const requestLogger = require('../middleware/requestLogger');

describe('Prometheus Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    register.resetMetrics();
    delete process.env.PROMETHEUS_METRICS_TOKEN;
  });

  afterEach(() => {
    delete process.env.PROMETHEUS_METRICS_TOKEN;
  });

  describe('metric registry format', () => {
    it('renders Prometheus text exposition format', async () => {
      recordRequest({ method: 'GET', route: '/test', statusCode: 200, durationMs: 42 });
      setQueueDepth('stellar_transactions', 7);

      const content = await getMetricsContent();

      expect(content).toContain('# HELP http_requests_total');
      expect(content).toContain('# TYPE http_requests_total counter');
      expect(content).toContain('# TYPE http_request_duration_seconds histogram');
      expect(content).toContain('http_request_duration_seconds_bucket');
      expect(content).toContain('# TYPE http_errors_total counter');
      expect(content).toContain('# TYPE transaction_queue_depth gauge');
      expect(content).toContain('transaction_queue_depth{queue="stellar_transactions"} 7');
    });

    it('counts requests, latency, and errors separately by status code', async () => {
      recordRequest({ method: 'GET', route: '/test', statusCode: 200, durationMs: 100 });
      recordRequest({ method: 'GET', route: '/test', statusCode: 500, durationMs: 200 });

      const content = await getMetricsContent();

      expect(content).toContain('http_requests_total{method="GET",route="/test",status_code="200"} 1');
      expect(content).toContain('http_requests_total{method="GET",route="/test",status_code="500"} 1');
      // Errors are tracked only for status >= 400
      expect(content).toContain('http_errors_total{method="GET",route="/test",status_code="500"} 1');
      expect(content).not.toContain('http_errors_total{method="GET",route="/test",status_code="200"}');
      // Latency is observed as a histogram (seconds)
      expect(content).toContain('http_request_duration_seconds_sum');
      expect(content).toContain('http_request_duration_seconds_count{method="GET",route="/test",status_code="200"} 1');
    });
  });

  describe('GET /metrics endpoint', () => {
    it('returns 200 with Prometheus content type and format', async () => {
      const response = await request(app).get('/metrics');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.text).toContain('# HELP http_requests_total');
      expect(response.text).toContain('# TYPE transaction_queue_depth gauge');
      expect(response.text).toContain('transaction_queue_depth{queue="stellar_transactions"}');
    });

    it('records the request that hit the endpoint', async () => {
      await request(app).get('/metrics');

      const content = await getMetricsContent();
      expect(content).toContain('http_requests_total{method="GET",route="/metrics",status_code="200"}');
    });
  });

  describe('internal-only protection', () => {
    it('allows loopback callers', () => {
      const req = { ip: '::ffff:127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, get: () => undefined };
      expect(isInternalRequest(req as any)).toBe(true);
    });

    it('denies non-loopback callers when no token is configured', () => {
      const req = { ip: '203.0.113.10', socket: { remoteAddress: '203.0.113.10' }, get: () => undefined };
      expect(isInternalRequest(req as any)).toBe(false);
    });

    it('allows non-loopback callers presenting the shared token', () => {
      process.env.PROMETHEUS_METRICS_TOKEN = 'secret-token';
      const req = { ip: '203.0.113.10', get: (name: string) => (name === 'x-metrics-token' ? 'secret-token' : undefined) };
      expect(isInternalRequest(req as any)).toBe(true);
    });

    it('denies non-loopback callers with a wrong token', () => {
      process.env.PROMETHEUS_METRICS_TOKEN = 'secret-token';
      const req = { ip: '203.0.113.10', get: (name: string) => (name === 'x-metrics-token' ? 'wrong' : undefined) };
      expect(isInternalRequest(req as any)).toBe(false);
    });
  });

  describe('high-cardinality avoidance', () => {
    it('uses the route pattern, not the raw URL, as the route label', () => {
      const req = {
        baseUrl: '/api/v1',
        route: { path: '/courses/:id' },
        originalUrl: '/api/v1/courses/12345?expand=all',
      };
      expect(requestLogger.getRouteLabel(req)).toBe('/api/v1/courses/:id');
    });

    it('falls back to "unmatched" for requests without a matched route', () => {
      const req = { baseUrl: '', route: undefined, originalUrl: '/does/not/exist/123' };
      expect(requestLogger.getRouteLabel(req)).toBe('unmatched');
    });
  });
});
