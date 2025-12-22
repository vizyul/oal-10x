/**
 * Centralized Rate Limiting Service
 *
 * Provides intelligent rate limiting based on user context,
 * subscription tiers, and endpoint types.
 */

const rateLimit = require('express-rate-limit');
const { logger } = require('../utils');
const {
  API_LIMITS,
  RATE_LIMIT_CATEGORIES
} = require('../config/rate-limits.config');

class RateLimitingService {
  constructor() {
    this.limiters = new Map();
    this.initializeLimiters();
  }

  /**
   * Initialize all rate limiters based on configuration
   */
  initializeLimiters() {
    // Create limiters for each category
    Object.entries(RATE_LIMIT_CATEGORIES).forEach(([categoryName, category]) => {
      if (category.config === 'USER_TIER_BASED') {
        // Special handling for user-tier based limiting
        this.limiters.set(categoryName, this.createUserTierLimiter(category));
        // Pre-create all tier-specific limiters
        this.initializeTierLimiters();
      } else {
        // Standard rate limiter
        this.limiters.set(categoryName, this.createStandardLimiter(category.config, categoryName));
      }
    });

    logger.info(`Initialized ${this.limiters.size} rate limiters`);
  }

  /**
   * Pre-initialize all tier-specific limiters
   */
  initializeTierLimiters() {
    const tiers = ['anonymous', 'free', 'premium', 'enterprise', 'creator'];

    tiers.forEach(tier => {
      const limiterKey = `api_${tier}`;
      const tierConfig = API_LIMITS[tier.toUpperCase()] || API_LIMITS.ANONYMOUS;

      const enhancedTierConfig = {
        ...tierConfig,
        keyGenerator: (req) => {
          if (req.user?.id) {
            return `user:${req.user.id}:api`;
          }
          return `ip:${this.getClientIP(req)}:api`;
        },
        handler: (req, res) => {
          logger.warn(`API rate limit exceeded`, {
            userTier: tier,
            userId: req.user?.id || 'anonymous',
            clientIP: this.getClientIP(req),
            path: req.path,
            method: req.method
          });

          return res.status(429).json(tierConfig.message);
        },
        standardHeaders: true,
        legacyHeaders: false
      };

      this.limiters.set(limiterKey, rateLimit(enhancedTierConfig));
    });
  }

  /**
   * Create a standard rate limiter with enhanced features
   */
  createStandardLimiter(config, categoryName) {
    const enhancedConfig = {
      ...config,
      // Enhanced key generation
      keyGenerator: (req) => {
        // Use custom key function if provided
        if (config.keyFunction) {
          return config.keyFunction(req);
        }

        // User-based limiting for authenticated users
        if (req.user?.id) {
          return `user:${req.user.id}:${categoryName}`;
        }

        // IP-based limiting for anonymous users
        return `ip:${this.getClientIP(req)}:${categoryName}`;
      },

      // Enhanced request skipping
      skip: (req, res) => {
        // Use custom skip function if provided
        if (config.skip) {
          return config.skip(req, res);
        }
        return false;
      },

      // Enhanced error handling
      handler: (req, res) => {
        const clientIP = this.getClientIP(req);
        const userId = req.user?.id || 'anonymous';

        logger.warn(`Rate limit exceeded`, {
          category: categoryName,
          userId,
          clientIP,
          path: req.path,
          method: req.method,
          userAgent: req.get('User-Agent')
        });

        // Send appropriate response based on request type
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
          return res.status(429).json(config.message);
        } else {
          // For web requests, redirect with error message
          return res.status(429).render('errors/rate-limit', {
            title: 'Rate Limit Exceeded',
            message: config.message.message,
            retryAfter: Math.ceil(config.windowMs / 1000 / 60), // minutes
            showHeader: true,
            showFooter: true
          });
        }
      },

      // Add rate limit headers
      standardHeaders: true,
      legacyHeaders: false
    };

