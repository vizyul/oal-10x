const { logger } = require('../utils');
// const subscriptionMiddleware = require('../middleware/subscription.middleware'); // Unused - logic reimplemented in service

class SubscriptionService {
  /**
   * Increment usage counter for a specific resource type
   * @param {string} userId - User ID
   * @param {string} resource - Resource type ('videos', 'api_calls', 'storage', 'ai_summaries')
   * @param {number} increment - Amount to increment by (default: 1)
   */
  async incrementUsage(userId, resource = 'videos', increment = 1) {
    try {
      logger.info(`Incrementing ${resource} usage for user ${userId} by ${increment}`);

      // Use the existing incrementUserUsage function from subscription middleware
      // This function is not exported, so we need to access it through the middleware internals
      // For now, let's recreate the logic here or import it differently

      const database = require('./database.service');

      // Get user's active subscription
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        logger.debug(`No active subscription found for user ${userId}, skipping usage increment`);
        return;
      }

      const now = new Date();

      // Get user's integer ID for PostgreSQL
      let pgUserId;
      if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
        // This is already a PostgreSQL user ID
        pgUserId = parseInt(userId);
      } else if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          logger.debug(`No user found with airtable_id ${userId}, skipping usage increment`);
          return;
        }
        pgUserId = pgUsers[0].id;
      } else if (typeof userId === 'string' && userId.includes('@')) {
        // This is an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          logger.debug(`No user found with email ${userId}, skipping usage increment`);
          return;
        }
        pgUserId = pgUsers[0].id;
      } else {
        logger.warn(`Unrecognized userId format: ${userId} (type: ${typeof userId}), skipping usage increment`);
        return;
      }

      // Get usage records through proper relationship: user -> user_subscriptions -> subscription_usage
      const userSubscriptions = await database.findByField('user_subscriptions', 'users_id', pgUserId);
      if (userSubscriptions.length === 0) {
        return;
      }

      const subscriptionId = userSubscriptions[0].id;
      const usageRecords = await database.findByField('subscription_usage', 'user_subscriptions_id', subscriptionId);

      let currentUsage = usageRecords.find(usage => {
        const usageData = usage;
        const usagePeriodStart = new Date(usageData.period_start);
        const usagePeriodEnd = new Date(usageData.period_end);
        return usagePeriodStart <= now && usagePeriodEnd >= now;
      });

      const fieldName = this.getUsageFieldName(resource);

      if (currentUsage) {
        // Update existing usage record in PostgreSQL
        const usageData = currentUsage;
        const newValue = (usageData[fieldName] || 0) + increment;
        const usageId = currentUsage.id;
        await database.update('subscription_usage', usageId, {
          [fieldName]: newValue
        });
        logger.info(`Updated ${resource} usage for user ${userId} in PostgreSQL: ${usageData[fieldName] || 0} -> ${newValue}`);
      } else {
        // Create new usage record for current period
        const subscriptionRecords = await database.findByField('user_subscriptions', 'stripe_subscription_id', subscription.stripe_subscription_id);
        const subscriptionRecord = subscriptionRecords[0];

        if (subscriptionRecord) {
          const subscriptionData = subscriptionRecord;
          const usageData = {
            users_id: pgUserId,
            subscription_id: parseInt(subscriptionData.id),
            period_start: new Date(subscription.current_period_start).toISOString().split('T')[0],
            period_end: new Date(subscription.current_period_end).toISOString().split('T')[0],
            videos_processed: resource === 'videos' ? increment : 0,
            api_calls_made: resource === 'api_calls' ? increment : 0,
            storage_used_mb: resource === 'storage' ? increment : 0,
            ai_summaries_generated: resource === 'ai_summaries' ? increment : 0,
            analytics_views: resource === 'analytics' ? increment : 0
          };

          await database.create('subscription_usage', usageData);
          logger.info(`Created new ${resource} usage record for user ${userId} in PostgreSQL: ${increment}`);
        }
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
      const database = require('./database.service');
      const now = new Date();

      // Get user's integer ID for PostgreSQL
      let pgUserId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
        }
        pgUserId = pgUsers[0].id;
      } else if (typeof userId === 'string' && userId.includes('@')) {
        // This is likely an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
        }
        pgUserId = pgUsers[0].id;
      } else {
        // This is likely already a PostgreSQL user ID
        pgUserId = parseInt(userId);
      }

      logger.info(`Getting current usage for user ${userId} (pgUserId: ${pgUserId})`);

      // Get usage records through proper relationship: user -> user_subscriptions -> subscription_usage
      const userSubscriptions = await database.findByField('user_subscriptions', 'users_id', pgUserId);
      if (userSubscriptions.length === 0) {
        logger.info(`No subscriptions found for user ${pgUserId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      const subscriptionId = userSubscriptions[0].id;
      const usageRecords = await database.findByField('subscription_usage', 'user_subscriptions_id', subscriptionId);
      logger.info(`Found ${usageRecords.length} usage records for user ${pgUserId}`);

      // Find the current billing period usage record
      const currentUsage = usageRecords.find(usage => {
        const usageData = usage;
        const usagePeriodStart = new Date(usageData.period_start);
        const usagePeriodEnd = new Date(usageData.period_end);
        const isCurrentPeriod = usagePeriodStart <= now && usagePeriodEnd >= now;

        logger.info(`Checking usage record: start=${usagePeriodStart.toISOString()}, end=${usagePeriodEnd.toISOString()}, current=${isCurrentPeriod}`);
        return isCurrentPeriod;
      });

      if (!currentUsage) {
        logger.info(`No current billing period usage record found for user ${pgUserId}`);
        return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
      }

      const usageData = currentUsage;
      const result = {
        videos: usageData.videos_processed || 0,
        api_calls: usageData.api_calls_made || 0,
        storage: usageData.storage_used_mb || 0,
        ai_summaries: usageData.ai_summaries_generated || 0
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
      const database = require('./database.service');

      // Get user's integer ID for PostgreSQL
      let pgUserId;
      if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
        // This is already a PostgreSQL user ID
        pgUserId = parseInt(userId);
      } else if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          return null;
        }
        pgUserId = pgUsers[0].id;
      } else if (typeof userId === 'string' && userId.includes('@')) {
        // This is an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          return null;
        }
        pgUserId = pgUsers[0].id;
      } else {
        logger.warn(`Unrecognized userId format: ${userId} (type: ${typeof userId})`);
        return null;
      }

      const subscriptions = await database.findByField('user_subscriptions', 'users_id', pgUserId);
      const activeSubscription = subscriptions.find(sub => {
        const subData = sub;
        return ['active', 'trialing', 'paused'].includes(subData.status);
      });

      return activeSubscription || null;
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
      const database = require('./database.service');

      // Get user's active subscription
      const subscription = await this.getUserActiveSubscriptionByPgId(userId);
      if (!subscription) {
        return 0;
      }

      const now = new Date();

      // Query usage through proper relationship
      const query = `
        SELECT su.* FROM subscription_usage su
        JOIN user_subscriptions us ON su.user_subscriptions_id = us.id
        WHERE us.users_id = $1 
          AND su.period_start <= $2 
          AND su.period_end >= $2
        ORDER BY su.created_at DESC
        LIMIT 1
      `;
      const usageResult = await database.query(query, [userId, now]);
      const currentUsage = usageResult.rows[0];

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
      const database = require('./database.service');

      const now = new Date();

      // Query usage through proper relationship
      const query = `
        SELECT su.* FROM subscription_usage su
        JOIN user_subscriptions us ON su.user_subscriptions_id = us.id
        WHERE us.users_id = $1 
          AND su.period_start <= $2 
          AND su.period_end >= $2
        ORDER BY su.created_at DESC
        LIMIT 1
      `;
      const usageResult = await database.query(query, [userId, now]);
      const currentUsage = usageResult.rows[0];

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
      const database = require('./database.service');

      // Get user's active subscription
      const subscription = await this.getUserActiveSubscriptionByPgId(userId);
      if (!subscription) {
        logger.debug(`No active subscription found for user ${userId}, skipping usage tracking`);
        return;
      }

      const now = new Date();

      // Find current period usage record
      const usageQuery = `
        SELECT su.* FROM subscription_usage su
        JOIN user_subscriptions us ON su.user_subscriptions_id = us.id
        WHERE us.users_id = $1 
          AND su.period_start <= $2 
          AND su.period_end >= $2
        ORDER BY su.created_at DESC
        LIMIT 1
      `;
      const usageResult = await database.query(usageQuery, [userId, now]);
      let currentUsage = usageResult.rows[0];

      const fieldName = this.getUsageFieldName(resource);

      if (currentUsage) {
        // Update existing usage record
        const newValue = (currentUsage[fieldName] || 0) + increment;
        const updateQuery = `
          UPDATE subscription_usage 
          SET ${fieldName} = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `;
        await database.query(updateQuery, [newValue, currentUsage.id]);
      } else {
        // Create new usage record for current period
        const subscriptionQuery = `
          SELECT * FROM user_subscriptions 
          WHERE users_id = $1 
            AND status IN ('active', 'trialing', 'paused')
          ORDER BY created_at DESC
          LIMIT 1
        `;
        const subResult = await database.query(subscriptionQuery, [userId]);
        const userSubscription = subResult.rows[0];

        if (userSubscription) {
          const periodStart = new Date(userSubscription.current_period_start);
          const periodEnd = new Date(userSubscription.current_period_end);

          const insertQuery = `
            INSERT INTO subscription_usage (
              user_subscriptions_id, period_start, period_end, ${fieldName}, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `;
          await database.query(insertQuery, [userSubscription.id, periodStart, periodEnd, increment]);
        }
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
      const database = require('./database.service');

      const query = `
        SELECT * FROM user_subscriptions 
        WHERE users_id = $1 
          AND status IN ('active', 'trialing', 'paused')
        ORDER BY created_at DESC
        LIMIT 1
      `;
      const result = await database.query(query, [userId]);
      return result.rows[0] || null;
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
      const database = require('./database.service');
      logger.info(`Creating subscription for user ${subscriptionData.users_id}`);

      const fields = {
        users_id: subscriptionData.users_id,
        stripe_subscription_id: subscriptionData.stripe_subscription_id,
        plan_name: subscriptionData.plan_name || 'free',
        subscription_tier: subscriptionData.subscription_tier || 'free',
        status: subscriptionData.status || 'active',
        price_id: subscriptionData.price_id,
        current_period_start: subscriptionData.current_period_start,
        current_period_end: subscriptionData.current_period_end,
        trial_start: subscriptionData.trial_start,
        trial_end: subscriptionData.trial_end,
        metadata: subscriptionData.metadata || {}
      };

      const subscription = await database.create('user_subscriptions', fields);
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
      const database = require('./database.service');
      logger.info(`Creating usage record for subscription ${usageData.user_subscriptions_id}`);

      const fields = {
        user_subscriptions_id: usageData.user_subscriptions_id,
        usage_type: usageData.usage_type || 'monthly',
        usage_count: usageData.usage_count || 0,
        usage_limit: usageData.usage_limit,
        videos_processed: usageData.videos_processed || 0,
        ai_summaries_generated: usageData.ai_summaries_generated || 0,
        analytics_views: usageData.analytics_views || 0,
        api_calls_made: usageData.api_calls_made || 0,
        storage_used_mb: usageData.storage_used_mb || 0,
        period_start: usageData.period_start,
        period_end: usageData.period_end,
        feature_used: usageData.feature_used,
        ip_address: usageData.ip_address,
        user_agent: usageData.user_agent,
        metadata: usageData.metadata || {}
      };

      const usage = await database.create('subscription_usage', fields);
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
      const usage = await this.getCurrentUsage(userId);

      if (!usage) {
        logger.debug(`No usage data found for user ${userId}, assuming they can process`);
        return true;
      }

      // For free tier, limit might be 5 videos per month
      // For premium, might be 100 videos per month
      // These limits should be configurable based on subscription tier

      const currentCount = usage.videos_processed || 0;
      const limit = usage.usage_limit || 5; // Default free tier limit

      logger.debug(`User ${userId} usage: ${currentCount}/${limit} videos`);

      return currentCount < limit;
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

      // Get the raw usage record from database (not the transformed one)
      const database = require('./database.service');

      // Convert userId to PostgreSQL ID if needed
      let pgUserId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          logger.warn(`User not found for Airtable ID ${userId}`);
          return false;
        }
        pgUserId = pgUsers[0].id;
      } else {
        pgUserId = parseInt(userId);
      }

      // Get user subscription
      const userSubscriptions = await database.findByField('user_subscriptions', 'users_id', pgUserId);
      if (userSubscriptions.length === 0) {
        logger.warn(`No subscription found for user ${pgUserId} - cannot decrement`);
        return false;
      }

      // Get current usage record
      const usageRecords = await database.findByField('subscription_usage', 'user_subscriptions_id', userSubscriptions[0].id);
      if (usageRecords.length === 0) {
        logger.warn(`No usage record found for user ${pgUserId} - cannot decrement`);
        return false;
      }

      // Find current billing period usage record
      const now = new Date();
      const currentUsageRecord = usageRecords.find(usage => {
        const usagePeriodStart = new Date(usage.period_start);
        const usagePeriodEnd = new Date(usage.period_end);
        return usagePeriodStart <= now && usagePeriodEnd >= now;
      });

      if (!currentUsageRecord) {
        logger.warn(`No current billing period usage record found for user ${pgUserId} - cannot decrement`);
        return false;
      }

      const currentCount = currentUsageRecord.videos_processed || 0;

      // Don't decrement below 0
      if (currentCount <= 0) {
        logger.warn(`videos_processed count already at ${currentCount} for user ${userId} - not decrementing`);
        return false;
      }

      const newCount = currentCount - 1;

      // Update the usage record
      await database.update('subscription_usage', currentUsageRecord.id, {
        videos_processed: newCount,
        updated_at: new Date().toISOString()
      });

      logger.info(`Successfully decremented videos_processed from ${currentCount} to ${newCount} for user ${userId}`);
      return true;

    } catch (error) {
      logger.error('Error decrementing videos_processed count:', error);
      throw error;
    }
  }

}

module.exports = new SubscriptionService();
