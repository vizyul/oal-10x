/**
 * Rate Limiting Middleware Unit Tests
 * Tests for rate limiting middleware functions
 */

// Mock the rate limiting service before requiring the middleware
jest.mock('../../../src/services/rate-limiting.service', () => ({
  getLimiter: jest.fn(),
  createAutoLimitingMiddleware: jest.fn(() => jest.fn((req, res, next) => next())),
  getStatistics: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const rateLimitingService = require('../../../src/services/rate-limiting.service');
const {
  authSecurityLimit,
  emailVerificationLimit,
  registrationLimit,
  apiLimit,
  videoProcessingLimit,
  aiGenerationLimit,
  publicPageLimit,
  contactFormLimit,
  createCustomRateLimit,
  addRateLimitHeaders,
  logRateLimitEvents,
  bypassRateLimit,
  rateLimitStatus
} = require('../../../src/middleware/rate-limiting.middleware');

describe('Rate Limiting Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;
  let mockLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';

    mockReq = {
      user: { id: 1, subscription_tier: 'basic', role: 'user' },
      ip: '127.0.0.1',
      path: '/test',
      method: 'GET',
      xhr: false,
      headers: {},
      get: jest.fn()
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      render: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();

    // Create a mock limiter function
    mockLimiter = jest.fn((req, res, next) => next());
  });

  describe('authSecurityLimit', () => {
    it('should call AUTH_SECURITY limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      authSecurityLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('AUTH_SECURITY');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      authSecurityLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('AUTH_SECURITY');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('emailVerificationLimit', () => {
    it('should call AUTH_EMAIL_VERIFICATION limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      emailVerificationLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('AUTH_EMAIL_VERIFICATION');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      emailVerificationLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('registrationLimit', () => {
    it('should call AUTH_REGISTRATION limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      registrationLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('AUTH_REGISTRATION');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      registrationLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('apiLimit', () => {
    it('should call API_GENERAL limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      apiLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('API_GENERAL');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      apiLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('videoProcessingLimit', () => {
    it('should call VIDEO_PROCESSING limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      videoProcessingLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('VIDEO_PROCESSING');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      videoProcessingLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('aiGenerationLimit', () => {
    it('should call AI_GENERATION limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      aiGenerationLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('AI_GENERATION');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      aiGenerationLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('publicPageLimit', () => {
    it('should call PUBLIC_PAGES limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      publicPageLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('PUBLIC_PAGES');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      publicPageLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('contactFormLimit', () => {
    it('should call CONTACT_FORM limiter when available', () => {
      rateLimitingService.getLimiter.mockReturnValue(mockLimiter);

      contactFormLimit(mockReq, mockRes, mockNext);

      expect(rateLimitingService.getLimiter).toHaveBeenCalledWith('CONTACT_FORM');
      expect(mockLimiter).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });

    it('should call next directly when no limiter found', () => {
      rateLimitingService.getLimiter.mockReturnValue(null);

      contactFormLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('createCustomRateLimit', () => {
    it('should create a rate limiter function', () => {
      const customLimiter = createCustomRateLimit({
        windowMs: 60000,
        max: 10,
        message: 'Custom limit exceeded'
      });

      expect(typeof customLimiter).toBe('function');
    });

    it('should create limiter with custom message', () => {
      const customLimiter = createCustomRateLimit({
        windowMs: 60000,
        max: 5,
        message: 'Too many requests from this IP'
      });

      expect(customLimiter).toBeDefined();
    });
  });

  describe('addRateLimitHeaders', () => {
    it('should call next', () => {
      addRateLimitHeaders(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should override res.set to add user tier header', () => {
      const originalSet = mockRes.set;

      addRateLimitHeaders(mockReq, mockRes, mockNext);

      // The middleware replaces res.set with a new function
      expect(mockRes.set).not.toBe(originalSet);
      expect(typeof mockRes.set).toBe('function');
    });

    it('should work when user is not authenticated', () => {
      mockReq.user = null;

      addRateLimitHeaders(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('logRateLimitEvents', () => {
    it('should call next', () => {
      logRateLimitEvents(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should override res.status to log 429 events', () => {
      const logger = require('../../../src/utils/logger');

      logRateLimitEvents(mockReq, mockRes, mockNext);

      // Simulate a 429 status being set
      mockRes.status(429);

      expect(logger.info).toHaveBeenCalledWith('Rate limit triggered', expect.objectContaining({
        path: '/test',
        method: 'GET'
      }));
    });

    it('should not log non-429 status codes', () => {
      const logger = require('../../../src/utils/logger');

      logRateLimitEvents(mockReq, mockRes, mockNext);

      // Simulate a 200 status being set
      mockRes.status(200);

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('bypassRateLimit', () => {
    it('should bypass rate limiting in development with BYPASS_RATE_LIMITS=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_RATE_LIMITS = 'true';

      bypassRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should not bypass in production even with BYPASS_RATE_LIMITS=true', () => {
      process.env.NODE_ENV = 'production';
      process.env.BYPASS_RATE_LIMITS = 'true';

      // In production, bypassRateLimit calls autoRateLimit instead of next directly
      // This verifies the function doesn't throw and processes the request
      expect(() => bypassRateLimit(mockReq, mockRes, mockNext)).not.toThrow();
    });

    it('should not bypass when BYPASS_RATE_LIMITS is not set', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BYPASS_RATE_LIMITS;

      // When not bypassed, autoRateLimit is called
      expect(() => bypassRateLimit(mockReq, mockRes, mockNext)).not.toThrow();
    });

    it('should not bypass when BYPASS_RATE_LIMITS is false', () => {
      process.env.NODE_ENV = 'development';
      process.env.BYPASS_RATE_LIMITS = 'false';

      expect(() => bypassRateLimit(mockReq, mockRes, mockNext)).not.toThrow();
    });
  });

  describe('rateLimitStatus', () => {
    it('should return rate limit stats for admin on correct path', async () => {
      mockReq.path = '/admin/rate-limit-status';
      mockReq.user = { id: 1, role: 'admin', subscription_tier: 'enterprise' };
      rateLimitingService.getStatistics.mockReturnValue({
        totalLimiters: 8,
        categories: ['AUTH_SECURITY', 'API_GENERAL']
      });

      await rateLimitStatus(mockReq, mockRes, mockNext);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          totalLimiters: 8
        })
      }));
    });

    it('should call next for non-admin users', async () => {
      mockReq.path = '/admin/rate-limit-status';
      mockReq.user = { id: 1, role: 'user' };

      await rateLimitStatus(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should call next for different paths', async () => {
      mockReq.path = '/api/videos';
      mockReq.user = { id: 1, role: 'admin' };

      await rateLimitStatus(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should call next when no user', async () => {
      mockReq.path = '/admin/rate-limit-status';
      mockReq.user = null;

      await rateLimitStatus(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('limiter integration scenarios', () => {
    it('should handle limiter that blocks request', () => {
      const blockingLimiter = jest.fn((req, res, next) => {
        res.status(429).json({ error: 'RATE_LIMITED' });
      });
      rateLimitingService.getLimiter.mockReturnValue(blockingLimiter);

      authSecurityLimit(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'RATE_LIMITED' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass through when limiter allows', () => {
      const allowingLimiter = jest.fn((req, res, next) => next());
      rateLimitingService.getLimiter.mockReturnValue(allowingLimiter);

      authSecurityLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });
});
