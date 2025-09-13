const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * SubscriptionUsage Model - Handles subscription usage tracking
 * Extends BaseModel to inherit standard CRUD operations
 */
class SubscriptionUsage extends BaseModel {
  constructor() {
    super();
    this.tableName = 'subscription_usage';
    this.primaryKey = 'id';
    
    // Define usage-specific validation rules
    this.validationRules = {
      user_subscriptions_id: { required: true, type: 'integer' },
      user_id: { required: false, type: 'integer' },
      usage_type: { required: false, type: 'string', default: 'monthly' },
      period_start: { required: false, type: 'date' },
      period_end: { required: false, type: 'date' },
      reset_date: { required: false, type: 'date' },
      usage_count: { required: false, type: 'integer', default: 0 },
      usage_limit: { required: false, type: 'integer', default: 10 },
      videos_processed: { required: false, type: 'integer', default: 0 },
      ai_summaries_generated: { required: false, type: 'integer', default: 0 },
      analytics_views: { required: false, type: 'integer', default: 0 },
      api_calls_made: { required: false, type: 'integer', default: 0 },
      storage_used_mb: { required: false, type: 'number', default: 0 },
      feature_used: { required: false, type: 'string' },
      subscription_id: { required: false, type: 'string' },
      ip_address: { required: false, type: 'string' },
      user_agent: { required: false, type: 'string' },
      metadata: { required: false, type: 'object' }
    };

    // Define allowed usage types
    this.allowedUsageTypes = ['monthly', 'yearly', 'lifetime', 'trial'];
    this.resourceFields = ['videos_processed', 'ai_summaries_generated', 'analytics_views', 'api_calls_made', 'storage_used_mb'];
  }

