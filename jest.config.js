module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    '<rootDir>/tests/helpers/setup.js',
    '<rootDir>/tests/helpers/database-setup.js'
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/server-https.js',
    '!src/app.js',
    '!src/config/**',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  verbose: true,
  testTimeout: 15000,
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};