/**
 * Validation Middleware Unit Tests
 * Tests for validationMiddleware express-validator error handler
 */

// Mock logger before requiring the middleware
jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

const { validationResult } = require('express-validator');
const { validationMiddleware } = require('../../../src/middleware');

describe('Validation Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      xhr: false,
      headers: {},
      requestId: 'test-request-id',
      body: {},
      flash: jest.fn()
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('when validation passes', () => {
    it('should call next when no validation errors', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('when validation fails', () => {
    const mockErrors = [
      { path: 'email', msg: 'Invalid email format', value: 'notanemail' },
      { path: 'password', msg: 'Password too short', value: '123' }
    ];

    beforeEach(() => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => mockErrors
      });
    });

    it('should return 400 status', () => {
      mockReq.xhr = true;

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return JSON for XHR requests', () => {
      mockReq.xhr = true;

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR'
      }));
    });

    it('should return JSON for requests accepting JSON', () => {
      mockReq.headers.accept = 'application/json';

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should include formatted errors in JSON response', () => {
      mockReq.xhr = true;

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Invalid email format'
          }),
          expect.objectContaining({
            field: 'password',
            message: 'Password too short'
          })
        ])
      }));
    });

    it('should redirect for form submissions', () => {
      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('back');
    });

    it('should flash errors for form submissions', () => {
      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.flash).toHaveBeenCalledWith('errors', expect.any(Array));
    });

    it('should flash form data for form submissions', () => {
      mockReq.body = { email: 'test@example.com', password: '123' };

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.flash).toHaveBeenCalledWith('formData', mockReq.body);
    });

    it('should not call next when validation fails', () => {
      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('error formatting', () => {
    it('should use path as field name', () => {
      mockReq.xhr = true;
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ path: 'fieldName', msg: 'Error message', value: 'bad' }]
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'fieldName' })
        ])
      }));
    });

    it('should fallback to param if path is undefined', () => {
      mockReq.xhr = true;
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ param: 'paramName', msg: 'Error message', value: 'bad' }]
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ field: 'paramName' })
        ])
      }));
    });

    it('should include value in formatted errors', () => {
      mockReq.xhr = true;
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ path: 'field', msg: 'Error', value: 'invalidValue' }]
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        errors: expect.arrayContaining([
          expect.objectContaining({ value: 'invalidValue' })
        ])
      }));
    });
  });

  describe('multiple errors', () => {
    it('should handle multiple validation errors', () => {
      mockReq.xhr = true;
      const multipleErrors = [
        { path: 'field1', msg: 'Error 1', value: 'val1' },
        { path: 'field2', msg: 'Error 2', value: 'val2' },
        { path: 'field3', msg: 'Error 3', value: 'val3' }
      ];

      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => multipleErrors
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      const responseData = mockRes.json.mock.calls[0][0];
      expect(responseData.errors).toHaveLength(3);
    });
  });

  describe('edge cases', () => {
    it('should handle empty error array gracefully', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle undefined accept header', () => {
      mockReq.headers = {};
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ path: 'field', msg: 'Error', value: 'bad' }]
      });

      validationMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('back');
    });
  });
});
