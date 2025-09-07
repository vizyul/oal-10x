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
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          logger.debug(`No user found with airtable_id ${userId}, skipping usage increment`);
          return;
        }
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      } else {
        // This is likely an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          logger.debug(`No user found with email ${userId}, skipping usage increment`);
          return;
        }
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      }

      const usageRecords = await database.findByField('subscription_usage', 'users_id', pgUserId);
      let currentUsage = usageRecords.find(usage => {
        const usageData = usage.fields || usage;
        const usagePeriodStart = new Date(usageData.period_start);
        const usagePeriodEnd = new Date(usageData.period_end);
        return usagePeriodStart <= now && usagePeriodEnd >= now;
      });

      const fieldName = this.getUsageFieldName(resource);
      
      if (currentUsage) {
        // Update existing usage record in PostgreSQL
        const usageData = currentUsage.fields || currentUsage;
        const newValue = (usageData[fieldName] || 0) + increment;
        const usageId = currentUsage.id || currentUsage.fields.id;
        await database.update('subscription_usage', usageId, {
          [fieldName]: newValue
        });
        logger.info(`Updated ${resource} usage for user ${userId} in PostgreSQL: ${usageData[fieldName] || 0} -> ${newValue}`);
      } else {
        // Create new usage record for current period
        const subscriptionRecords = await database.findByField('user_subscriptions', 'stripe_subscription_id', subscription.stripe_subscription_id);
        const subscriptionRecord = subscriptionRecords[0];
        
        if (subscriptionRecord) {
          const subscriptionData = subscriptionRecord.fields || subscriptionRecord;
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
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      } else if (typeof userId === 'string' && userId.includes('@')) {
        // This is likely an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
        }
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      } else {
        // This is likely already a PostgreSQL user ID
        pgUserId = parseInt(userId);
      }
      
      logger.info(`Getting current usage for user ${userId} (pgUserId: ${pgUserId})`);
      
      // Get usage records for this user
      const usageRecords = await database.findByField('subscription_usage', 'users_id', pgUserId);
      logger.info(`Found ${usageRecords.length} usage records for user ${pgUserId}`);
      
      // Find the current billing period usage record
      const currentUsage = usageRecords.find(usage => {
        const usageData = usage.fields || usage;
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

      const usageData = currentUsage.fields || currentUsage;
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
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID
        const pgUsers = await database.findByField('users', 'airtable_id', userId);
        if (pgUsers.length === 0) {
          return null;
        }
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      } else {
        // This is likely an email address
        const pgUsers = await database.findByField('users', 'email', userId);
        if (pgUsers.length === 0) {
          return null;
        }
        pgUserId = pgUsers[0].fields ? pgUsers[0].fields.id : pgUsers[0].id;
      }
      
      const subscriptions = await database.findByField('user_subscriptions', 'users_id', pgUserId);
      const activeSubscription = subscriptions.find(sub => {
        const subData = sub.fields || sub;
        return ['active', 'trialing', 'paused'].includes(subData.status);
      });
      
      return activeSubscription ? (activeSubscription.fields || activeSubscription) : null;
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

}

module.exports = new SubscriptionService();