    return rateLimit(enhancedConfig);
  }

  /**
   * Create user-tier based rate limiter for API endpoints
   */
  createUserTierLimiter(category) {
    return (req, res, next) => {
      const userTier = category.getUserTier(req);
      const limiterKey = `api_${userTier}`;

      // Get the pre-created limiter for this tier
      const limiter = this.limiters.get(limiterKey);

      if (!limiter) {
        logger.warn(`No rate limiter found for tier: ${userTier}`, {
          availableLimiters: Array.from(this.limiters.keys()),
          requestPath: req.path
        });
        // Fallback to anonymous tier if limiter not found
        const fallbackLimiter = this.limiters.get('api_anonymous');
        if (fallbackLimiter) {
          return fallbackLimiter(req, res, next);
        }
        // If no fallback available, continue without rate limiting
        return next();
      }

      // Apply the tier-specific limiter
      return limiter(req, res, next);
    };
  }

  /**
   * Get the appropriate rate limiter for a request
   */
  getLimiterForRequest(req) {
    const method = req.method;
    const path = req.path;
    const routeKey = `${method} ${path}`;

    // Find matching category
    for (const [categoryName, category] of Object.entries(RATE_LIMIT_CATEGORIES)) {
      if (this.matchesPath(routeKey, path, category.paths)) {
        return {
          categoryName,
          limiter: this.limiters.get(categoryName)
        };
      }
    }

    return null;
  }

  /**
   * Check if request path matches any of the configured paths
   */
  matchesPath(routeKey, path, configuredPaths) {
    return configuredPaths.some(configPath => {
      // Exact match
      if (routeKey === configPath) return true;

      // Wildcard match (e.g., '/api/videos*')
      if (configPath.includes('*')) {
        const basePattern = configPath.replace('*', '');
        return routeKey.startsWith(basePattern) || path.startsWith(basePattern.split(' ')[1] || basePattern);
      }

      // Parameter match (e.g., '/auth/reset-password/:token')
      if (configPath.includes(':')) {
        const pattern = configPath.replace(/:[^\/]+/g, '[^/]+');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(routeKey);
      }

      return false;
    });
  }

  /**
   * Get client IP address with proxy support
   */
  getClientIP(req) {
    return req.ip ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
           'unknown';
  }

  /**
   * Create middleware that automatically applies appropriate rate limiting
   */
  createAutoLimitingMiddleware() {
    return (req, res, next) => {
      const limiterInfo = this.getLimiterForRequest(req);

      if (limiterInfo && limiterInfo.limiter) {
        logger.debug(`Applying rate limiter: ${limiterInfo.categoryName}`, {
          path: req.path,
          method: req.method,
          userId: req.user?.id || 'anonymous'
        });

        return limiterInfo.limiter(req, res, next);
      }

      // No specific rate limiter found, continue without limiting
      next();
    };
  }

  /**
   * Get rate limiter by category name
   */
  getLimiter(categoryName) {
    return this.limiters.get(categoryName);
  }

  /**
   * Get current rate limit status for a user/IP
   */
  async getRateLimitStatus(req, categoryName) {
    const limiter = this.limiters.get(categoryName);
    if (!limiter) return null;

    // This would require extending express-rate-limit to expose current counts
    // For now, return basic info
    return {
      category: categoryName,
      userId: req.user?.id || null,
      clientIP: this.getClientIP(req)
    };
  }

  /**
   * Reset rate limits for a specific user (admin function)
   */
  async resetUserRateLimits(userId) {
    // This would require implementing a custom store that supports selective reset
    logger.info(`Rate limits reset requested for user: ${userId}`);
    // Implementation depends on the store being used (memory, Redis, etc.)
  }

  /**
   * Get rate limiting statistics
   */
  getStatistics() {
    return {
      totalLimiters: this.limiters.size,
      categories: Array.from(this.limiters.keys()),
      environment: process.env.NODE_ENV,
      isDevelopment: process.env.NODE_ENV === 'development'
    };
  }
}

// Create singleton instance
const rateLimitingService = new RateLimitingService();

module.exports = rateLimitingService;
