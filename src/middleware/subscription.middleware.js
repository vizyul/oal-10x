const database = require('../services/database.service');
const stripeConfig = require('../config/stripe.config');
const { logger } = require('../utils');

// Tier hierarchy for comparison
const TIER_HIERARCHY = {
  'free': 0,
  'basic': 1,
  'premium': 2,
  'enterprise': 3,
  'creator': 4
};

/**
 * Subscription middleware functions
 */
const subscriptionMiddleware = {
  /**
   * Require minimum subscription tier to access route
   * @param {string} minTier - Minimum required tier ('basic', 'premium', 'enterprise')
   * @returns {Function} Express middleware function
   */
  requireSubscription: (minTier = 'basic') => {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return handleSubscriptionError(req, res, 'Authentication required', 401);
        }

        const userTier = req.user.subscription_tier || 'free';
        const userStatus = req.user.subscription_status || 'none';

        // Check if user has sufficient tier
        const userTierLevel = TIER_HIERARCHY[userTier] !== undefined ? TIER_HIERARCHY[userTier] : 0;
        const requiredTierLevel = TIER_HIERARCHY[minTier] !== undefined ? TIER_HIERARCHY[minTier] : 1;

        if (userTierLevel < requiredTierLevel) {
          return handleSubscriptionError(req, res, 'Subscription upgrade required', 403, {
            current_tier: userTier,
            required_tier: minTier,
            upgrade_url: '/subscription/upgrade'
          });
        }

        // Check if subscription is active (unless free tier)
        if (userTier !== 'free' && !['active', 'trialing', 'paused'].includes(userStatus)) {
          return handleSubscriptionError(req, res, 'Active subscription required', 403, {
            current_status: userStatus,
            billing_url: '/subscription/billing'
          });
        }

        req.userTier = userTier;
        req.userSubscriptionStatus = userStatus;
        next();
      } catch (error) {
        logger.error('Subscription middleware error:', error);
        return handleSubscriptionError(req, res, 'Subscription check failed', 500);
      }
    };
  },

  /**
   * Check usage limits for current billing period
   * @param {string} resource - Resource type ('videos', 'api_calls', 'storage')
   * @param {number} increment - Amount to increment usage by (default: 1)
   * @returns {Function} Express middleware function
   */
  checkUsageLimit: (resource = 'videos', increment = 1) => {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return handleSubscriptionError(req, res, 'Authentication required', 401);
        }

        const userId = req.user.id;
        const userTier = req.user.subscription_tier || 'free';
        const subscriptionService = require('../services/subscription.service');

        // PRIORITY 1: Check for admin grants first
        if (resource === 'videos') {
          const grantAccess = await subscriptionService.checkGrantAccess(userId);

          if (grantAccess.hasGrant) {
            logger.info(`User ${userId} has active admin grant: ${grantAccess.grantType}`);

            // Unlimited videos grant - always allow
            if (grantAccess.videoLimit === Infinity) {
              req.usageInfo = {
                userId,
                resource,
                increment,
                currentUsage: 0,
                limit: Infinity,
                hasAdminGrant: true,
                grantType: grantAccess.grantType
              };
              return next();
            }

            // Grant with specific limit - check against grant limit
            const currentUsage = await getCurrentUsage(userId, resource);
            const newUsage = currentUsage + increment;

            if (newUsage > grantAccess.videoLimit) {
              return handleSubscriptionError(req, res, 'Admin grant video limit exceeded', 429, {
                current_usage: currentUsage,
                limit: grantAccess.videoLimit,
                resource_type: resource,
                grant_type: grantAccess.grantType,
                has_admin_grant: true
              });
            }

            req.usageInfo = {
              userId,
              resource,
              increment,
              currentUsage,
              limit: grantAccess.videoLimit,
              hasAdminGrant: true,
              grantType: grantAccess.grantType
            };
            return next();
          }
        }

        // PRIORITY 2: Standard subscription logic

        // Special handling for free tier users with video resources
        if (userTier === 'free' && resource === 'videos') {
          const freeVideoUsed = await subscriptionService.hasFreeVideoBeenUsed(userId);

          if (freeVideoUsed) {
            return handleSubscriptionError(req, res, 'Free video credit used. Upgrade to continue.', 429, {
              current_usage: 1,
              limit: 1,
              resource_type: resource,
              upgrade_url: '/subscription/upgrade',
              free_credit_used: true
            });
          }

          // Free user has credit available, store special flag for later processing
          req.usageInfo = {
            userId,
            resource,
            increment,
            currentUsage: 0,
            limit: 1,
            isFreeTrialUser: true
          };

          return next();
        }

        // Get tier configuration for paid users from database
        const subscriptionPlansService = require('../services/subscription-plans.service');
        const planData = await subscriptionPlansService.getPlanByKey(userTier);
        if (!planData) {
          return handleSubscriptionError(req, res, 'Invalid subscription tier', 500);
        }

        // Check if unlimited for this resource
        const resourceLimit = planData.videoLimit; // Currently only supports video limits
        if (resourceLimit === -1) {
          // Unlimited usage
          return next();
        }

        // Get current usage for this billing period
        const currentUsage = await getCurrentUsage(userId, resource);
        const newUsage = currentUsage + increment;

        if (newUsage > resourceLimit) {
          return handleSubscriptionError(req, res, `${resource} limit exceeded`, 429, {
            current_usage: currentUsage,
            limit: resourceLimit,
            resource_type: resource,
            upgrade_url: '/subscription/upgrade'
          });
        }

        // Store usage info for potential increment after successful request
        req.usageInfo = {
          userId,
          resource,
          increment,
          currentUsage,
          limit: resourceLimit
        };

        next();
      } catch (error) {
        logger.error('Usage limit check error:', error);
        return handleSubscriptionError(req, res, 'Usage check failed', 500);
      }
    };
  },

  /**
   * Increment usage counter after successful request
   * Call this after the main route handler succeeds
   */
  incrementUsage: async (req, res, next) => {
    try {
      if (req.usageInfo) {
        // Special handling for free trial users
        if (req.usageInfo.isFreeTrialUser) {
          const subscriptionService = require('../services/subscription.service');
          await subscriptionService.markFreeVideoAsUsed(req.usageInfo.userId);
          logger.info(`Marked free video as used for user ${req.usageInfo.userId}`);
        } else {
          // Regular paid subscription usage tracking
          await incrementUserUsage(
            req.usageInfo.userId,
            req.usageInfo.resource,
            req.usageInfo.increment
          );
        }
      }
      next();
    } catch (error) {
      logger.error('Usage increment error:', error);
      // Don't fail the request if usage tracking fails
      next();
    }
  },

  /**
   * Check if user can access specific feature
   * @param {string} feature - Feature name ('analytics', 'api', 'unlimited_videos')
   * @returns {Function} Express middleware function
   */
  requireFeature: (feature) => {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return handleSubscriptionError(req, res, 'Authentication required', 401);
        }

        const userTier = req.user.subscription_tier || 'free';
        const subscriptionPlansService = require('../services/subscription-plans.service');
        const featureFlags = await subscriptionPlansService.getFeatureFlags(userTier);

        if (!featureFlags) {
          return handleSubscriptionError(req, res, 'Invalid subscription tier', 500);
        }

        const hasAccess = checkFeatureAccess(featureFlags, feature);

        if (!hasAccess) {
          return handleSubscriptionError(req, res, 'Feature requires upgrade', 403, {
            feature,
            current_tier: userTier,
            upgrade_url: '/subscription/upgrade'
          });
        }

        next();
      } catch (error) {
        logger.error('Feature access check error:', error);
        return handleSubscriptionError(req, res, 'Feature check failed', 500);
      }
    };
  },

  /**
   * Add subscription info to response for frontend use
   */
  addSubscriptionInfo: async (req, res, next) => {
    try {
      if (req.user) {
        const userTier = req.user.subscription_tier || 'free';
        const subscriptionPlansService = require('../services/subscription-plans.service');
        const subscriptionService = require('../services/subscription.service');
        const planData = await subscriptionPlansService.getPlanByKey(userTier);
        const usage = await getCurrentUsageAll(req.user.id);

        // Check for admin grants
        const grantAccess = await subscriptionService.checkGrantAccess(req.user.id);

        let videoLimit = planData ? planData.videoLimit : 0;
        let effectiveTier = userTier;
        let grantInfo = null;

        // If user has an admin grant, use grant limits instead
        if (grantAccess.hasGrant) {
          grantInfo = {
            type: grantAccess.grantType,
            tierOverride: grantAccess.tierOverride,
            videoLimit: grantAccess.videoLimit,
            expiresAt: grantAccess.expiresAt
          };

          // Override video limit with grant limit
          if (grantAccess.videoLimit === Infinity) {
            videoLimit = -1; // Use -1 to indicate unlimited
          } else {
            videoLimit = grantAccess.videoLimit;
          }

          // If full_access grant, use the tier override
          if (grantAccess.grantType === 'full_access' && grantAccess.tierOverride) {
            effectiveTier = grantAccess.tierOverride;
          }
        }

        const limits = {
          videos: videoLimit,
          api_calls: 0, // TODO: Add api_calls limit to subscription_plans
          storage: 0  // TODO: Add storage limit to subscription_plans
        };

        const percentages = {
          videos: limits.videos === -1 ? 0 : Math.min((usage.videos / limits.videos) * 100, 100),
          api_calls: limits.api_calls === -1 ? 0 : Math.min((usage.api_calls / limits.api_calls) * 100, 100),
          storage: limits.storage === -1 ? 0 : Math.min((usage.storage / limits.storage) * 100, 100)
        };

        req.subscriptionInfo = {
          tier: userTier,
          effectiveTier: effectiveTier,
          status: req.user.subscription_status || 'none',
          features: planData ? planData.features : [],
          usage: usage,
          limits: limits,
          percentages: percentages,
          remainingVideos: limits.videos === -1 ? Infinity : Math.max(0, limits.videos - usage.videos),
          hasAdminGrant: grantAccess.hasGrant,
          grantInfo: grantInfo
        };
      }
      next();
    } catch (error) {
      logger.error('Subscription info middleware error:', error);
      next(); // Continue without subscription info
    }
  }
};

