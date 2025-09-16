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
      // Get current usage using model
      const currentUsage = await subscriptionUsage.getCurrentByUserId(userId);

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

}

module.exports = new SubscriptionService();
