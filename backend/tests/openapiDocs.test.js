/**
 * Lightweight unit tests for the OpenAPI / Swagger UI docs portal (Issue #28).
 *
 * These tests purposely do NOT require the full backend index.js — they mount
 * `setupSwagger` on a minimal Express app. This keeps the tests fast and
 * isolates failures caused by the docs module from unrelated issues in the
 * rest of the backend.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const yaml = require('js-yaml');
const setupSwagger = require('../src/docs/swagger');

describe('OpenAPI / Swagger UI Docs Portal (Issue #28)', () => {
  let app;

  beforeAll(() => {
    app = express();
    setupSwagger(app);
  });

  describe('OpenAPI spec file', () => {
    test('openapi.yaml exists and is valid YAML', () => {
      const raw = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
        'utf8',
      );
      const doc = yaml.load(raw);
      expect(doc.openapi).toMatch(/^3\./);
      expect(Object.keys(doc.paths).length).toBeGreaterThan(10);
      expect(Object.keys(doc.components.schemas).length).toBeGreaterThan(20);
    });

    test('spec passes swagger-parser validation', async () => {
      // Lazy import so failures only affect this test
      const SwaggerParser = require('@apidevtools/swagger-parser');
      const api = await SwaggerParser.validate(
        path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
      );
      expect(api.openapi).toMatch(/^3\./);
    });

    test('all response error codes (400/401/403/404/500) use shared components', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      const codes = ['400', '401', '403', '404', '409', '500'];
      let totalResponses = 0;
      let coveredResponses = 0;
      Object.values(doc.paths).forEach((pathItem) => {
        Object.values(pathItem).forEach((op) => {
          if (!op || !op.responses) return;
          Object.entries(op.responses).forEach(([code, resp]) => {
            if (codes.includes(code)) {
              totalResponses += 1;
              if (resp && resp.$ref) coveredResponses += 1;
            }
          });
        });
      });
      expect(totalResponses).toBeGreaterThan(0);
      expect(coveredResponses).toBe(totalResponses);
    });

    test('bearerAuth security scheme documented as JWT bearer', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      const bearer = doc.components.securitySchemes.bearerAuth;
      expect(bearer).toBeDefined();
      expect(bearer.type).toBe('http');
      expect(bearer.scheme).toBe('bearer');
      expect(bearer.bearerFormat).toBe('JWT');
    });

    test('User model has all required fields documented', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      const user = doc.components.schemas.User;
      expect(user).toBeDefined();
      expect(user.properties.id).toBeDefined();
      expect(user.properties.username).toBeDefined();
      expect(user.properties.email).toBeDefined();
      expect(user.properties.role).toBeDefined();
      expect(doc.components.schemas.UserRole).toBeDefined();
    });

    test('key domain models are documented (Course, Credential, Enrollment, Quiz, Assignment, Transaction)', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      [
        'Course',
        'Credential',
        'Enrollment',
        'Quiz',
        'Assignment',
        'Transaction',
      ].forEach((name) => {
        expect(doc.components.schemas[name]).toBeDefined();
      });
    });

    test('protected endpoints declare bearerAuth security requirement', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      const sample = doc.paths['/auth/profile'];
      expect(sample.get.security).toEqual([{ bearerAuth: [] }]);
    });

    test('/courses is documented as an alias of /content/courses', () => {
      const doc = yaml.load(
        fs.readFileSync(
          path.join(__dirname, '..', 'src', 'docs', 'openapi.yaml'),
          'utf8',
        ),
      );
      expect(doc.paths['/courses']).toBeDefined();
      expect(doc.paths['/content/courses']).toBeDefined();
    });

    test('validateRequestSchema is exported from both validation modules', () => {
      const middleware = require('../src/middleware/validation');
      const utils = require('../src/utils/validation');

      expect(typeof middleware.validateRequestSchema).toBe('function');
      expect(typeof utils.validateRequestSchema).toBe('function');

      const factoryMw = utils.validateRequestSchema({
        body: { validate: () => ({ error: null }) },
      });
      expect(typeof factoryMw).toBe('function');
    });

    test('smartWallet route module loads without throwing', () => {
      // The real bound that crashed — `TypeError: (0 , validation_1.validateRequestSchema)
      // is not a function` at smartWallet.ts:24 — must not return at this require.
      expect(() => require('../src/routes/smartWallet')).not.toThrow();
    });
  });

  describe('Swagger UI mounting', () => {
    test('GET /api/docs/openapi.json returns the OpenAPI document', async () => {
      const res = await request(app).get('/api/docs/openapi.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.components.securitySchemes.bearerAuth).toBeDefined();
    });

    test('GET /api/docs/openapi.yaml returns the raw YAML spec', async () => {
      const res = await request(app).get('/api/docs/openapi.yaml');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/yaml|text\/yaml/);
      expect(res.text).toMatch(/openapi: 3\.0\.3/);
    });

    test('GET /api/docs serves the Swagger UI HTML', async () => {
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(400);
      // The page title is customised (`customSiteTitle: 'StarkEd Education API
      // Docs'`), so the literal phrase "Swagger UI" never appears in the
      // rendered HTML. Instead we assert on the kebab-case `swagger-ui`
      // identifier that swagger-ui-express always injects via its
      // stylesheet link (`swagger-ui.css`), bundle script
      // (`swagger-ui-bundle.js`) and root container
      // (`<div id="swagger-ui">`).
      expect(res.text).toMatch(/swagger-ui/i);
    });

    test('GET /api/docs/ serves the Swagger UI HTML on any sub-path', async () => {
      const res = await request(app).get('/api/docs/index.html');
      // 200 if served, 301/302 if redirect, both are acceptable
      expect([200, 301, 302]).toContain(res.status);
    });
  });
});
