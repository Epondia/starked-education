/**
 * Tests for the configurable CORS middleware (issue #384).
 *
 * Verifies that CORS is disabled unless ENABLE_CORS=true, that only the
 * CORS_ORIGINS allowlist is honored with credentials, and that an empty
 * allowlist denies all cross-origin requests.
 */

const express = require('express');
const request = require('supertest');
const { buildCorsMiddleware } = require('../cors');

function buildApp(env) {
  const app = express();
  const middleware = buildCorsMiddleware(env);
  if (middleware) {
    app.use(middleware);
  }
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
}

describe('buildCorsMiddleware (issue #384)', () => {
  test('returns null when ENABLE_CORS is not exactly "true"', () => {
    expect(buildCorsMiddleware({})).toBeNull();
    expect(buildCorsMiddleware({ ENABLE_CORS: 'false' })).toBeNull();
    expect(buildCorsMiddleware({ ENABLE_CORS: 'TRUE' })).toBeNull();
  });

  test('emits no Access-Control-Allow-Origin when CORS is disabled', async () => {
    const app = buildApp({});
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('echoes an allowed origin with credentials when CORS is enabled', async () => {
    const app = buildApp({
      ENABLE_CORS: 'true',
      CORS_ORIGINS: 'http://localhost:3000, http://localhost:3001',
    });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('denies an origin that is not in the allowlist', async () => {
    const app = buildApp({
      ENABLE_CORS: 'true',
      CORS_ORIGINS: 'http://localhost:3000',
    });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('denies all cross-origin requests when the allowlist is empty', async () => {
    const app = buildApp({ ENABLE_CORS: 'true', CORS_ORIGINS: '' });
    const res = await request(app)
      .get('/ping')
      .set('Origin', 'http://localhost:3000');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('handles preflight OPTIONS requests for allowed origins', async () => {
    const app = buildApp({
      ENABLE_CORS: 'true',
      CORS_ORIGINS: 'http://localhost:3000',
    });
    const res = await request(app)
      .options('/ping')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});
