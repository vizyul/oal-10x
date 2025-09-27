/**
 * Centralized Rate Limiting Configuration
 *
 * This file defines all rate limiting rules for the application.
 * Organizes limits by endpoint type and user context.
 */

// Base time windows (in milliseconds)
const TIME_WINDOWS = {
  ONE_MINUTE: 60 * 1000,
  FIVE_MINUTES: 5 * 60 * 1000,
  FIFTEEN_MINUTES: 15 * 60 * 1000,
  ONE_HOUR: 60 * 60 * 1000,
  ONE_DAY: 24 * 60 * 60 * 1000
};

// Environment-based multipliers
const ENV_MULTIPLIER = process.env.NODE_ENV === 'development' ? 10 : 1;

/**
 * Authentication & Security Rate Limits
 * Very strict limits to prevent brute force attacks
 */
const AUTH_LIMITS = {
  // High-security operations (sign-in, password reset)
  SECURITY: {
    windowMs: TIME_WINDOWS.FIFTEEN_MINUTES,
    max: Math.ceil(5 * ENV_MULTIPLIER), // 5 attempts in 15 min (50 in dev)
    message: {
      success: false,
      message: 'Too many authentication attempts. Please try again later.',
      error: 'AUTH_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins
    skipFailedRequests: false     // Count failed attempts
  },

  // Email verification operations
  EMAIL_VERIFICATION: {
    windowMs: TIME_WINDOWS.FIVE_MINUTES,
    max: Math.ceil(3 * ENV_MULTIPLIER), // 3 codes per 5 min
    message: {
      success: false,
      message: 'Too many verification code requests. Please wait before trying again.',
      error: 'EMAIL_VERIFICATION_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  },

  // Account creation (less strict than login)
  REGISTRATION: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(10 * ENV_MULTIPLIER), // 10 registration attempts per hour
    message: {
      success: false,
      message: 'Too many registration attempts. Please try again later.',
      error: 'REGISTRATION_RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false
  }
};

/**
 * API Rate Limits by Subscription Tier
 * Different limits based on user's subscription level
 */
const API_LIMITS = {
  // Anonymous/unauthenticated users
  ANONYMOUS: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(50 * ENV_MULTIPLIER), // 50 requests per hour
    message: {
      success: false,
      message: 'Rate limit exceeded. Please sign in for higher limits.',
      error: 'ANONYMOUS_API_RATE_LIMIT_EXCEEDED'
    }
  },

  // Free tier users
  FREE: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(100 * ENV_MULTIPLIER), // 100 requests per hour
    message: {
      success: false,
      message: 'API rate limit exceeded. Upgrade your plan for higher limits.',
      error: 'FREE_TIER_RATE_LIMIT_EXCEEDED'
    }
  },

  // Premium tier users
  PREMIUM: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(500 * ENV_MULTIPLIER), // 500 requests per hour
    message: {
      success: false,
      message: 'API rate limit exceeded. Please try again later.',
      error: 'PREMIUM_TIER_RATE_LIMIT_EXCEEDED'
    }
  },

  // Enterprise tier users
  ENTERPRISE: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(2000 * ENV_MULTIPLIER), // 2000 requests per hour
    message: {
      success: false,
      message: 'API rate limit exceeded. Please contact support if you need higher limits.',
      error: 'ENTERPRISE_TIER_RATE_LIMIT_EXCEEDED'
    }
  }
};

/**
 * Content Processing Rate Limits
 * For expensive operations like video processing, AI generation
 */
const CONTENT_LIMITS = {
  // Video uploads/imports
  VIDEO_PROCESSING: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: (user) => {
      const baseLimits = { free: 5, premium: 20, enterprise: 100 };
      const userTier = user?.subscription_tier || 'free';
      return Math.ceil((baseLimits[userTier] || baseLimits.free) * ENV_MULTIPLIER);
    },
    message: {
      success: false,
      message: 'Video processing limit reached. Upgrade your plan or wait before processing more videos.',
      error: 'VIDEO_PROCESSING_RATE_LIMIT_EXCEEDED'
    },
    keyFunction: (req) => `video_processing:${req.user?.id || req.ip}` // User-based or IP-based
  },

  // AI content generation
  AI_GENERATION: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: (user) => {
      const baseLimits = { free: 10, premium: 50, enterprise: 200 };
      const userTier = user?.subscription_tier || 'free';
      return Math.ceil((baseLimits[userTier] || baseLimits.free) * ENV_MULTIPLIER);
    },
    message: {
      success: false,
      message: 'AI generation limit reached. Upgrade your plan or wait before generating more content.',
      error: 'AI_GENERATION_RATE_LIMIT_EXCEEDED'
    },
    keyFunction: (req) => `ai_generation:${req.user?.id || req.ip}`
  }
};

