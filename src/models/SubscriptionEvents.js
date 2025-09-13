const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * SubscriptionEvents Model - Handles subscription event logging
 * Extends BaseModel to inherit standard CRUD operations
 */
class SubscriptionEvents extends BaseModel {
  constructor() {
    super();
    this.tableName = 'subscription_events';
    this.primaryKey = 'id';
    
    // Define event-specific validation rules
    this.validationRules = {
      user_subscriptions_id: { required: false, type: 'integer' },
      stripe_event_id: { required: true, type: 'string' },
      stripe_subscription_id: { required: false, type: 'string' },
      user_id: { required: false, type: 'integer' },
      event_type: { required: true, type: 'string' },
      event_data: { required: false, type: 'object' },
      processed: { required: false, type: 'boolean', default: false },
      processed_successfully: { required: false, type: 'boolean', default: false },
      status: { required: false, type: 'string', default: 'pending' },
      processed_at: { required: false, type: 'date' },
      webhook_received_at: { required: false, type: 'date' },
      error_message: { required: false, type: 'string' },
      retry_count: { required: false, type: 'integer', default: 0 }
    };

    // Define allowed status values and event types
    this.allowedStatuses = ['pending', 'processing', 'processed', 'failed'];
    this.allowedEventTypes = [
      'customer.subscription.created',
      'customer.subscription.updated', 
      'customer.subscription.deleted',
      'customer.subscription.paused',
      'customer.subscription.resumed',
      'invoice.payment_succeeded',
      'invoice.payment_failed',
      'customer.subscription.trial_will_end',
      'customer.created',
      'customer.updated',
      'setup_intent.succeeded',
      'checkout.session.completed'
    ];
  }

