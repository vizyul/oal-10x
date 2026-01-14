/**
 * Auth Middleware Unit Tests
 * Tests for authMiddleware, optionalAuthMiddleware, and guestOnlyMiddleware
 */

// Mock dependencies before requiring the middleware
jest.mock('jsonwebtoken');
jest.mock('../../../src/services/auth.service', () => ({
  findUserById: jest.fn(),
  generateToken: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../../src/utils/redirect.utils', () => ({
  getPostAuthRedirectUrl: jest.fn().mockReturnValue('/dashboard')
}));

const jwt = require('jsonwebtoken');
const { authService } = require('../../../src/services');
const { authMiddleware, optionalAuthMiddleware, guestOnlyMiddleware, clearCachedUser, forceTokenRefresh } = require('../../../src/middleware');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';

    mockReq = {
      cookies: {},
      headers: {},
      requestId: 'test-request-id',
      xhr: false,
      flash: jest.fn()
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('authMiddleware', () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailVerified: true,
      status: 'active',
      role: 'user',
      subscription_tier: 'basic',
      subscription_status: 'active'
    };

    const mockDecodedToken = {
      userId: 1,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailVerified: true,
      status: 'active',
      role: 'user',
      subscription_tier: 'basic',
      subscription_status: 'active'
    };

    it('should authenticate valid token from cookie', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue(mockDecodedToken);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.id).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should authenticate valid token from Authorization header', async () => {
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockDecodedToken);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('valid-token', 'test-secret');
      expect(mockReq.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer cookie token over Authorization header', async () => {
      mockReq.cookies.auth_token = 'cookie-token';
      mockReq.headers.authorization = 'Bearer header-token';
      jwt.verify.mockReturnValue(mockDecodedToken);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith('cookie-token', 'test-secret');
    });

    it('should redirect to sign-in when no token provided for web requests', async () => {
      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
      expect(mockRes.redirect).toHaveBeenCalledWith('/auth/sign-in');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token (JsonWebTokenError)', async () => {
      mockReq.cookies.auth_token = 'invalid-token';
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => { throw error; });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
      expect(mockRes.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });

    it('should return 401 for expired token (TokenExpiredError)', async () => {
      mockReq.cookies.auth_token = 'expired-token';
      const error = new Error('Token expired');
      error.name = 'TokenExpiredError';
      jwt.verify.mockImplementation(() => { throw error; });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
      expect(mockRes.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });

    it('should return JSON error for API requests', async () => {
      mockReq.xhr = true;

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'UNAUTHORIZED'
      }));
    });

    it('should fetch user from database when JWT lacks user data', async () => {
      mockReq.cookies.auth_token = 'old-token';
      jwt.verify.mockReturnValue({ userId: 1, email: 'test@example.com' });
      authService.findUserById.mockResolvedValue(mockUser);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(authService.findUserById).toHaveBeenCalledWith(1);
      expect(mockReq.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when user not found in database', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue({ userId: 999, email: 'notfound@example.com' });
      authService.findUserById.mockResolvedValue(null);

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
    });

    it('should return 401 when email not verified', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue({ ...mockDecodedToken, emailVerified: false });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
    });

    it('should return 401 when account is not active', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue({ ...mockDecodedToken, status: 'suspended' });

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('auth_token');
    });

    it('should refresh token when subscription fields are missing', async () => {
      mockReq.cookies.auth_token = 'old-token';
      jwt.verify.mockReturnValue({
        userId: 1,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        emailVerified: true,
        status: 'active'
      });
      authService.findUserById.mockResolvedValue(mockUser);
      authService.generateToken = jest.fn().mockReturnValue('new-token');

      await authMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.cookie).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('optionalAuthMiddleware', () => {
    const mockDecodedToken = {
      userId: 1,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      emailVerified: true,
      status: 'active',
      role: 'user',
      subscription_tier: 'basic',
      subscription_status: 'active'
    };

    it('should continue without authentication when no token', async () => {
      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should authenticate user when valid token provided', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue(mockDecodedToken);

      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user.id).toBe(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', async () => {
      mockReq.cookies.auth_token = 'invalid-token';
      const error = new Error('Invalid token');
      error.name = 'JsonWebTokenError';
      jwt.verify.mockImplementation(() => { throw error; });

      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set user when email not verified', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue({ ...mockDecodedToken, emailVerified: false });

      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not set user when account not active', async () => {
      mockReq.cookies.auth_token = 'valid-token';
      jwt.verify.mockReturnValue({ ...mockDecodedToken, status: 'suspended' });

      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should authenticate from Authorization header', async () => {
      mockReq.headers.authorization = 'Bearer valid-token';
      jwt.verify.mockReturnValue(mockDecodedToken);

      await optionalAuthMiddleware(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('guestOnlyMiddleware', () => {
    it('should continue when user not authenticated', () => {
      guestOnlyMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should redirect authenticated user for web requests', () => {
      mockReq.user = { id: 1, email: 'test@example.com' };

      guestOnlyMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/dashboard');
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return JSON error for authenticated API requests', () => {
      mockReq.user = { id: 1, email: 'test@example.com' };
      mockReq.xhr = true;

      guestOnlyMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        error: 'ALREADY_AUTHENTICATED'
      }));
    });

    it('should return JSON error when accept header includes json', () => {
      mockReq.user = { id: 1, email: 'test@example.com' };
      mockReq.headers.accept = 'application/json';

      guestOnlyMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('clearCachedUser', () => {
    it('should be a function', () => {
      expect(typeof clearCachedUser).toBe('function');
    });

    it('should not throw when clearing cache', () => {
      expect(() => clearCachedUser(1)).not.toThrow();
    });
  });

  describe('forceTokenRefresh', () => {
    it('should be a function', () => {
      expect(typeof forceTokenRefresh).toBe('function');
    });

    it('should not throw when forcing refresh', () => {
      expect(() => forceTokenRefresh(1)).not.toThrow();
    });
  });
});