/**
 * Public/Web Page Rate Limits
 * Generous limits for normal browsing
 */
const WEB_LIMITS = {
  // Public pages (marketing, info pages)
  PUBLIC_PAGES: {
    windowMs: TIME_WINDOWS.ONE_MINUTE,
    max: Math.ceil(30 * ENV_MULTIPLIER), // 30 requests per minute (0.5/second avg)
    message: {
      success: false,
      message: 'Too many requests. Please slow down.',
      error: 'PUBLIC_PAGE_RATE_LIMIT_EXCEEDED'
    },
    skip: (req) => {
      // Skip rate limiting for static assets
      return req.path.match(/\.(css|js|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/i);
    }
  },

  // Contact form submissions
  CONTACT_FORM: {
    windowMs: TIME_WINDOWS.ONE_HOUR,
    max: Math.ceil(5 * ENV_MULTIPLIER), // 5 contact submissions per hour
    message: {
      success: false,
      message: 'Too many contact form submissions. Please try again later.',
      error: 'CONTACT_FORM_RATE_LIMIT_EXCEEDED'
    }
  }
};

/**
 * Rate Limit Categories
 * Maps endpoint patterns to appropriate rate limit configurations
 */
const RATE_LIMIT_CATEGORIES = {
  // Authentication endpoints
  AUTH_SECURITY: {
    paths: [
      'POST /auth/sign-in',
      'POST /auth/forgot-password',
      'POST /auth/reset-password/:token'
    ],
    config: AUTH_LIMITS.SECURITY
  },

  AUTH_EMAIL_VERIFICATION: {
    paths: [
      'POST /auth/sign-up/send-code',
      'POST /auth/sign-up/resend-code',
      'POST /auth/social-verify'
    ],
    config: AUTH_LIMITS.EMAIL_VERIFICATION
  },

  AUTH_REGISTRATION: {
    paths: [
      'POST /auth/sign-up',
      'POST /auth/sign-up/verify-code',
      'POST /auth/sign-up/complete'
    ],
    config: AUTH_LIMITS.REGISTRATION
  },

  // API endpoints (user-tier aware)
  API_GENERAL: {
    paths: [
      '/api/videos*',
      '/api/preferences*',
      '/api/subscription*'
    ],
    config: 'USER_TIER_BASED', // Special handling in middleware
    getUserTier: (req) => req.user?.subscription_tier || (req.user ? 'free' : 'anonymous')
  },

  // Content processing
  VIDEO_PROCESSING: {
    paths: [
      'POST /api/videos/import',
      'POST /api/videos/process',
      'POST /api/videos/*/process-content'
    ],
    config: CONTENT_LIMITS.VIDEO_PROCESSING
  },

  AI_GENERATION: {
    paths: [
      'POST /api/videos/*/generate/*',
      'POST /api/ai/*'
    ],
    config: CONTENT_LIMITS.AI_GENERATION
  },

  // Public web pages
  PUBLIC_PAGES: {
    paths: [
      'GET /',
      'GET /about',
      'GET /contact',
      'GET /auth/sign-in',
      'GET /auth/sign-up*'
    ],
    config: WEB_LIMITS.PUBLIC_PAGES
  },

  CONTACT_FORM: {
    paths: [
      'POST /contact',
      'POST /demo'
    ],
    config: WEB_LIMITS.CONTACT_FORM
  }
};

module.exports = {
  TIME_WINDOWS,
  AUTH_LIMITS,
  API_LIMITS,
  CONTENT_LIMITS,
  WEB_LIMITS,
  RATE_LIMIT_CATEGORIES,
  ENV_MULTIPLIER
};