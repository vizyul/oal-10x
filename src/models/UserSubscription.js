const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * UserSubscription Model - Handles user subscription management
 * Extends BaseModel to inherit standard CRUD operations
 */
class UserSubscription extends BaseModel {
  constructor() {
    super();
    this.tableName = 'user_subscriptions';
    this.primaryKey = 'id';

    // Define subscription-specific validation rules
    this.validationRules = {
      users_id: { required: true, type: 'integer' },
      stripe_subscription_id: { required: false, type: 'string' },
      plan_name: { required: false, type: 'string' },
      price_id: { required: false, type: 'string' },
      status: { required: false, type: 'string', default: 'active' },
      current_period_start: { required: false, type: 'date' },
      current_period_end: { required: false, type: 'date' },
      trial_start: { required: false, type: 'date' },
      trial_end: { required: false, type: 'date' },
      metadata: { required: false, type: 'object' }
    };

    // Define allowed values
    // Note: allowedTiers removed - subscription_tier is now on users table
    this.allowedStatuses = ['active', 'canceled', 'cancelled', 'past_due', 'unpaid', 'trialing', 'paused'];
  }

  /**
   * Get active subscription for a user by PostgreSQL user ID
   */
  async getActiveByUserId(userId) {
    try {
      if (!userId || (!Number.isInteger(userId) && isNaN(parseInt(userId)))) {
        throw new Error('Valid user ID is required');
      }

      const actualUserId = parseInt(userId);
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE users_id = $1 AND status = 'active'
        ORDER BY created_at DESC 
        LIMIT 1
      `;

      const result = await database.query(query, [actualUserId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error getting active subscription for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get subscription by Stripe subscription ID
   */
  async getByStripeId(stripeSubscriptionId) {
    try {
      if (!stripeSubscriptionId) {
        throw new Error('Stripe subscription ID is required');
      }

      const query = `SELECT * FROM ${this.tableName} WHERE stripe_subscription_id = $1`;
      const result = await database.query(query, [stripeSubscriptionId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding subscription by Stripe ID ${stripeSubscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getAllByUserId(userId) {
    try {
      if (!userId || (!Number.isInteger(userId) && isNaN(parseInt(userId)))) {
        throw new Error('Valid user ID is required');
      }

      const actualUserId = parseInt(userId);
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE users_id = $1 
        ORDER BY created_at DESC
      `;

      const result = await database.query(query, [actualUserId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting subscriptions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new subscription with validation
   */
  async createSubscription(subscriptionData) {
    try {
      // Validate required fields
      if (!subscriptionData.users_id) {
        throw new Error('users_id is required');
      }

      // Set defaults
      const processedData = {
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...subscriptionData
      };

      // Validate status
      if (processedData.status && !this.allowedStatuses.includes(processedData.status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      return await this.create(processedData);
    } catch (error) {
      logger.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription with validation
   */
  async updateSubscription(id, updateData) {
    try {
      if (!id) {
        throw new Error('Subscription ID is required');
      }

      // Filter out read-only fields
      const safeUpdateData = { ...updateData };
      delete safeUpdateData.id;
      delete safeUpdateData.created_at;
      delete safeUpdateData.users_id; // Don't allow changing user association

      // Set updated timestamp
      safeUpdateData.updated_at = new Date().toISOString();

      // Validate status if provided

      if (safeUpdateData.status && !this.allowedStatuses.includes(safeUpdateData.status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      return await this.update(id, safeUpdateData);
    } catch (error) {
      logger.error(`Error updating subscription ${id}:`, {
        message: error.message,
        updateData: updateData
      });
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(id, cancelReason = null) {
    try {
      if (!id) {
        throw new Error('Subscription ID is required');
      }

      const updateData = {
        status: 'cancelled',
        updated_at: new Date().toISOString()
      };

      if (cancelReason) {
        updateData.metadata = {
          ...updateData.metadata,
          cancel_reason: cancelReason,
          cancelled_at: new Date().toISOString()
        };
      }

      return await this.update(id, updateData);
    } catch (error) {
      logger.error(`Error cancelling subscription ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has an active subscription
   */
  async hasActiveSubscription(userId) {
    try {
      const subscription = await this.getActiveByUserId(userId);
      return subscription !== null && subscription.status === 'active';
    } catch (error) {
      logger.error(`Error checking active subscription for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get subscription tier for user
   */
  async getUserTier(userId) {
    try {
      // Note: subscription_tier is now stored on the users table, not user_subscriptions
      // This method should probably be moved to the User model
      logger.warn('getUserTier called on UserSubscription model - subscription_tier is now on users table');
      return 'free'; // Default fallback
    } catch (error) {
      logger.error(`Error getting user tier for user ${userId}:`, error);
      return 'free'; // Default to free on error
    }
  }

  /**
   * Validate subscription data before save
   */
  validateSubscriptionData(data) {
    const errors = [];

    // Required field validation
    if (!data.users_id) errors.push('users_id is required');

    // Format validation
    if (data.users_id && (!Number.isInteger(data.users_id) && isNaN(parseInt(data.users_id)))) {
      errors.push('users_id must be a valid integer');
    }

    // Note: subscription_tier validation removed - field is now on users table

    if (data.status && !this.allowedStatuses.includes(data.status)) {
      errors.push(`status must be one of: ${this.allowedStatuses.join(', ')}`);
    }

    // Date validation
    if (data.current_period_start && data.current_period_end) {
      const start = new Date(data.current_period_start);
      const end = new Date(data.current_period_end);
      if (end <= start) {
        errors.push('current_period_end must be after current_period_start');
      }
    }

    if (data.trial_start && data.trial_end) {
      const start = new Date(data.trial_start);
      const end = new Date(data.trial_end);
      if (end <= start) {
        errors.push('trial_end must be after trial_start');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return true;
  }
}

module.exports = UserSubscription;
