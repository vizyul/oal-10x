// Test setup and globals
require('dotenv').config(); // Load .env file FIRST
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.EMAIL_USER = 'test@example.com';
process.env.EMAIL_PASS = 'test-password';
process.env.AIRTABLE_API_KEY = 'test-airtable-key';
process.env.AIRTABLE_BASE_ID = 'test-base-id';

// Mock logger before any other imports to prevent errors during module loading
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  request: jest.fn(),
  auth: jest.fn(),
  database: jest.fn(),
  security: jest.fn(),
  performance: jest.fn(),
  event: jest.fn(),
  maskEmail: jest.fn((email) => email),
  sanitize: jest.fn((str) => str)
}));

// HTTPS and OAuth testing environment
process.env.HOST = '0.0.0.0';
process.env.HTTPS_PORT = '4433'; // Different port for testing to avoid conflicts
process.env.CORS_ORIGIN = 'https://dev.amplifycontent.ai:4433';

// OAuth test configuration (use mock values for testing)
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'https://dev.amplifycontent.ai:4433/auth/google/callback';

process.env.APPLE_CLIENT_ID = 'test-apple-client-id';
process.env.APPLE_TEAM_ID = 'test-apple-team-id';
process.env.APPLE_KEY_ID = 'test-apple-key-id';
process.env.APPLE_PRIVATE_KEY = 'test-apple-private-key';
process.env.APPLE_CALLBACK_URL = 'https://dev.amplifycontent.ai:4433/auth/apple/callback';

process.env.MICROSOFT_CLIENT_ID = 'test-microsoft-client-id';
process.env.MICROSOFT_CLIENT_SECRET = 'test-microsoft-client-secret';
process.env.MICROSOFT_CALLBACK_URL = 'https://dev.amplifycontent.ai:4433/auth/microsoft/callback';

// Mock console.log for cleaner test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Global test helpers
global.createMockUser = () => ({
  id: '1',
  email: 'test@example.com',
  password: 'hashedpassword',
  isVerified: true,
  createdAt: new Date()
});

global.createMockRequest = (overrides = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: null,
  ...overrides
});

global.createMockResponse = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    send: jest.fn(() => res),
    cookie: jest.fn(() => res),
    clearCookie: jest.fn(() => res)
  };
  return res;
};

// Setup and teardown
beforeEach(() => {
  jest.clearAllMocks();
});