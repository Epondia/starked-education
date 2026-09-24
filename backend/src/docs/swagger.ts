/**
 * Swagger UI Setup
 * Serves OpenAPI documentation at /api/docs using swagger-ui-express.
 */
import swaggerUi from 'swagger-ui-express';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { Express } from 'express';

export function setupSwagger(app: Express, apiVersion = 'v1'): void {
  try {
    // Load OpenAPI spec from YAML. `openapi.yaml` is not a .js/.ts file, so tsc
    // does not copy it into dist/ — resolve it from src/ as well, otherwise
    // Swagger silently fails to mount in a production build.
    const candidates = [
      join(__dirname, 'openapi.yaml'),
      join(__dirname, '..', '..', 'src', 'docs', 'openapi.yaml'),
    ];
    const openapiPath = candidates.find((candidate) => existsSync(candidate));
    if (!openapiPath) {
      throw new Error(
        `openapi.yaml not found (looked in: ${candidates.join(', ')})`
      );
    }
    const openapiYaml = readFileSync(openapiPath, 'utf-8');
    const openapiSpec = yaml.parse(openapiYaml);

    // Inject dynamic server URLs so "Try it out" works correctly
    const port = process.env.PORT || '3001';
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
        docExpansion: 'list' as const,
        filter: true,
        displayRequestDuration: true,
      },
    };

    // Serve Swagger UI with the parsed OpenAPI spec
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, swaggerOptions));

    // Serve raw OpenAPI JSON spec
    app.get('/api/docs/openapi.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.json(openapiSpec);
    });

    console.log('📚 Swagger UI available at /api/docs');
    console.log('📄 OpenAPI spec available at /api/docs/openapi.json');
  } catch (error) {
    console.warn('⚠️  Could not set up Swagger UI:', (error as Error).message);
    console.warn('   Make sure swagger-ui-express and yaml are installed.');
  }
}

export default setupSwagger;