  /**
   * Create event log with validation
   */
  async createEvent(eventData) {
    try {
      // Validate required fields
      if (!eventData.stripe_event_id || !eventData.event_type) {
        throw new Error('stripe_event_id and event_type are required');
      }

      // Set defaults
      const processedData = {
        processed: false,
        processed_successfully: false,
        status: 'pending',
        retry_count: 0,
        webhook_received_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...eventData
      };

      // Validate event type
      if (!this.allowedEventTypes.includes(processedData.event_type)) {
        logger.warn(`Unknown event type: ${processedData.event_type}. Adding to allowed types.`);
        // Don't throw error for unknown event types - log and continue
      }

      // Validate status
      if (processedData.status && !this.allowedStatuses.includes(processedData.status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      return await this.create(processedData);
    } catch (error) {
      logger.error('Error creating subscription event:', error);
      throw error;
    }
  }

  /**
   * Find event by Stripe event ID
   */
  async findByStripeEventId(stripeEventId) {
    try {
      if (!stripeEventId) {
        throw new Error('Stripe event ID is required');
      }

      const query = `SELECT * FROM ${this.tableName} WHERE stripe_event_id = $1`;
      const result = await database.query(query, [stripeEventId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding event by Stripe event ID ${stripeEventId}:`, error);
      throw error;
    }
  }

  /**
   * Check if event has already been processed
   */
  async isEventProcessed(stripeEventId) {
    try {
      const event = await this.findByStripeEventId(stripeEventId);
      return event && event.processed === true;
    } catch (error) {
      logger.error(`Error checking if event ${stripeEventId} is processed:`, error);
      return false; // Default to false on error
    }
  }

  /**
   * Mark event as processed
   */
  async markAsProcessed(eventId, success = true, errorMessage = null) {
    try {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      const updateData = {
        processed: true,
        processed_successfully: success,
        status: success ? 'processed' : 'failed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (errorMessage) {
        updateData.error_message = errorMessage;
      }

      const updatedEvent = await this.update(eventId, updateData);
      
      logger.info(`Marked event ${eventId} as processed`, {
        eventId,
        success,
        errorMessage
      });

      return updatedEvent;
    } catch (error) {
      logger.error(`Error marking event ${eventId} as processed:`, error);
      throw error;
    }
  }

  /**
   * Mark event as failed and increment retry count
   */
  async markAsFailed(eventId, errorMessage, incrementRetry = true) {
    try {
      if (!eventId) {
        throw new Error('Event ID is required');
      }

      // Get current event to check retry count
      const currentEvent = await this.findById(eventId);
      if (!currentEvent) {
        throw new Error(`Event ${eventId} not found`);
      }

      const updateData = {
        processed: false,
        processed_successfully: false,
        status: 'failed',
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      };

      if (incrementRetry) {
        updateData.retry_count = (currentEvent.retry_count || 0) + 1;
      }

      const updatedEvent = await this.update(eventId, updateData);
      
      logger.info(`Marked event ${eventId} as failed`, {
        eventId,
        errorMessage,
        retryCount: updatedEvent.retry_count
      });

      return updatedEvent;
    } catch (error) {
      logger.error(`Error marking event ${eventId} as failed:`, error);
      throw error;
    }
  }

  /**
   * Get events by subscription ID
   */
  async getBySubscriptionId(subscriptionId) {
    try {
      if (!subscriptionId) {
        throw new Error('Subscription ID is required');
      }

      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE user_subscriptions_id = $1 
        ORDER BY created_at DESC
      `;
      
      const result = await database.query(query, [subscriptionId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting events for subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Get events by Stripe subscription ID
   */
  async getByStripeSubscriptionId(stripeSubscriptionId) {
    try {
      if (!stripeSubscriptionId) {
        throw new Error('Stripe subscription ID is required');
      }

      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE stripe_subscription_id = $1 
        ORDER BY created_at DESC
      `;
      
      const result = await database.query(query, [stripeSubscriptionId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting events for Stripe subscription ${stripeSubscriptionId}:`, error);
      throw error;
    }
  }

  /**
   * Get failed events that can be retried
   */
  async getFailedEventsForRetry(maxRetries = 3, limit = 50) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE status = 'failed' 
        AND retry_count < $1 
        ORDER BY created_at ASC 
        LIMIT $2
      `;
      
      const result = await database.query(query, [maxRetries, limit]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error('Error getting failed events for retry:', error);
      throw error;
    }
  }

  /**
   * Get events by status
   */
  async getByStatus(status, limit = 100) {
    try {
      if (!status || !this.allowedStatuses.includes(status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE status = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      const result = await database.query(query, [status, limit]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting events with status ${status}:`, error);
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getEventStatistics(days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          event_type,
          status,
          COUNT(*) as count
        FROM ${this.tableName} 
        WHERE created_at >= $1 
        GROUP BY event_type, status
        ORDER BY event_type, status
      `;
      
      const result = await database.query(query, [startDate.toISOString()]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting event statistics for ${days} days:`, error);
      throw error;
    }
  }

  /**
   * Clean up old processed events
   */
  async cleanupOldEvents(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const query = `
        DELETE FROM ${this.tableName} 
        WHERE processed = true 
        AND status = 'processed' 
        AND created_at < $1
      `;
      
      const result = await database.query(query, [cutoffDate.toISOString()]);
      const deletedCount = result.rowCount || 0;
      
      logger.info(`Cleaned up ${deletedCount} old processed events older than ${daysToKeep} days`);
      return deletedCount;
    } catch (error) {
      logger.error(`Error cleaning up old events:`, error);
      throw error;
    }
  }

  /**
   * Validate event data before save
   */
  validateEventData(data) {
    const errors = [];

    // Required field validation
    if (!data.stripe_event_id) errors.push('stripe_event_id is required');
    if (!data.event_type) errors.push('event_type is required');

    // Format validation
    if (data.processed !== undefined && typeof data.processed !== 'boolean') {
      errors.push('processed must be a boolean');
    }

    if (data.processed_successfully !== undefined && typeof data.processed_successfully !== 'boolean') {
      errors.push('processed_successfully must be a boolean');
    }

    if (data.retry_count !== undefined && (!Number.isInteger(data.retry_count) || data.retry_count < 0)) {
      errors.push('retry_count must be a non-negative integer');
    }

    // Enum validation
    if (data.status && !this.allowedStatuses.includes(data.status)) {
      errors.push(`status must be one of: ${this.allowedStatuses.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return true;
  }
}

module.exports = SubscriptionEvents;