/**
 * Standalone Jest config for middleware unit tests.
 * Skips the global setup.js (which imports the full app and requires
 * swagger-ui-express) so the middleware tests run in isolation.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src/middleware/__tests__'],
  testMatch: ['**/*.test.js'],
  testTimeout: 15000,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/',
  ],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  restoreMocks: true,
};