/**
 * Helper function to handle subscription-related errors
 */
function handleSubscriptionError(req, res, message, statusCode = 403, details = {}) {
  logger.warn(`Subscription error: ${message}`, {
    userId: req.user?.id,
    path: req.path,
    details
  });

  // For API requests, return JSON
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(statusCode).json({
      success: false,
      message,
      error: 'SUBSCRIPTION_ERROR',
      ...details
    });
  }

  // For web requests, redirect to subscription page
  try {
    if (req.flash && typeof req.flash === 'function') {
      req.flash('error', message);
    }
  } catch (flashError) {
    logger.debug('Flash not available:', flashError.message);
  }

  const redirectUrl = statusCode === 401 ? '/auth/sign-in' : '/subscription/upgrade';
  return res.redirect(redirectUrl);
}

/**
 * Get resource limit for a tier configuration
 */
function getResourceLimit(tierConfig, resource) {
  if (!tierConfig) return 0;

  switch (resource) {
  case 'videos':
    return tierConfig.videoLimit || 0;
  case 'api_calls':
    return tierConfig.apiLimit || 0;
  case 'storage':
    return tierConfig.storageLimit || 0;
  default:
    return 0;
  }
}

/**
 * Check if tier has access to specific feature
 */
function checkFeatureAccess(tierConfig, feature) {
  if (!tierConfig) return false;

  switch (feature) {
  case 'analytics':
    return tierConfig.analyticsAccess === true;
  case 'api':
    return tierConfig.apiAccess === true;
  case 'unlimited_videos':
    return tierConfig.videoLimit === -1;
  case 'priority_support':
    return tierConfig.prioritySupport === true;
  default:
    return false;
  }
}

