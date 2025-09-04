const airtable = require('../services/airtable.service');
const stripeConfig = require('../config/stripe.config');
const { logger } = require('../utils');

// Tier hierarchy for comparison
const TIER_HIERARCHY = {
  'free': 0,
  'basic': 1,
  'premium': 2,
  'enterprise': 3
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
        const userTierLevel = TIER_HIERARCHY[userTier] || 0;
        const requiredTierLevel = TIER_HIERARCHY[minTier] || 1;
        
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
        
        // Get tier configuration
        const tierConfig = stripeConfig.getTierConfig(userTier);
        if (!tierConfig) {
          return handleSubscriptionError(req, res, 'Invalid subscription tier', 500);
        }

        // Check if unlimited for this resource
        const resourceLimit = getResourceLimit(tierConfig, resource);
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
        await incrementUserUsage(
          req.usageInfo.userId,
          req.usageInfo.resource,
          req.usageInfo.increment
        );
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
        const tierConfig = stripeConfig.getTierConfig(userTier);
        
        if (!tierConfig) {
          return handleSubscriptionError(req, res, 'Invalid subscription tier', 500);
        }

        const hasAccess = checkFeatureAccess(tierConfig, feature);
        
        if (!hasAccess) {
          return handleSubscriptionError(req, res, `Feature requires upgrade`, 403, {
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
        const tierConfig = stripeConfig.getTierConfig(userTier);
        const usage = await getCurrentUsageAll(req.user.id);

        req.subscriptionInfo = {
          tier: userTier,
          status: req.user.subscription_status || 'none',
          features: tierConfig || {},
          usage: usage,
          limits: {
            videos: getResourceLimit(tierConfig, 'videos'),
            api_calls: getResourceLimit(tierConfig, 'api_calls'),
            storage: getResourceLimit(tierConfig, 'storage')
          }
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
async function getCurrentUsage(userId, resource) {
  try {
    // Get current subscription to find billing period
    const subscription = await getUserActiveSubscription(userId);
    if (!subscription) {
      // No active subscription, return 0 usage
      return 0;
    }

    const periodStart = new Date(subscription.current_period_start);
    const periodEnd = new Date(subscription.current_period_end);
    const now = new Date();

    // Find usage record for current period
    const usageRecords = await airtable.findByField('Subscription_Usage', 'user_id', userId);
    const currentUsage = usageRecords.find(usage => {
      const usagePeriodStart = new Date(usage.period_start);
      const usagePeriodEnd = new Date(usage.period_end);
      return usagePeriodStart <= now && usagePeriodEnd >= now;
    });

    if (!currentUsage) {
      return 0;
    }

    const fieldName = getUsageFieldName(resource);
    return currentUsage[fieldName] || 0;
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
    // For now, return default usage since User_Subscriptions lookup is failing
    // TODO: Fix linked field lookup in User_Subscriptions table
    return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };

    const now = new Date();
    const usageRecords = await airtable.findByField('Subscription_Usage', 'user_id', userId);
    const currentUsage = usageRecords.find(usage => {
      const usagePeriodStart = new Date(usage.period_start);
      const usagePeriodEnd = new Date(usage.period_end);
      return usagePeriodStart <= now && usagePeriodEnd >= now;
    });

    if (!currentUsage) {
      return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
    }

    return {
      videos: currentUsage.videos_processed || 0,
      api_calls: currentUsage.api_calls_made || 0,
      storage: currentUsage.storage_used_mb || 0,
      ai_summaries: currentUsage.ai_summaries_generated || 0
    };
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
    const subscription = await getUserActiveSubscription(userId);
    if (!subscription) {
      // No active subscription, don't track usage
      return;
    }

    const now = new Date();
    const usageRecords = await airtable.findByField('Subscription_Usage', 'user_id', userId);
    let currentUsage = usageRecords.find(usage => {
      const usagePeriodStart = new Date(usage.period_start);
      const usagePeriodEnd = new Date(usage.period_end);
      return usagePeriodStart <= now && usagePeriodEnd >= now;
    });

    const fieldName = getUsageFieldName(resource);
    
    if (currentUsage) {
      // Update existing usage record
      const newValue = (currentUsage[fieldName] || 0) + increment;
      await airtable.update('Subscription_Usage', currentUsage.id, {
        [fieldName]: newValue
      });
    } else {
      // Create new usage record for current period
      const subscriptionRecords = await airtable.findByField('User_Subscriptions', 'stripe_subscription_id', subscription.stripe_subscription_id);
      const subscriptionRecord = subscriptionRecords[0];
      
      if (subscriptionRecord) {
        await airtable.create('Subscription_Usage', {
          user_id: [userId],
          subscription_id: [subscriptionRecord.id],
          period_start: new Date(subscription.current_period_start).toISOString().split('T')[0],
          period_end: new Date(subscription.current_period_end).toISOString().split('T')[0],
          [fieldName]: increment,
          videos_processed: resource === 'videos' ? increment : 0,
          api_calls_made: resource === 'api_calls' ? increment : 0,
          storage_used_mb: resource === 'storage' ? increment : 0,
          ai_summaries_generated: resource === 'ai_summaries' ? increment : 0,
          analytics_views: resource === 'analytics' ? increment : 0
        });
      }
    }
  } catch (error) {
    logger.error('Error incrementing usage:', error);
  }
}

/**
 * Get active subscription for user
 */
async function getUserActiveSubscription(userId) {
  try {
    const subscriptions = await airtable.findByField('User_Subscriptions', 'user_id', userId);
    return subscriptions.find(sub => 
      ['active', 'trialing', 'paused'].includes(sub.status)
    );
  } catch (error) {
    logger.error('Error getting user subscription:', error);
    return null;
  }
}

/**
 * Map resource name to Airtable field name
 */
function getUsageFieldName(resource) {
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