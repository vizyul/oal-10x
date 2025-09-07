const { logger } = require('../utils');
const subscriptionMiddleware = require('../middleware/subscription.middleware');

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
      
      const airtable = require('./airtable.service');
      
      // Get user's active subscription
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        logger.debug(`No active subscription found for user ${userId}, skipping usage increment`);
        return;
      }

      const now = new Date();
      const usageRecords = await airtable.findByField('Subscription_Usage', 'user_id', userId);
      let currentUsage = usageRecords.find(usage => {
        const usagePeriodStart = new Date(usage.period_start);
        const usagePeriodEnd = new Date(usage.period_end);
        return usagePeriodStart <= now && usagePeriodEnd >= now;
      });

      const fieldName = this.getUsageFieldName(resource);
      
      if (currentUsage) {
        // Update existing usage record in Airtable
        const newValue = (currentUsage[fieldName] || 0) + increment;
        await airtable.update('Subscription_Usage', currentUsage.id, {
          [fieldName]: newValue
        });
        logger.info(`Updated ${resource} usage for user ${userId} in Airtable: ${currentUsage[fieldName] || 0} -> ${newValue}`);

        // Also update PostgreSQL subscription_usage table (dual database system)
        await this.updatePostgreSQLUsage(userId, resource, increment);
        logger.info(`Updated ${resource} usage for user ${userId} in PostgreSQL`);
      } else {
        // Create new usage record for current period
        const subscriptionRecords = await airtable.findByField('User_Subscriptions', 'stripe_subscription_id', subscription.stripe_subscription_id);
        const subscriptionRecord = subscriptionRecords[0];
        
        if (subscriptionRecord) {
          const usageData = {
            user_id: [userId],
            subscription_id: [subscriptionRecord.id],
            period_start: new Date(subscription.current_period_start).toISOString().split('T')[0],
            period_end: new Date(subscription.current_period_end).toISOString().split('T')[0],
            videos_processed: resource === 'videos' ? increment : 0,
            api_calls_made: resource === 'api_calls' ? increment : 0,
            storage_used_mb: resource === 'storage' ? increment : 0,
            ai_summaries_generated: resource === 'ai_summaries' ? increment : 0,
            analytics_views: resource === 'analytics' ? increment : 0
          };
          
          await airtable.create('Subscription_Usage', usageData);
          logger.info(`Created new ${resource} usage record for user ${userId} in Airtable: ${increment}`);

          // Also create PostgreSQL subscription_usage record (dual database system)
          await this.createPostgreSQLUsage(userId, subscription, resource, increment);
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
      const airtable = require('./airtable.service');
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
      const airtable = require('./airtable.service');
      const subscriptions = await airtable.findByField('User_Subscriptions', 'user_id', userId);
      return subscriptions.find(sub => 
        ['active', 'trialing', 'paused'].includes(sub.status)
      ) || null;
    } catch (error) {
      logger.error('Error getting user subscription:', error);
      return null;
    }
  }

  /**
   * Map resource name to Airtable field name
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
   * Update PostgreSQL subscription_usage record
   * @param {string} userId - User ID
   * @param {string} resource - Resource type  
   * @param {number} increment - Amount to increment by
   */
  async updatePostgreSQLUsage(userId, resource, increment) {
    try {
      const database = require('./database.service');
      const now = new Date();
      
      // Get user's integer ID for PostgreSQL (not email)
      const pgUsers = await database.findByField('users', 'email', userId);
      if (pgUsers.length === 0) return;
      const pgUserId = pgUsers[0].id;

      // Find current period usage record in PostgreSQL
      const pgUsageQuery = await database.query(
        'SELECT * FROM subscription_usage WHERE users_id = $1 AND period_start <= $2 AND period_end >= $2',
        [pgUserId, now.toISOString()]
      );

      if (pgUsageQuery.rows.length > 0) {
        const pgUsage = pgUsageQuery.rows[0];
        const fieldName = this.getUsageFieldName(resource);
        const newValue = (pgUsage[fieldName] || 0) + increment;
        
        await database.update('subscription_usage', pgUsage.id, {
          [fieldName]: newValue
        });
      }
    } catch (error) {
      logger.error(`Error updating PostgreSQL usage: ${error.message}`);
    }
  }

  /**
   * Create PostgreSQL subscription_usage record
   * @param {string} userId - User ID
   * @param {Object} subscription - Subscription object
   * @param {string} resource - Resource type
   * @param {number} increment - Initial value
   */
  async createPostgreSQLUsage(userId, subscription, resource, increment) {
    try {
      const database = require('./database.service');
      
      // Get user's integer ID for PostgreSQL (not email)
      const pgUsers = await database.findByField('users', 'email', userId);
      if (pgUsers.length === 0) return;
      const pgUserId = pgUsers[0].id;

      const pgUsageData = {
        users_id: pgUserId,
        period_start: new Date(subscription.current_period_start).toISOString(),
        period_end: new Date(subscription.current_period_end).toISOString(),
        videos_processed: resource === 'videos' ? increment : 0,
        api_calls_made: resource === 'api_calls' ? increment : 0,
        storage_used_mb: resource === 'storage' ? increment : 0,
        ai_summaries_generated: resource === 'ai_summaries' ? increment : 0
      };

      await database.create('subscription_usage', pgUsageData);
    } catch (error) {
      logger.error(`Error creating PostgreSQL usage: ${error.message}`);
    }
  }
}

module.exports = new SubscriptionService();