/**
 * Get current usage for a resource in current billing period
 */
async function getCurrentUsage(userId, _resource) {
  try {
    const subscriptionService = require('../services/subscription.service');

    // Resolve user ID if it's an Airtable record ID
    let resolvedUserId = userId;
    if (typeof userId === 'string' && userId.startsWith('rec')) {
      // This is an Airtable record ID, need to resolve to PostgreSQL user ID
      const userRecord = await database.findByField('users', 'airtable_id', userId);
      if (userRecord.length === 0) {
        logger.warn(`No PostgreSQL user found for Airtable ID: ${userId}`);
        return 0;
      }
      const userData = userRecord[0].fields || userRecord[0];
      resolvedUserId = userData.id;
    }

    // Use subscription service method instead of raw SQL
    return await subscriptionService.getCurrentPeriodUsage(resolvedUserId);
  } catch (error) {
    logger.error('Error getting current usage:', error);
    return 0;
  }
}

/**
 * Get all current usage for user
 */
async function getCurrentUsageAll(userId) {
  try {
    const subscriptionService = require('../services/subscription.service');

    // Resolve user ID if it's an Airtable record ID
    let resolvedUserId = userId;
    if (typeof userId === 'string' && userId.startsWith('rec')) {
      // This is an Airtable record ID, need to resolve to PostgreSQL user ID
      const userRecord = await database.findByField('users', 'airtable_id', userId);
      if (userRecord.length === 0) {
        logger.warn(`No PostgreSQL user found for Airtable ID: ${userId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }
      const userData = userRecord[0].fields || userRecord[0];
      resolvedUserId = userData.id;
    }

    // Use subscription service method instead of raw SQL
    return await subscriptionService.getCurrentPeriodUsageBreakdown(resolvedUserId);
  } catch (error) {
    logger.error('Error getting all usage:', error);
    return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
  }
}

/**
 * Increment usage counter for user
 */
async function incrementUserUsage(userId, resource, increment = 1) {
  try {
    const subscriptionService = require('../services/subscription.service');

    // Resolve user ID if it's an Airtable record ID
    let resolvedUserId = userId;
    if (typeof userId === 'string' && userId.startsWith('rec')) {
      // This is an Airtable record ID, need to resolve to PostgreSQL user ID
      const userRecord = await database.findByField('users', 'airtable_id', userId);
      if (userRecord.length === 0) {
        logger.warn(`No PostgreSQL user found for Airtable ID: ${userId}`);
        return;
      }
      const userData = userRecord[0].fields || userRecord[0];
      resolvedUserId = userData.id;
    }

    // Use subscription service method instead of raw SQL
    await subscriptionService.trackUsage(resolvedUserId, resource, increment);
  } catch (error) {
    logger.error('Error incrementing usage:', error);
  }
}

/**
 * Get active subscription for user
 */
// eslint-disable-next-line no-unused-vars
async function _getUserActiveSubscription(userId) {
  try {
    const subscriptionService = require('../services/subscription.service');

    // Use subscription service method instead of raw SQL
    return await subscriptionService.getUserActiveSubscriptionByPgId(userId);
  } catch (error) {
    logger.error('Error getting user subscription:', error);
    return null;
  }
}

/**
 * Map resource name to database field name
 */
// eslint-disable-next-line no-unused-vars
function _getUsageFieldName(resource) {
  const fieldMap = {
    'videos': 'videos_processed',
    'api_calls': 'api_calls_made',
    'storage': 'storage_used_mb',
    'ai_summaries': 'ai_summaries_generated',
    'analytics': 'analytics_views'
  };

  return fieldMap[resource] || 'videos_processed';
}

module.exports = subscriptionMiddleware;
