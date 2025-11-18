const { logger } = require('../utils');
const { user, userSubscription, subscriptionUsage } = require('../models');

class SubscriptionService {
  /**
   * Helper method to resolve user ID to PostgreSQL ID
   * @param {string|number} userId - User identifier
   * @returns {Promise<number|null>} PostgreSQL user ID or null
   */
  async _resolveUserId(userId) {
    return await user.resolveUserId(userId);
  }

  /**
   * Increment usage counter for a specific resource type
   * @param {string} userId - User ID
   * @param {string} resource - Resource type ('videos', 'api_calls', 'storage', 'ai_summaries')
   * @param {number} increment - Amount to increment by (default: 1)
   */
  async incrementUsage(userId, resource = 'videos', increment = 1) {
    try {
      logger.info(`Incrementing ${resource} usage for user ${userId} by ${increment}`);

      // Get user's active subscription
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        logger.debug(`No active subscription found for user ${userId}, skipping usage increment`);
        return;
      }

      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.debug(`No user found with identifier ${userId}, skipping usage increment`);
        return;
      }

      // Get active subscription for the user
      const activeSubscription = await userSubscription.getActiveByUserId(pgUserId);
      if (!activeSubscription) {
        logger.debug(`No active subscription found for user ${pgUserId}, skipping usage increment`);
        return;
      }

      const subscriptionId = activeSubscription.id;
      const currentUsage = await subscriptionUsage.getCurrentBySubscriptionId(subscriptionId);

      const fieldName = this.getUsageFieldName(resource);

