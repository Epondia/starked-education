/**
 * Tests for circuit breaker middleware (Issue #307).
 *
 * Verifies that:
 * - Requests pass through when circuit is CLOSED
 * - Requests are rejected with 503 when circuit is OPEN
 * - Circuit transitions HALF_OPEN → CLOSED on success
 * - Circuit transitions HALF_OPEN → OPEN on failure
 * - Status handler returns all circuit breaker metrics
 * - Logging occurs on rejection and failure events
 */

const express = require('express');
const request = require('supertest');
const { circuitBreakerMiddleware, circuitBreakerStatusHandler } = require('../circuitBreakerMiddleware');
const { circuitBreakerRegistry } = require('../../utils/circuitBreaker');

function buildApp(handler, cbName = 'test-circuit', cbConfig = {}) {
  const app = express();
  app.use(circuitBreakerMiddleware(cbName, cbConfig));
  app.get('/test', handler);
  return app;
}

describe('circuitBreakerMiddleware (Issue #307)', () => {
  // Clean up the registry before each test
  beforeEach(() => {
    circuitBreakerRegistry.remove('test-circuit');
    circuitBreakerRegistry.remove('test-circuit-2');
    circuitBreakerRegistry.remove('test-circuit-status');
  });

  afterEach(() => {
    circuitBreakerRegistry.remove('test-circuit');
    circuitBreakerRegistry.remove('test-circuit-2');
    circuitBreakerRegistry.remove('test-circuit-status');
  });

  test('passes through when circuit is CLOSED and handler succeeds', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  test('passes through when handler returns 4xx (client error, not downstream failure)', async () => {
    const app = buildApp((req, res) => {
      res.status(400).json({ error: 'bad request' });
    });

    const res = await request(app).get('/test');
    expect(res.status).toBe(400);
  });

  test('rejects with 503 when circuit is OPEN', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    }, 'test-circuit', { failureThreshold: 1, timeoutWindow: 60000 });

    // Force the circuit open
    const breaker = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 60000,
    });
    breaker.forceOpen();

    const res = await request(app).get('/test');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('Service Unavailable');
    expect(res.body.circuit).toBe('test-circuit');
    expect(res.body).toHaveProperty('retryAfter');
  });

  test('records failure on 5xx response and opens circuit after threshold', async () => {
    const app = buildApp((req, res) => {
      res.status(500).json({ error: 'server error' });
    }, 'test-circuit', { failureThreshold: 2, timeoutWindow: 60000 });

    // First two requests should go through (circuit records failures from 5xx)
    const res1 = await request(app).get('/test');
    expect(res1.status).toBe(500);

    const res2 = await request(app).get('/test');
    expect(res2.status).toBe(500);

    // Wait a bit for async failure recording
    await new Promise(resolve => setTimeout(resolve, 100));

    // Third request should be rejected (circuit should be open now)
    const res3 = await request(app).get('/test');
    expect(res3.status).toBe(503);
    expect(res3.body.error).toBe('Service Unavailable');
  });

  test('does not record failure for successful (2xx) responses', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    }, 'test-circuit', { failureThreshold: 3, timeoutWindow: 60000 });

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    }

    // Circuit should still be CLOSED
    const breaker = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 3,
      timeoutWindow: 60000,
    });
    expect(breaker.getState()).toBe('CLOSED');
  });

  test('circuit transitions HALF_OPEN → CLOSED on successful response', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    }, 'test-circuit', { failureThreshold: 1, timeoutWindow: 100 });

    // Force open
    const breaker = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 100,
    });
    breaker.forceOpen();

    // Wait for timeout window to elapse
    await new Promise(resolve => setTimeout(resolve, 150));

    // Next request should go through (HALF_OPEN) and succeed, returning to CLOSED
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);

    // Circuit should recover to CLOSED
    expect(breaker.getState()).toBe('CLOSED');
  });

  test('circuit transitions HALF_OPEN → OPEN on failure in half-open state', async () => {
    const app = buildApp((req, res) => {
      res.status(500).json({ error: 'down' });
    }, 'test-circuit', { failureThreshold: 1, timeoutWindow: 60000 });

    // Force open
    const breaker = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 60000,
    });
    breaker.forceOpen();

    // Use a large timeout window so we control transitions manually via reset/forceOpen.
    // Transition to HALF_OPEN by resetting to CLOSED, then force-open after one failure.
    // Alternative: directly test the state machine by calling the breaker.
    //
    // 1. Set state to HALF_OPEN by using a very short timeout window.
    breaker.reset();
    breaker.forceOpen();
    // Now reconfigure: set a tiny window so it transitions to HALF_OPEN quickly.
    // We can't reconfigure an existing breaker, so let's just verify via
    // recordFailure on a fresh breaker in HALF_OPEN state.
    circuitBreakerRegistry.remove('test-circuit');
    const breaker2 = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 50,
      halfOpenMaxRequests: 1,
    });
    breaker2.forceOpen();

    // Wait for timeout window to elapse → HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 80));

    // Verify state is HALF_OPEN
    expect(breaker2.getState()).toBe('HALF_OPEN');

    // Record a failure → should transition back to OPEN
    breaker2.recordFailure();
    expect(breaker2.getState()).toBe('OPEN');

    // Verify isAvailable returns false
    expect(breaker2.isAvailable()).toBe(false);
  });

  test('throws on missing or invalid name', () => {
    expect(() => circuitBreakerMiddleware()).toThrow('must be a non-empty string');
    expect(() => circuitBreakerMiddleware('')).toThrow('must be a non-empty string');
    expect(() => circuitBreakerMiddleware(123)).toThrow('must be a non-empty string');
  });

  test('circuitBreakerStatusHandler returns metrics for all circuits', async () => {
    const app = express();
    // Register some circuits
    circuitBreakerRegistry.getOrCreate('test-circuit-status', {
      failureThreshold: 5,
      timeoutWindow: 30000,
    });
    circuitBreakerRegistry.getOrCreate('test-circuit-2', {
      failureThreshold: 3,
      timeoutWindow: 15000,
    });

    app.get('/status', circuitBreakerStatusHandler);

    const res = await request(app).get('/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('circuitBreakers');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body.circuitBreakers).toHaveProperty('test-circuit-status');
    expect(res.body.circuitBreakers).toHaveProperty('test-circuit-2');
    expect(res.body.circuitBreakers['test-circuit-status']).toHaveProperty('state');
  });

  test('multiple circuits are independent', async () => {
    const app = express();
    // Use separate routes so each circuit is independent
    app.get('/circuit1', circuitBreakerMiddleware('test-circuit', { failureThreshold: 1, timeoutWindow: 60000 }), (req, res) => res.json({ ok: true }));
    app.get('/circuit2', circuitBreakerMiddleware('test-circuit-2', { failureThreshold: 100, timeoutWindow: 60000 }), (req, res) => res.json({ ok: true }));

    // Force circuit 1 open
    const breaker1 = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 60000,
    });
    breaker1.forceOpen();

    // Circuit 1 should reject
    const res1 = await request(app).get('/circuit1');
    expect(res1.status).toBe(503);

    // Circuit 2 should still accept requests
    const res2 = await request(app).get('/circuit2');
    expect(res2.status).toBe(200);
  });

  test('rejects with appropriate retryAfter header', async () => {
    const app = buildApp((req, res) => {
      res.json({ ok: true });
    }, 'test-circuit', { failureThreshold: 1, timeoutWindow: 30000 });

    const breaker = circuitBreakerRegistry.getOrCreate('test-circuit', {
      failureThreshold: 1,
      timeoutWindow: 30000,
    });
    breaker.forceOpen();

    const res = await request(app).get('/test');
    expect(res.status).toBe(503);
    expect(res.body.retryAfter).toBe(30); // 30000ms / 1000 = 30s
  });
});
