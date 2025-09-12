const stripe = require('stripe')(require('../config/stripe.config').getSecretKey());
const stripeConfig = require('../config/stripe.config');
const database = require('./database.service');
const { logger } = require('../utils');
const { clearCachedUser, forceTokenRefresh } = require('../middleware');

class StripeService {
  constructor() {
    // Validate configuration on initialization
    try {
      stripeConfig.validate();
    } catch (error) {
      logger.error('Stripe configuration error:', error.message);
      throw error;
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(userId, priceId, customerEmail) {
    try {
      // Get or create Stripe customer
      const customer = await this.getOrCreateCustomer(userId, customerEmail);

      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: customer.id,
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        success_url: `${stripeConfig.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: stripeConfig.cancelUrl,
        metadata: {
          user_id: userId
        },
        subscription_data: {
          metadata: {
            user_id: userId
          }
        }
      });

      logger.info('Checkout session created:', {
        sessionId: session.id,
        userId,
        customerId: customer.id
      });

      return session;
    } catch (error) {
      logger.error('Error creating checkout session:', {
        error: error.message,
        stack: error.stack,
        userId,
        customerEmail,
        priceId
      });
      throw error;
    }
  }

  /**
   * Get or create Stripe customer
   */
  async getOrCreateCustomer(userId, email) {
    try {
      // Check if user already has a Stripe customer ID
      let user;
      try {
        user = await database.findById('users', userId);
      // eslint-disable-next-line no-unused-vars
      } catch (_recordIdError) {
        logger.info('User ID not found by ID, searching by email:', { userId, email });
        const users = await database.findByField('users', 'email', email);
        user = users && users.length > 0 ? users[0] : null;
      }

      if (!user) {
        logger.error('User not found for checkout session:', { userId, email });
        throw new Error('User not found');
      }

      // Handle both formatted and direct database records
      const userFields = user.fields || user;
      const userStripeCustomerId = userFields.stripe_customer_id;
      const actualUserId = user.id || userFields.id;

      if (userStripeCustomerId) {
        // Retrieve existing customer
        const customer = await stripe.customers.retrieve(userStripeCustomerId);
        return customer;
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          user_id: actualUserId
        }
      });

      // Update user record with customer ID
      await database.update('users', actualUserId, {
        stripe_customer_id: customer.id
      });

      logger.info('New Stripe customer created:', {
        customerId: customer.id,
        userId: actualUserId
      });

      return customer;
    } catch (error) {
      logger.error('Error getting/creating customer:', {
        error: error.message,
        stack: error.stack,
        userId,
        email
      });
      throw error;
    }
  }

  /**
   * Create customer portal session
   */
  async createPortalSession(customerId, returnUrl) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || stripeConfig.customerPortalUrl
      });

      return session;
    } catch (error) {
      logger.error('Error creating portal session:', error);
      throw error;
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(event) {
    try {
      logger.info('Processing webhook event:', {
        type: event.type,
        id: event.id
      });

      // Log event for debugging
      await this.logWebhookEvent(event);

      switch (event.type) {
      case 'customer.subscription.created':
        return await this.handleSubscriptionCreated(event.data.object);

      case 'customer.subscription.updated':
        return await this.handleSubscriptionUpdated(event.data.object);

      case 'customer.subscription.deleted':
        return await this.handleSubscriptionDeleted(event.data.object);

      case 'customer.subscription.paused':
        return await this.handleSubscriptionPaused(event.data.object);

      case 'customer.subscription.resumed':
        return await this.handleSubscriptionResumed(event.data.object);

      case 'invoice.payment_succeeded':
        return await this.handlePaymentSucceeded(event.data.object);

      case 'invoice.payment_failed':
        return await this.handlePaymentFailed(event.data.object);

      case 'customer.subscription.trial_will_end':
        return await this.handleTrialWillEnd(event.data.object);

      default:
        logger.info('Unhandled webhook event type:', event.type);
        return { processed: false, reason: 'Event type not handled' };
      }
    } catch (error) {
      logger.error('Error processing webhook event:', error);

      // Update event log with error
      await this.updateEventLog(event.id, false, error.message);
      throw error;
    }
  }

  /**
   * Resolve user ID to PostgreSQL format
   */
  async resolveUserId(userId) {
    if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
      return parseInt(userId);
    } else if (typeof userId === 'string' && userId.startsWith('rec')) {
      const pgUsers = await database.findByField('users', 'airtable_id', userId);
      if (pgUsers.length === 0) {
        throw new Error(`No user found with airtable_id ${userId}`);
      }
      return pgUsers[0].id;
    } else if (typeof userId === 'string' && userId.includes('@')) {
      const pgUsers = await database.findByField('users', 'email', userId);
      if (pgUsers.length === 0) {
        throw new Error(`No user found with email ${userId}`);
      }
      return pgUsers[0].id;
    } else {
      throw new Error(`Unrecognized userId format: ${userId} (type: ${typeof userId})`);
    }
  }

  /**
   * Handle subscription created
   */
  async handleSubscriptionCreated(subscription) {
    const userId = subscription.metadata.user_id;
    const tier = this.getTierFromPrice(subscription.items.data[0].price.id);

    logger.info('Processing subscription created webhook:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      userId: userId,
      userIdType: typeof userId,
      tier: tier,
      metadata: subscription.metadata
    });

    // Check if user exists before processing
    if (!userId) {
      logger.error('No user_id found in subscription metadata:', {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        metadata: subscription.metadata
      });
      throw new Error('No user_id in subscription metadata');
    }

    // Try to resolve user ID and check if user exists
    let pgUserId;
    try {
      pgUserId = await this.resolveUserId(userId);
      logger.info('Successfully resolved user ID:', {
        originalUserId: userId,
        resolvedUserId: pgUserId
      });
    } catch (userError) {
      logger.error('Failed to resolve user ID:', {
        originalUserId: userId,
        error: userError.message,
        subscriptionId: subscription.id,
        customerId: subscription.customer
      });
      
      // Try to get customer information from Stripe to help debug
      try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        logger.error('Customer information from Stripe:', {
          customerId: customer.id,
          customerEmail: customer.email,
          customerMetadata: customer.metadata
        });
        
        // If we can find user by email, log that information
        if (customer.email) {
          try {
            const usersByEmail = await database.findByField('users', 'email', customer.email);
            logger.info('Users found by customer email:', {
              email: customer.email,
              foundUsers: usersByEmail.length,
              users: usersByEmail.map(u => ({ id: u.id, email: u.email, airtable_id: u.airtable_id }))
            });
          } catch (emailSearchError) {
            logger.error('Error searching users by email:', emailSearchError.message);
          }
        }
      } catch (customerError) {
        logger.error('Error retrieving customer from Stripe:', customerError.message);
      }
      
      throw userError; // Re-throw the original error
    }

    // Debug: Log date formatting
    const startDate = new Date(subscription.current_period_start * 1000).toISOString().split('T')[0];
    const endDate = new Date(subscription.current_period_end * 1000).toISOString().split('T')[0];
    logger.info('Subscription dates:', {
      rawStart: subscription.current_period_start,
      rawEnd: subscription.current_period_end,
      formattedStart: startDate,
      formattedEnd: endDate
    });

    // Check for existing subscription record using the unique constraint: stripe_subscription_id, users_id, and stripe_customer_id
    const existingSubscription = await database.findByMultipleFields('user_subscriptions', {
      stripe_subscription_id: subscription.id,
      users_id: parseInt(userId),
      stripe_customer_id: subscription.customer
    });

    let subscriptionRecord;
    if (existingSubscription && existingSubscription.length > 0) {
      // Update existing record - findByMultipleFields returns an array
      subscriptionRecord = existingSubscription[0];
      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;
      await database.update('user_subscriptions', recordId, {
        status: subscription.status,
        current_period_start: startDate,
        current_period_end: endDate,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
      });
      logger.info('Updated existing subscription record:', { subscriptionId: subscription.id, recordId: recordId });
    } else {
      // Double-check for any existing records with the same Stripe subscription ID (fallback check)
      const duplicatesByStripeId = await database.findByField(
        'user_subscriptions',
        'stripe_subscription_id',
        subscription.id
      );

      if (duplicatesByStripeId.length > 0) {
        logger.warn('Found existing subscription with same Stripe ID but different user/customer combination:', {
          subscriptionId: subscription.id,
          existingRecords: duplicatesByStripeId.map(r => {
            const fields = r.fields || r;
            return { id: r.id || fields.id, userId: fields.users_id, customerId: fields.stripe_customer_id };
          })
        });
        // Use the first existing record and update it
        subscriptionRecord = duplicatesByStripeId[0];
        const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;
        await database.update('user_subscriptions', recordId, {
          users_id: parseInt(userId),
          stripe_customer_id: subscription.customer,
          status: subscription.status,
          current_period_start: startDate,
          current_period_end: endDate,
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
        });
        logger.info('Updated existing subscription record with corrected user/customer info:', { subscriptionId: subscription.id, recordId: recordId });
      } else {
        // Create new subscription record
        subscriptionRecord = await database.create('user_subscriptions', {
          users_id: parseInt(userId),
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          current_period_start: startDate,
          current_period_end: endDate,
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
        });
        logger.info('Created new subscription record:', { subscriptionId: subscription.id, recordId: subscriptionRecord.id });
      }
    }

    // Update user record with proper ID resolution (use already resolved pgUserId)
    await database.update('users', pgUserId, {
      subscription_tier: tier,
      subscription_status: subscription.status
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    // Create initial usage record for the subscription
    await this.createUsageRecord(userId, subscription, subscriptionRecord);

    logger.info('Subscription created:', {
      subscriptionId: subscription.id,
      userId,
      tier
    });

    return { processed: true };
  }

  /**
   * Handle subscription updated
   */
  async handleSubscriptionUpdated(subscription) {
    const userId = subscription.metadata.user_id;
    const tier = this.getTierFromPrice(subscription.items.data[0].price.id);

    // Find existing subscription record
    const existingSubscriptions = await database.findByField(
      'user_subscriptions',
      'stripe_subscription_id',
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      // Update subscription record
      await database.update('user_subscriptions', recordId, {
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString().split('T')[0],
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0],
        cancel_at_period_end: subscription.cancel_at_period_end
      });

      // Update user record with proper ID resolution
      const pgUserId = await this.resolveUserId(userId);
      await database.update('users', pgUserId, {
        subscription_tier: tier,
        subscription_status: subscription.status
      });

      // Clear cached user data to force reload with new subscription info
      clearCachedUser(userId);

      logger.info('Subscription updated:', {
        subscriptionId: subscription.id,
        userId,
        tier,
        status: subscription.status
      });
    }

    return { processed: true };
  }

  /**
   * Handle subscription deleted/canceled
   */
  async handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata.user_id;

    // Update subscription record
    const existingSubscriptions = await database.findByField(
      'user_subscriptions',
      'stripe_subscription_id',
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      await database.update('user_subscriptions', recordId, {
        status: 'canceled'
      });
    }

    // Update user record with proper ID resolution
    const pgUserId = await this.resolveUserId(userId);
    await database.update('users', pgUserId, {
      subscription_tier: 'free',
      subscription_status: 'canceled'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    logger.info('Subscription canceled:', {
      subscriptionId: subscription.id,
      userId
    });

    return { processed: true };
  }

  /**
   * Handle subscription paused
   */
  async handleSubscriptionPaused(subscription) {
    const userId = subscription.metadata.user_id;

    // Update subscription record
    const existingSubscriptions = await database.findByField(
      'user_subscriptions',
      'stripe_subscription_id',
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      await database.update('user_subscriptions', recordId, {
        status: 'paused'
      });
    }

    // Update user record - keep tier but mark as paused with proper ID resolution
    const pgUserId = await this.resolveUserId(userId);
    await database.update('users', pgUserId, {
      subscription_status: 'paused'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    logger.info('Subscription paused:', {
      subscriptionId: subscription.id,
      userId
    });

    return { processed: true };
  }

  /**
   * Handle subscription resumed
   */
  async handleSubscriptionResumed(subscription) {
    const userId = subscription.metadata.user_id;
    const tier = this.getTierFromPrice(subscription.items.data[0].price.id);

    // Update subscription record
    const existingSubscriptions = await database.findByField(
      'user_subscriptions',
      'stripe_subscription_id',
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const recordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      await database.update('user_subscriptions', recordId, {
        status: 'active',
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString().split('T')[0],
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0]
      });
    }

    // Update user record with proper ID resolution
    const pgUserId = await this.resolveUserId(userId);
    await database.update('users', pgUserId, {
      subscription_tier: tier,
      subscription_status: 'active'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    logger.info('Subscription resumed:', {
      subscriptionId: subscription.id,
      userId,
      tier
    });

    return { processed: true };
  }

  /**
   * Handle successful payment
   */
  async handlePaymentSucceeded(invoice) {
    const subscriptionId = invoice.subscription;

    if (subscriptionId) {
      // Get subscription details
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata.user_id;

      // Create usage record for new billing period (will find subscription record internally)
      await this.createUsageRecord(userId, subscription);

      logger.info('Payment succeeded:', {
        invoiceId: invoice.id,
        subscriptionId,
        userId
      });
    }

    return { processed: true };
  }

  /**
   * Handle failed payment
   */
  async handlePaymentFailed(invoice) {
    const subscriptionId = invoice.subscription;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata.user_id;

      // Update user status with proper ID resolution
      const pgUserId = await this.resolveUserId(userId);
      await database.update('users', pgUserId, {
        subscription_status: 'past_due'
      });

      // Clear cached user data to force reload with new subscription info
      clearCachedUser(userId);

      logger.warn('Payment failed:', {
        invoiceId: invoice.id,
        subscriptionId,
        userId
      });
    }

    return { processed: true };
  }

  /**
   * Handle trial ending soon
   */
  async handleTrialWillEnd(subscription) {
    const userId = subscription.metadata.user_id;

    logger.info('Trial ending soon:', {
      subscriptionId: subscription.id,
      userId,
      trialEnd: new Date(subscription.trial_end * 1000)
    });

    // Could send email notification here
    return { processed: true };
  }

  /**
   * Create usage record for new billing period
   */
  async createUsageRecord(userId, subscription, subscriptionRecord = null) {
    try {
      // If subscriptionRecord is not provided, find it
      if (!subscriptionRecord) {
        const existingSubscriptions = await database.findByField(
          'user_subscriptions',
          'stripe_subscription_id',
          subscription.id
        );
        subscriptionRecord = existingSubscriptions.length > 0 ? existingSubscriptions[0] : null;
      }

      if (!subscriptionRecord) {
        logger.error('No subscription record found for usage creation:', {
          subscriptionId: subscription.id,
          userId
        });
        return;
      }

      // Check for existing usage record using the unique constraint: users_id and subscription_id
      const periodStart = new Date(subscription.current_period_start * 1000).toISOString().split('T')[0];
      const periodEnd = new Date(subscription.current_period_end * 1000).toISOString().split('T')[0];

      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const subscriptionRecordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      const existingUsage = await database.findByMultipleFields('subscription_usage', {
        user_id: parseInt(userId),
        user_subscriptions_id: parseInt(subscriptionRecordId)
      });

      if (existingUsage) {
        // Update existing usage record with new period dates if needed
        const existingUsageFields = existingUsage.fields || existingUsage;
        const currentPeriodStart = existingUsageFields.period_start;
        const currentPeriodEnd = existingUsageFields.period_end;

        if (currentPeriodStart !== periodStart || currentPeriodEnd !== periodEnd) {
          const usageRecordId = existingUsage.id || (existingUsage.fields && existingUsage.fields.id) || existingUsage.id;
          await database.update('subscription_usage', usageRecordId, {
            period_start: periodStart,
            period_end: periodEnd
          });
          logger.info('Updated existing usage record period:', {
            usageId: usageRecordId,
            userId,
            subscriptionRecordId: subscriptionRecordId,
            oldPeriod: `${currentPeriodStart} to ${currentPeriodEnd}`,
            newPeriod: `${periodStart} to ${periodEnd}`
          });
        } else {
          logger.info('Usage record already exists and is current:', {
            usageId: existingUsage.id || (existingUsage.fields && existingUsage.fields.id) || existingUsage.id,
            userId,
            subscriptionRecordId: subscriptionRecordId,
            periodStart,
            periodEnd
          });
        }
        return;
      }

      const usageRecord = await database.create('subscription_usage', {
        user_id: parseInt(userId),
        user_subscriptions_id: parseInt(subscriptionRecordId), // Use the user_subscriptions record ID, not Stripe subscription ID
        period_start: periodStart,
        period_end: periodEnd,
        videos_processed: 0,
        api_calls_made: 0,
        storage_used_mb: 0,
        ai_summaries_generated: 0,
        analytics_views: 0
      });

      logger.info('Created usage record:', {
        usageId: usageRecord.id,
        userId,
        subscriptionRecordId: subscriptionRecordId,
        periodStart,
        periodEnd
      });
    } catch (error) {
      logger.error('Error creating record in subscription_usage:', error);
      logger.error('Error creating usage record:', {});
    }
  }

  /**
   * Log webhook event for debugging
   */
  async logWebhookEvent(event) {
    try {
      const userId = event.data.object.metadata?.user_id ||
                    event.data.object.customer_details?.user_id;

      // Only create the event record if user_id is not blank
      if (!userId) {
        logger.warn('Skipping subscription_events record creation - user_id is blank:', {
          eventId: event.id,
          eventType: event.type,
          stripeSubscriptionId: event.data.object.id
        });
        return;
      }

      await database.create('subscription_events', {
        stripe_event_id: event.id,
        users_id: parseInt(userId),
        event_type: event.type,
        stripe_subscription_id: event.data.object.id,
        event_data: JSON.stringify(event.data.object, null, 2),
        processed_successfully: true
      });

      logger.info('Subscription event logged successfully:', {
        eventId: event.id,
        eventType: event.type,
        userId
      });
    } catch (error) {
      logger.error('Error logging webhook event:', error);
    }
  }

  /**
   * Update event log with processing result
   */
  async updateEventLog(eventId, success, errorMessage = null) {
    try {
      const events = await database.findByField('subscription_events', 'stripe_event_id', eventId);
      if (events.length > 0) {
        const event = events[0];
        // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
        const recordId = event.id || (event.fields && event.fields.id) || event.id;
        await database.update('subscription_events', recordId, {
          processed_successfully: success,
          error_message: errorMessage
        });
      }
    } catch (error) {
      logger.error('Error updating event log:', error);
    }
  }

  /**
   * Get tier name from Stripe price ID
   */
  getTierFromPrice(priceId) {
    const tiers = stripeConfig.subscriptionTiers;

    for (const [tierName, config] of Object.entries(tiers)) {
      // Check monthly price ID
      if (config.monthly && config.monthly.priceId === priceId) {
        return tierName;
      }
      // Check yearly price ID
      if (config.yearly && config.yearly.priceId === priceId) {
        return tierName;
      }
    }

    logger.warn('Unknown price ID:', priceId);
    return 'basic'; // fallback
  }

  /**
   * Get current subscription for user
   */
  async getUserSubscription(userId) {
    try {
      const subscriptions = await database.findByField('user_subscriptions', 'users_id', parseInt(userId));
      const activeSubscription = subscriptions.find(sub => {
        // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
        const subFields = sub.fields || sub;
        return ['active', 'paused', 'trialing'].includes(subFields.status);
      });

      return activeSubscription || null;
    } catch (error) {
      logger.error('Error getting user subscription:', error);
      return null;
    }
  }

  /**
   * Check if user can access feature based on subscription
   */
  async canAccessFeature(userId, feature) {
    const user = await database.findById('users', parseInt(userId));
    // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
    const userFields = user.fields || user;
    const tierConfig = stripeConfig.getTierConfig(userFields.subscription_tier || 'free');

    if (!tierConfig) return false;

    switch (feature) {
    case 'analytics':
      return tierConfig.analyticsAccess;
    case 'api':
      return tierConfig.apiAccess;
    case 'unlimited_videos':
      return tierConfig.videoLimit === -1;
    default:
      return userFields.subscription_status === 'active';
    }
  }
}

module.exports = new StripeService();