      if (currentUsage) {
        // Update existing usage record using model
        await subscriptionUsage.incrementUsage(subscriptionId, fieldName, increment);
        logger.info(`Updated ${resource} usage for user ${userId}: +${increment}`);
      } else {
        // Create new usage record for current period
        const usageData = {
          user_subscriptions_id: subscriptionId,
          period_start: new Date(subscription.current_period_start).toISOString().split('T')[0],
          period_end: new Date(subscription.current_period_end).toISOString().split('T')[0]
        };

        await subscriptionUsage.createUsage(usageData);
        await subscriptionUsage.incrementUsage(subscriptionId, fieldName, increment);
        logger.info(`Created new ${resource} usage record for user ${userId}: ${increment}`);
      }
    } catch (error) {
      logger.error(`Error incrementing ${resource} usage for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's current usage for all resources
   * @param {string} userId - User ID
   * @returns {Object} Usage object with current counts
   */
  async getCurrentUsage(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      logger.info(`Getting current usage for user ${userId} (pgUserId: ${pgUserId})`);

      // Get current usage using model
      const currentUsage = await subscriptionUsage.getCurrentByUserId(pgUserId);

      if (!currentUsage) {
        logger.info(`No current billing period usage record found for user ${pgUserId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      const result = {
        videos: currentUsage.videos_processed || 0,
        api_calls: currentUsage.api_calls_made || 0,
        storage: currentUsage.storage_used_mb || 0,
        ai_summaries: currentUsage.ai_summaries_generated || 0
      };

      logger.info(`Current usage for user ${pgUserId}:`, result);
      return result;
    } catch (error) {
      logger.error('Error getting current usage:', error);
      return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
    }
  }

  /**
   * Get user's active subscription
   * @param {string} userId - User ID
   * @returns {Object|null} Active subscription or null
   */
  async getUserActiveSubscription(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        return null;
      }

      const activeSubscription = await userSubscription.getActiveByUserId(pgUserId);
      return activeSubscription;
    } catch (error) {
      logger.error('Error getting user subscription:', error);
      return null;
    }
  }

  /**
   * Map resource name to PostgreSQL field name
   * @param {string} resource - Resource type
   * @returns {string} Field name
   */
  getUsageFieldName(resource) {
    const fieldMap = {
      'videos': 'videos_processed',
      'api_calls': 'api_calls_made',
      'storage': 'storage_used_mb',
      'ai_summaries': 'ai_summaries_generated',
      'analytics': 'analytics_views'
    };

    return fieldMap[resource] || 'videos_processed';
  }

  /**
   * Get user's current period usage count for a specific resource
   * Used by middleware for usage limits checking
   * @param {number} userId - PostgreSQL user ID
   * @returns {number} Current usage count
   */
  async getCurrentPeriodUsage(userId) {
    try {
      // Get current usage using model
      const currentUsage = await subscriptionUsage.getCurrentByUserId(userId);

      if (!currentUsage) {
        return 0;
      }

      return currentUsage.videos_processed || 0;
    } catch (error) {
      logger.error('Error getting current period usage:', error);
      return 0;
    }
  }

  /**
   * Get detailed usage breakdown for current period
   * Used by middleware for detailed usage tracking
   * @param {number} userId - PostgreSQL user ID
   * @returns {Object} Usage breakdown object
   */
  async getCurrentPeriodUsageBreakdown(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.warn(`No user found for identifier ${userId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      // Get current usage from subscription_usage table for ALL users (including free tier)
      const currentUsage = await subscriptionUsage.getCurrentByUserId(pgUserId);

      if (!currentUsage) {
        logger.warn(`No subscription usage record found for user ${pgUserId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      return {
        videos: currentUsage.videos_processed || 0,
        api_calls: currentUsage.api_calls_made || 0,
        storage: currentUsage.storage_used_mb || 0,
        ai_summaries: currentUsage.ai_summaries_generated || 0
      };
    } catch (error) {
      logger.error('Error getting current period usage breakdown:', error);
      return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
    }
  }

  /**
   * Track usage for a resource (used by middleware)
   * @param {number} userId - PostgreSQL user ID
   * @param {string} resource - Resource type
   * @param {number} increment - Amount to increment
   */
  async trackUsage(userId, resource, increment = 1) {
    try {
      // Get user's active subscription using model
      const activeSubscription = await userSubscription.getActiveByUserId(userId);
      if (!activeSubscription) {
        logger.debug(`No active subscription found for user ${userId}, skipping usage tracking`);
        return;
      }

      const subscriptionId = activeSubscription.id;
      const fieldName = this.getUsageFieldName(resource);

      // Get current usage record
      let currentUsage = await subscriptionUsage.getCurrentBySubscriptionId(subscriptionId);

      if (currentUsage) {
        // Update existing usage record using model
        await subscriptionUsage.incrementUsage(subscriptionId, fieldName, increment);
      } else {
        // Create new usage record for current period
        const usageData = {
          user_subscriptions_id: subscriptionId,
          period_start: new Date(activeSubscription.current_period_start),
          period_end: new Date(activeSubscription.current_period_end)
        };

        await subscriptionUsage.createUsage(usageData);
        await subscriptionUsage.incrementUsage(subscriptionId, fieldName, increment);
      }

      logger.info(`Tracked ${resource} usage for user ${userId}: +${increment}`);
    } catch (error) {
      logger.error(`Error tracking ${resource} usage for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's active subscription by PostgreSQL user ID
   * @param {number} userId - PostgreSQL user ID
   * @returns {Object|null} Active subscription or null
   */
  async getUserActiveSubscriptionByPgId(userId) {
    try {
      // Use the model's method which handles the same logic
      return await userSubscription.getActiveByUserId(userId);
    } catch (error) {
      logger.error('Error getting user subscription by PG ID:', error);
      return null;
    }
  }

  /**
   * Create a new subscription for a user
   * @param {Object} subscriptionData - Subscription data
   * @returns {Promise<Object>} Created subscription
   */
  async createSubscription(subscriptionData) {
    try {
      logger.info(`Creating subscription for user ${subscriptionData.users_id}`);

      const subscription = await userSubscription.createSubscription(subscriptionData);
      logger.info(`Subscription created: ${subscription.id}`);

      return subscription;
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  /**
   * Create a usage record for a subscription
   * @param {Object} usageData - Usage data
   * @returns {Promise<Object>} Created usage record
   */
  async createUsageRecord(usageData) {
    try {
      logger.info(`Creating usage record for subscription ${usageData.user_subscriptions_id}`);

      const usage = await subscriptionUsage.createUsage(usageData);
      logger.info(`Usage record created: ${usage.id}`);

      return usage;
    } catch (error) {
      logger.error('Error creating usage record:', error);
      throw new Error('Failed to create usage record');
    }
  }

  /**
   * Check if user can process another video based on subscription limits
   * @param {string|number} userId - User ID
   * @returns {Promise<boolean>} Whether user can process video
   */
  async canProcessVideo(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.debug(`No user found for identifier ${userId}, assuming they can process`);
        return true;
      }

      // Get user's active subscription
      const activeSubscription = await userSubscription.getActiveByUserId(pgUserId);
      if (!activeSubscription) {
        logger.debug(`No active subscription found for user ${userId}, assuming they can process`);
        return true;
      }

      // Use model method to check if usage limit has been exceeded
      const hasExceeded = await subscriptionUsage.hasExceededLimit(activeSubscription.id, 'videos_processed');

      logger.debug(`User ${userId} video processing limit check: ${hasExceeded ? 'exceeded' : 'within limit'}`);

      return !hasExceeded; // Return true if not exceeded
    } catch (error) {
      logger.error('Error checking video processing capability:', error);
      // In case of error, allow processing (fail-safe)
      return true;
    }
  }

  /**
   * Decrement videos_processed count when a video is cancelled
   * This restores the user's monthly allowance for cancelled videos
   */
  async decrementVideoProcessedCount(userId) {
    try {
      logger.debug(`Decrementing videos_processed count for user ${userId}`);

      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.warn(`User not found for identifier ${userId}`);
        return false;
      }

      // Get user's active subscription
      const activeSubscription = await userSubscription.getActiveByUserId(pgUserId);
      if (!activeSubscription) {
        logger.warn(`No subscription found for user ${pgUserId} - cannot decrement`);
        return false;
      }

      // Get current usage record
      const currentUsage = await subscriptionUsage.getCurrentBySubscriptionId(activeSubscription.id);
      if (!currentUsage) {
        logger.warn(`No usage record found for user ${pgUserId} - cannot decrement`);
        return false;
      }

      const currentCount = currentUsage.videos_processed || 0;

      // Don't decrement below 0
      if (currentCount <= 0) {
        logger.warn(`videos_processed count already at ${currentCount} for user ${userId} - not decrementing`);
        return false;
      }

      // Use model method to decrement usage
      await subscriptionUsage.decrementUsage(activeSubscription.id, 'videos_processed', 1);

      logger.info(`Successfully decremented videos_processed from ${currentCount} to ${currentCount - 1} for user ${userId}`);
      return true;

    } catch (error) {
      logger.error('Error decrementing videos_processed count:', error);
      throw error;
    }
  }

  /**
   * Check if free user has used their trial video
   * @param {string|number} userId - User identifier
   * @returns {Promise<boolean>} Whether free video has been used
   */
  async hasFreeVideoBeenUsed(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.debug(`No user found for identifier ${userId}`);
        return true; // If user not found, assume trial used to be safe
      }

      const database = require('./database.service');
      const result = await database.query('SELECT free_video_used FROM users WHERE id = $1', [pgUserId]);

      if (result.rows.length === 0) {
        logger.warn(`User ${pgUserId} not found in database`);
        return true; // Safe default
      }

      const freeVideoUsed = result.rows[0].free_video_used;
      logger.debug(`User ${pgUserId} free video used status: ${freeVideoUsed}`);

      return freeVideoUsed === true;
    } catch (error) {
      logger.error('Error checking free video usage status:', error);
      return true; // Safe default - assume used if error
    }
  }

  /**
   * Mark free video as used for user
   * @param {string|number} userId - User identifier
   * @returns {Promise<boolean>} Whether the operation was successful
   */
  async markFreeVideoAsUsed(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.warn(`No user found for identifier ${userId}`);
        return false;
      }

      const database = require('./database.service');
      const result = await database.query(
        'UPDATE users SET free_video_used = TRUE WHERE id = $1 AND free_video_used = FALSE RETURNING id',
        [pgUserId]
      );

      if (result.rows.length === 0) {
        logger.warn(`Could not mark free video as used for user ${pgUserId} - already used or user not found`);
        return false;
      }

      logger.info(`✅ Marked free video as used for user ${pgUserId}`);
      return true;
    } catch (error) {
      logger.error('Error marking free video as used:', error);
      return false;
    }
  }

  /**
   * Check if user can process a video (enhanced with free trial logic)
   * @param {string|number} userId - User identifier
   * @returns {Promise<{canProcess: boolean, reason?: string, requiresUpgrade?: boolean}>}
   */
  async canProcessVideoEnhanced(userId) {
    try {
      // Get PostgreSQL user ID using User model
      const pgUserId = await this._resolveUserId(userId);
      if (!pgUserId) {
        logger.debug(`No user found for identifier ${userId}`);
        return { canProcess: false, reason: 'User not found' };
      }

      // Get user's subscription tier
      const database = require('./database.service');
      const userResult = await database.query('SELECT subscription_tier, free_video_used FROM users WHERE id = $1', [pgUserId]);

      if (userResult.rows.length === 0) {
        return { canProcess: false, reason: 'User not found' };
      }

      const user = userResult.rows[0];
      const userTier = user.subscription_tier || 'free';
      const freeVideoUsed = user.free_video_used;

      logger.debug(`User ${pgUserId} tier: ${userTier}, free video used: ${freeVideoUsed}`);

      // Handle free tier users
      if (userTier === 'free') {
        if (freeVideoUsed === true) {
          return {
            canProcess: false,
            reason: 'Free video credit has been used. Upgrade to continue processing videos.',
            requiresUpgrade: true
          };
        } else {
          return { canProcess: true, reason: 'Free video available' };
        }
      }

      // For paid subscribers, use existing logic
      const activeSubscription = await this.getUserActiveSubscriptionByPgId(pgUserId);
      if (!activeSubscription) {
        return {
          canProcess: false,
          reason: 'No active subscription found. Please subscribe or renew.',
          requiresUpgrade: true
        };
      }

      // Use existing limit checking for paid users
      const { subscriptionUsage } = require('../models');
      const hasExceeded = await subscriptionUsage.hasExceededLimit(activeSubscription.id, 'videos_processed');

      if (hasExceeded) {
        return {
          canProcess: false,
          reason: 'Monthly video limit reached. Upgrade your plan or wait for next billing cycle.',
          requiresUpgrade: true
        };
      }

      return { canProcess: true, reason: 'Within subscription limits' };

    } catch (error) {
      logger.error('Error checking enhanced video processing capability:', error);
      // In case of error, allow processing (fail-safe) but log the issue
      return { canProcess: true, reason: 'Error during check - allowing processing' };
    }
  }

  /**
   * Initialize subscription and usage records for free tier users
   * Called during user registration to set up the free 1-video limit
   * @param {number} userId - PostgreSQL user ID
   * @returns {Promise<Object>} Created records
   */
  async initializeFreeUserSubscription(userId) {
    try {
      logger.info(`Initializing free subscription for user ${userId}`);

      // Check if user already has subscription records
      const existingSub = await userSubscription.getActiveByUserId(userId);
      if (existingSub) {
        logger.info(`User ${userId} already has subscription records, skipping initialization`);
        return { subscription: existingSub };
      }

      // Create user_subscriptions record for free tier
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

      const subscriptionData = {
        users_id: userId,
        stripe_subscription_id: null,
        plan_name: 'Free',
        status: 'active',
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false
      };

      const subscriptionRecord = await userSubscription.create(subscriptionData);
      logger.info(`Created user_subscriptions record ${subscriptionRecord.id} for user ${userId}`);

      // Create subscription_usage record with 1 video limit
      const usageData = {
        user_id: userId,
        user_subscriptions_id: subscriptionRecord.id,
        usage_type: 'monthly',
        usage_limit: 1, // Free tier gets 1 video
        videos_processed: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        ai_summaries_generated: 0,
        analytics_views: 0,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        reset_date: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
      };

      const usageRecord = await subscriptionUsage.createUsage(usageData);
      logger.info(`Created subscription_usage record ${usageRecord.id} for user ${userId} with 1 video limit`);

      return {
        subscription: subscriptionRecord,
        usage: usageRecord
      };
    } catch (error) {
      logger.error(`Error initializing free subscription for user ${userId}:`, error);
      throw error;
    }
  }

}

module.exports = new SubscriptionService();
