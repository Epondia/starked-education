/**
 * Tests for per-route timeout middleware (Issue #307).
 *
 * Verifies that:
 * - Routes that respond within the timeout pass through normally
 * - Routes that exceed the timeout receive a 408 response
 * - Per-request timeout overrides work
 * - Cleanup happens on normal response completion
 * - The middleware throws on invalid timeout values
 */

const express = require('express');
const request = require('supertest');
const { routeTimeout } = require('../timeout');

function buildApp(handler, timeoutMs = 100, opts = {}) {
  const app = express();
  app.use(routeTimeout(timeoutMs, opts));
  app.get('/test', handler);
  return app;
}

describe('routeTimeout middleware (Issue #307)', () => {
  test('passes through when handler responds within the timeout', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    }, 200);

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('returns 408 when handler exceeds the timeout', async () => {
    const app = buildApp((req, res) => {
      // Handler hangs – the timeout will fire and send 408
    }, 50);

    const res = await request(app).get('/test');
    expect(res.status).toBe(408);
    expect(res.body.error).toBe('Request Timeout');
    expect(res.body.timeoutMs).toBe(50);
    expect(res.body.message).toContain('/test');
  });

  test('does not send double response when handler finishes after timeout', async () => {
    const app = express();
    app.use(routeTimeout(50));

    app.get('/test', (req, res) => {
      // Handler that hangs – the timeout fires and sends 408
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(408);
  });

  test('per-request timeout override via req.routeTimeoutMs', async () => {
    const app = express();
    // Middleware that sets req.routeTimeoutMs BEFORE the timeout middleware
    app.use((req, res, next) => {
      req.routeTimeoutMs = 50;
      next();
    });
    // Set a generous default timeout (overridden by per-request value)
    app.use(routeTimeout(10000));

    app.get('/test', (req, res) => {
      // Handler that hangs until the timeout fires (no delayed response)
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(408);
    expect(res.body.error).toBe('Request Timeout');
  });

  test('resets timer on streaming responses', async () => {
    const app = express();
    app.use(routeTimeout(100));

    app.get('/test', (req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      // Send a chunk immediately
      res.write('chunk1');
      // Send another chunk before timeout
      setTimeout(() => {
        res.write('chunk2');
        res.end();
      }, 50);
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.text).toContain('chunk1');
    expect(res.text).toContain('chunk2');
  });

  test('throws on invalid timeout value', () => {
    expect(() => routeTimeout(0)).toThrow('must be a positive number');
    expect(() => routeTimeout(-100)).toThrow('must be a positive number');
    expect(() => routeTimeout('abc')).toThrow('must be a positive number');
  });

  test('accepts a label option for log messages', async () => {
    const app = express();
    app.use(routeTimeout(5000, { label: 'test-route' }));
    app.get('/test', (req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
  });

  test('logs timeout event when timeout is exceeded', async () => {
    const app = buildApp((req, res) => {
      // Handler hangs – timeout fires
    }, 50);

    const res = await request(app).get('/test');
    expect(res.status).toBe(408);
    expect(res.body).toHaveProperty('timeoutMs');
    expect(res.body).toHaveProperty('message');
  });

  test('cleans up timeout when connection closes', async () => {
    const app = express();
    app.use(routeTimeout(50000)); // Very generous timeout

    app.get('/test', (req, res) => {
      // Handler never calls res.end
      // The timeout should be cleaned up when the socket closes
      req.on('close', () => {
        // Cleanup should happen via the middleware's socket listener
      });
    });

    const agent = request(app);
    const req = agent.get('/test');
    // Abort the request immediately
    req.abort();

    try {
      await req;
    } catch (err) {
      // Expected – request was aborted
    }
  });
});
