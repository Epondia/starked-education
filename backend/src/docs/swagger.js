const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StarkEd Education API',
      version: '1.0.0',
      description: 'Auto-generated API documentation for StarkEd Education backend.',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Path to the API docs
  apis: ['./src/routes/*.js'], // Adjust if using .ts files
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerSpec, swaggerUi };
