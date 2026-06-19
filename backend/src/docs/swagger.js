/**
 * Swagger UI wiring for the StarkEd backend.
 *
 * Loads the OpenAPI 3.0 specification from `src/docs/openapi.yaml` and
 * serves the interactive Swagger UI at `/api/docs`.
 *
 * Usage from `src/index.js`:
 *   const setupSwagger = require('./docs/swagger');
 *   setupSwagger(app);
 */

const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');

const DOCS_DIR = __dirname;
const SPEC_PATH = path.join(DOCS_DIR, 'openapi.yaml');

function loadOpenApiDocument() {
  const raw = fs.readFileSync(SPEC_PATH, 'utf8');
  return yaml.load(raw);
}

const openapiDocument = loadOpenApiDocument();

const SWAGGER_UI_OPTIONS = {
  customSiteTitle: 'StarkEd Education API Docs',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
  },
};

function setupSwagger(app) {
  app.get('/api/docs/openapi.yaml', (_req, res) => {
    res.type('text/yaml').send(fs.readFileSync(SPEC_PATH, 'utf8'));
  });

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openapiDocument);
  });

  app.use(
    '/api/docs',
    swaggerUi.serveFiles(openapiDocument, SWAGGER_UI_OPTIONS),
    swaggerUi.setup(openapiDocument, SWAGGER_UI_OPTIONS)
  );
}

module.exports = setupSwagger;
module.exports.openapiDocument = openapiDocument;
module.exports.SPEC_PATH = SPEC_PATH;