  /**
   * Get current usage for a subscription
   */
  async getCurrentBySubscriptionId(subscriptionId) {
    try {
      if (!subscriptionId) {
        throw new Error('Subscription ID is required');
      }

      const now = new Date();
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE user_subscriptions_id = $1 
        AND (period_end IS NULL OR period_end > $2)
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      const result = await database.query(query, [subscriptionId, now]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error getting current usage for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Get usage by user ID (PostgreSQL)
   */
  async getCurrentByUserId(userId) {
    try {
      if (!userId || (!Number.isInteger(userId) && isNaN(parseInt(userId)))) {
        throw new Error('Valid user ID is required');
      }

      const actualUserId = parseInt(userId);
      const now = new Date();
      
      const query = `
        SELECT su.* FROM ${this.tableName} su
        JOIN user_subscriptions us ON su.user_subscriptions_id = us.id
        WHERE us.users_id = $1 
        AND us.status = 'active'
        AND (su.period_end IS NULL OR su.period_end > $2)
        ORDER BY su.created_at DESC 
        LIMIT 1
      `;
      
      const result = await database.query(query, [actualUserId, now]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error getting current usage for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create usage record with validation
   */
  async createUsage(usageData) {
    try {
      // Validate required fields
      if (!usageData.user_subscriptions_id) {
        throw new Error('user_subscriptions_id is required');
      }

      // Set defaults
      const now = new Date();
      const processedData = {
        usage_type: 'monthly',
        usage_count: 0,
        usage_limit: 10,
        videos_processed: 0,
        ai_summaries_generated: 0,
        analytics_views: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        ...usageData
      };

      // Set period defaults if not provided
      if (!processedData.period_start) {
        processedData.period_start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }
      
      if (!processedData.period_end) {
        processedData.period_end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
      }

      if (!processedData.reset_date) {
        processedData.reset_date = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
      }

      // Validate usage type
      if (processedData.usage_type && !this.allowedUsageTypes.includes(processedData.usage_type)) {
        throw new Error(`Invalid usage type. Allowed values: ${this.allowedUsageTypes.join(', ')}`);
      }

      return await this.create(processedData);
    } catch (error) {
      logger.error('Error creating usage record:', error);
      throw error;
    }
  }

  /**
   * Increment usage for a specific resource
   */
  async incrementUsage(subscriptionId, resource = 'videos_processed', increment = 1) {
    try {
      if (!subscriptionId) {
        throw new Error('Subscription ID is required');
      }

      if (!this.resourceFields.includes(resource) && resource !== 'usage_count') {
        throw new Error(`Invalid resource. Allowed values: ${this.resourceFields.join(', ')}, usage_count`);
      }

      // Get current usage record
      let usage = await this.getCurrentBySubscriptionId(subscriptionId);
      
      if (!usage) {
        // Create new usage record if none exists
        usage = await this.createUsage({
          user_subscriptions_id: subscriptionId
        });
      }

      // Increment the specified resource
      const updateData = {
        [resource]: (usage[resource] || 0) + increment,
        updated_at: new Date().toISOString()
      };

      // Also increment general usage_count if it's a countable resource
      if (resource !== 'usage_count') {
        updateData.usage_count = (usage.usage_count || 0) + increment;
      }

      const updatedUsage = await this.update(usage.id, updateData);
      
      logger.info(`Incremented ${resource} for subscription ${subscriptionId} by ${increment}`, {
        subscriptionId,
        resource,
        increment,
        newValue: updatedUsage[resource]
      });

      return updatedUsage;
    } catch (error) {
      logger.error(`Error incrementing ${resource} usage for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Decrement usage for a specific resource
   */
  async decrementUsage(subscriptionId, resource = 'videos_processed', decrement = 1) {
    try {
      if (!subscriptionId) {
        throw new Error('Subscription ID is required');
      }

      if (!this.resourceFields.includes(resource) && resource !== 'usage_count') {
        throw new Error(`Invalid resource. Allowed values: ${this.resourceFields.join(', ')}, usage_count`);
      }

      // Get current usage record
      const usage = await this.getCurrentBySubscriptionId(subscriptionId);
      
      if (!usage) {
        logger.warn(`No usage record found for subscription ${subscriptionId}, cannot decrement`);
        return null;
      }

      // Decrement the specified resource (don't go below 0)
      const currentValue = usage[resource] || 0;
      const newValue = Math.max(0, currentValue - decrement);
      
      const updateData = {
        [resource]: newValue,
        updated_at: new Date().toISOString()
      };

      // Also decrement general usage_count if it's a countable resource
      if (resource !== 'usage_count') {
        const currentUsageCount = usage.usage_count || 0;
        updateData.usage_count = Math.max(0, currentUsageCount - decrement);
      }

      const updatedUsage = await this.update(usage.id, updateData);
      
      logger.info(`Decremented ${resource} for subscription ${subscriptionId} by ${decrement}`, {
        subscriptionId,
        resource,
        decrement,
        oldValue: currentValue,
        newValue: newValue
      });

      return updatedUsage;
    } catch (error) {
      logger.error(`Error decrementing ${resource} usage for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has exceeded usage limit
   */
  async hasExceededLimit(subscriptionId, resource = 'videos_processed') {
    try {
      const usage = await this.getCurrentBySubscriptionId(subscriptionId);
      
      if (!usage) {
        return false; // No usage record means not exceeded
      }

      const currentUsage = usage[resource] || 0;
      const limit = usage.usage_limit || 10;
      
      return currentUsage >= limit;
    } catch (error) {
      logger.error(`Error checking usage limit for subscription ${subscriptionId}:`, error);
      return false; // Default to false on error
    }
  }

  /**
   * Get usage breakdown for a subscription
   */
  async getUsageBreakdown(subscriptionId) {
    try {
      const usage = await this.getCurrentBySubscriptionId(subscriptionId);
      
      if (!usage) {
        return {
          subscription_id: subscriptionId,
          usage_count: 0,
          usage_limit: 10,
          videos_processed: 0,
          ai_summaries_generated: 0,
          analytics_views: 0,
          api_calls_made: 0,
          storage_used_mb: 0,
          period_start: null,
          period_end: null
        };
      }

      return {
        subscription_id: subscriptionId,
        usage_count: usage.usage_count || 0,
        usage_limit: usage.usage_limit || 10,
        videos_processed: usage.videos_processed || 0,
        ai_summaries_generated: usage.ai_summaries_generated || 0,
        analytics_views: usage.analytics_views || 0,
        api_calls_made: usage.api_calls_made || 0,
        storage_used_mb: usage.storage_used_mb || 0,
        period_start: usage.period_start,
        period_end: usage.period_end,
        reset_date: usage.reset_date
      };
    } catch (error) {
      logger.error(`Error getting usage breakdown for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Reset usage for new period
   */
  async resetUsageForNewPeriod(subscriptionId, newPeriodStart, newPeriodEnd) {
    try {
      if (!subscriptionId || !newPeriodStart || !newPeriodEnd) {
        throw new Error('Subscription ID, period start, and period end are required');
      }

      // Create new usage record for the new period
      const newUsage = await this.createUsage({
        user_subscriptions_id: subscriptionId,
        period_start: newPeriodStart,
        period_end: newPeriodEnd,
        reset_date: newPeriodEnd
      });

      logger.info(`Reset usage for subscription ${subscriptionId} for new period`, {
        subscriptionId,
        newPeriodStart,
        newPeriodEnd
      });

      return newUsage;
    } catch (error) {
      logger.error(`Error resetting usage for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Validate usage data before save
   */
  validateUsageData(data) {
    const errors = [];

    // Required field validation
    if (!data.user_subscriptions_id) errors.push('user_subscriptions_id is required');

    // Format validation
    if (data.user_subscriptions_id && (!Number.isInteger(data.user_subscriptions_id) && isNaN(parseInt(data.user_subscriptions_id)))) {
      errors.push('user_subscriptions_id must be a valid integer');
    }

    // Numeric validation
    this.resourceFields.forEach(field => {
      if (data[field] && isNaN(parseFloat(data[field]))) {
        errors.push(`${field} must be a valid number`);
      }
    });

    // Enum validation
    if (data.usage_type && !this.allowedUsageTypes.includes(data.usage_type)) {
      errors.push(`usage_type must be one of: ${this.allowedUsageTypes.join(', ')}`);
    }

    // Date validation
    if (data.period_start && data.period_end) {
      const start = new Date(data.period_start);
      const end = new Date(data.period_end);
      if (end <= start) {
        errors.push('period_end must be after period_start');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return true;
  }
}

module.exports = SubscriptionUsage;