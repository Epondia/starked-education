/**
 * Swagger UI Setup (CommonJS)
 * Serves OpenAPI documentation at /api/docs using swagger-ui-express.
 */
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');

function setupSwagger(app, apiVersion = 'v1') {
  try {
    // Load OpenAPI spec from YAML. `openapi.yaml` is not a .js/.ts file, so tsc
    // does not copy it into dist/ — resolve it from src/ as well, otherwise
    // Swagger silently fails to mount in a production build.
    const candidates = [
      path.join(__dirname, 'openapi.yaml'),
      path.join(__dirname, '..', '..', 'src', 'docs', 'openapi.yaml'),
    ];
    const openapiPath = candidates.find((candidate) => fs.existsSync(candidate));
    if (!openapiPath) {
      throw new Error(
        `openapi.yaml not found (looked in: ${candidates.join(', ')})`
      );
    }
    const openapiYaml = fs.readFileSync(openapiPath, 'utf-8');

    // Parse YAML spec – yaml is a required dependency
    const yaml = require('yaml');
    const openapiSpec = yaml.parse(openapiYaml);

    const port = process.env.PORT || '3001';

    // Inject dynamic server URLs so "Try it out" works correctly
    if (openapiSpec && openapiSpec.servers) {
      openapiSpec.servers = [
        {
          url: `http://localhost:${port}/api/${apiVersion}`,
          description: 'Local development server',
        },
        {
          url: `https://api.starked.education/api/${apiVersion}`,
          description: 'Production server',
        },
      ];
    }

    const swaggerOptions = {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'StarkEd Education API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        tryItOutEnabled: true,
        defaultModelsExpandDepth: 3,
        defaultModelExpandDepth: 3,
        docExpansion: 'list',
        filter: true,
        displayRequestDuration: true,
      },
    };

    // Serve Swagger UI with the parsed OpenAPI spec
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, swaggerOptions));

    // Serve raw OpenAPI spec as JSON
    app.get('/api/docs/openapi.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(openapiSpec);
    });

    console.log('📚 Swagger UI available at /api/docs');
    console.log('📄 OpenAPI spec available at /api/docs/openapi.json');
  } catch (error) {
    console.warn('⚠️  Could not set up Swagger UI:', error.message);
    console.warn('   Make sure swagger-ui-express and yaml are installed.');
  }
}

module.exports = { setupSwagger };
