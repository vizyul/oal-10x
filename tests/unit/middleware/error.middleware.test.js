/**
 * Error Middleware Unit Tests
 * Tests for errorMiddleware global error handler
 */

// Mock logger before requiring the middleware
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const { errorMiddleware } = require('../../../src/middleware');

describe('Error Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';

    mockReq = {
      xhr: false,
      headers: {},
      requestId: 'test-request-id'
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      render: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('error handling', () => {
    it('should return 500 for generic errors', () => {
      const error = new Error('Something went wrong');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should return JSON for API requests (xhr)', () => {
      mockReq.xhr = true;
      const error = new Error('API error');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Internal server error',
        error: 'INTERNAL_SERVER_ERROR'
      }));
    });

    it('should return JSON for requests accepting json', () => {
      mockReq.headers.accept = 'application/json';
      const error = new Error('API error');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should render error page for web requests', () => {
      const error = new Error('Web error');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.render).toHaveBeenCalledWith('errors/500', expect.objectContaining({
        title: 'Server Error',
        showHeader: true,
        showFooter: true
      }));
    });
  });

  describe('error type handling', () => {
    it('should return 400 for ValidationError', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 for CastError', () => {
      const error = new Error('Invalid cast');
      error.name = 'CastError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 401 for UnauthorizedError', () => {
      const error = new Error('Unauthorized');
      error.name = 'UnauthorizedError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should return 413 for LIMIT_FILE_SIZE error', () => {
      const error = new Error('File too large');
      error.code = 'LIMIT_FILE_SIZE';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(413);
    });
  });

  describe('error codes', () => {
    it('should return VALIDATION_ERROR code for ValidationError', () => {
      mockReq.xhr = true;
      const error = new Error('Validation failed');
      error.name = 'ValidationError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'VALIDATION_ERROR'
      }));
    });

    it('should return INVALID_FORMAT code for CastError', () => {
      mockReq.xhr = true;
      const error = new Error('Invalid cast');
      error.name = 'CastError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'INVALID_FORMAT'
      }));
    });

    it('should return UNAUTHORIZED code for UnauthorizedError', () => {
      mockReq.xhr = true;
      const error = new Error('Unauthorized');
      error.name = 'UnauthorizedError';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'UNAUTHORIZED'
      }));
    });

    it('should return FILE_TOO_LARGE code for LIMIT_FILE_SIZE', () => {
      mockReq.xhr = true;
      const error = new Error('File too large');
      error.code = 'LIMIT_FILE_SIZE';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'FILE_TOO_LARGE'
      }));
    });
  });

  describe('development mode', () => {
    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      mockReq.xhr = true;
      const error = new Error('Dev error');
      error.stack = 'Error: Dev error\n    at test.js:1:1';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        stack: expect.any(String)
      }));
    });

    it('should show actual error message for web in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Detailed error message');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.render).toHaveBeenCalledWith('errors/500', expect.objectContaining({
        message: 'Detailed error message'
      }));
    });
  });

  describe('production mode', () => {
    it('should not include stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      mockReq.xhr = true;
      const error = new Error('Prod error');
      error.stack = 'Error: Prod error\n    at test.js:1:1';

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.not.objectContaining({
        stack: expect.any(String)
      }));
    });

    it('should show generic message for web in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Sensitive error details');

      errorMiddleware(error, mockReq, mockRes, mockNext);

      expect(mockRes.render).toHaveBeenCalledWith('errors/500', expect.objectContaining({
        message: 'Internal server error'
      }));
    });
  });
});
