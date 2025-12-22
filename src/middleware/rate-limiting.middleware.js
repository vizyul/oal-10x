/**
 * Centralized Rate Limiting Middleware
 *
 * Provides easy-to-use middleware functions for different types of rate limiting.
 * Replaces scattered rate limiting logic throughout the application.
 */

const rateLimitingService = require('../services/rate-limiting.service');
const { logger } = require('../utils');

/**
 * Auto-applying rate limiting middleware
 * Automatically determines and applies appropriate rate limits based on the request
 */
const autoRateLimit = rateLimitingService.createAutoLimitingMiddleware();

/**
 * Specific rate limiting middleware functions
 * Use these when you need explicit control over which rate limiter to apply
 */

// Authentication security (sign-in, password reset)
const authSecurityLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('AUTH_SECURITY');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// Email verification (code sending, resending)
const emailVerificationLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('AUTH_EMAIL_VERIFICATION');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// Registration attempts
const registrationLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('AUTH_REGISTRATION');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// API endpoints (user-tier aware)
const apiLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('API_GENERAL');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// Video processing operations
const videoProcessingLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('VIDEO_PROCESSING');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// AI content generation
const aiGenerationLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('AI_GENERATION');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// Public pages
const publicPageLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('PUBLIC_PAGES');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

// Contact forms
const contactFormLimit = (req, res, next) => {
  const limiter = rateLimitingService.getLimiter('CONTACT_FORM');
  if (limiter) {
    return limiter(req, res, next);
  }
  next();
};

/**
 * Helper function to create custom rate limiters
 * Use this for one-off rate limiting needs
 */
const createCustomRateLimit = (config) => {
  const rateLimit = require('express-rate-limit');

  const enhancedConfig = {
    ...config,
    keyGenerator: (req) => {
      if (req.user?.id) {
        return `user:${req.user.id}:custom`;
      }
      return `ip:${req.ip}:custom`;
    },
    handler: (req, res) => {
      logger.warn('Custom rate limit exceeded', {
        userId: req.user?.id || 'anonymous',
        clientIP: req.ip,
        path: req.path,
        method: req.method
      });

      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(429).json({
          success: false,
          message: config.message || 'Rate limit exceeded. Please try again later.',
          error: 'CUSTOM_RATE_LIMIT_EXCEEDED'
        });
      } else {
        return res.status(429).render('errors/rate-limit', {
          title: 'Rate Limit Exceeded',
          message: config.message || 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(config.windowMs / 1000 / 60),
          showHeader: true,
          showFooter: true
        });
      }
    }
  };

  return rateLimit(enhancedConfig);
};

/**
 * Middleware to add rate limit information to responses
 * Useful for API clients to understand their current usage
 */
const addRateLimitHeaders = (req, res, next) => {
  // Store original res.set function
  const originalSet = res.set.bind(res);

  // Intercept header setting to add rate limit info
  res.set = function(field, value) {
    // Call original set
    originalSet(field, value);

    // Add additional rate limit context if available
    if (req.user && req.user.id) {
      originalSet('X-RateLimit-User-Tier', req.user.subscription_tier || 'free');
      originalSet('X-RateLimit-User-ID', req.user.id.toString());
    }

    return this;
  };

  next();
};

/**
 * Middleware to log rate limiting events for monitoring
 */
const logRateLimitEvents = (req, res, next) => {
  // Store original res.status function
  const originalStatus = res.status.bind(res);

  res.status = function(statusCode) {
    // Log rate limit events
    if (statusCode === 429) {
      logger.info('Rate limit triggered', {
        path: req.path,
        method: req.method,
        userId: req.user?.id || 'anonymous',
        userTier: req.user?.subscription_tier || 'anonymous',
        clientIP: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
    }

    return originalStatus(statusCode);
  };

  next();
};

/**
 * Development-only middleware to bypass rate limiting
 * Use sparingly and only during development/testing
 */
const bypassRateLimit = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_RATE_LIMITS === 'true') {
    logger.debug('Rate limiting bypassed for development');
    return next();
  }

  // In production or when not explicitly bypassed, continue to rate limiting
  return autoRateLimit(req, res, next);
};

/**
 * Administrative middleware to check rate limit status
 * Provides information about current rate limit state
 */
const rateLimitStatus = async (req, res, next) => {
  if (req.path === '/admin/rate-limit-status' && req.user?.role === 'admin') {
    const stats = rateLimitingService.getStatistics();

    return res.json({
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString(),
        requestInfo: {
          userId: req.user?.id,
          userTier: req.user?.subscription_tier,
          clientIP: req.ip,
          path: req.path
        }
      }
    });
  }

  next();
};

module.exports = {
  // Main middleware functions
  autoRateLimit,

  // Specific rate limiters
  authSecurityLimit,
  emailVerificationLimit,
  registrationLimit,
  apiLimit,
  videoProcessingLimit,
  aiGenerationLimit,
  publicPageLimit,
  contactFormLimit,

  // Utility functions
  createCustomRateLimit,
  addRateLimitHeaders,
  logRateLimitEvents,
  bypassRateLimit,
  rateLimitStatus,

  // Service access
  rateLimitingService
};
