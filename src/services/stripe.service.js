const stripe = require('stripe')(require('../config/stripe.config').getSecretKey());
const stripeConfig = require('../config/stripe.config');
const airtable = require('./airtable.service');
const { logger } = require('../utils');

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
      // First try to find by record ID, if that fails, find by email
      let user;
      try {
        user = await airtable.findById('Users', userId);
      } catch (recordIdError) {
        logger.info('User ID is not a valid record ID, searching by email:', { userId, email });
        const users = await airtable.findByField('Users', 'email', email);
        user = users && users.length > 0 ? users[0] : null;
      }
      
      if (!user) {
        logger.error('User not found for checkout session:', { userId, email });
        throw new Error('User not found');
      }
      
      if (user.stripe_customer_id) {
        // Retrieve existing customer
        const customer = await stripe.customers.retrieve(user.stripe_customer_id);
        return customer;
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          user_id: userId
        }
      });

      // Update user record with customer ID
      if (user && user.id) {
        await airtable.update('Users', user.id, {
          stripe_customer_id: customer.id
        });
      } else {
        logger.warn('Could not update user record with Stripe customer ID - user not found:', { userId, email });
      }

      logger.info('New Stripe customer created:', { 
        customerId: customer.id, 
        userId 
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
   * Handle subscription created
   */
  async handleSubscriptionCreated(subscription) {
    const userId = subscription.metadata.user_id;
    const tier = this.getTierFromPrice(subscription.items.data[0].price.id);
    
    // Debug: Log date formatting
    const startDate = new Date(subscription.current_period_start * 1000).toISOString().split('T')[0];
    const endDate = new Date(subscription.current_period_end * 1000).toISOString().split('T')[0];
    logger.info('Subscription dates:', {
      rawStart: subscription.current_period_start,
      rawEnd: subscription.current_period_end,
      formattedStart: startDate,
      formattedEnd: endDate
    });
    
    // Check for existing subscription record to prevent duplicates
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );

    let subscriptionRecord;
    if (existingSubscriptions.length > 0) {
      // Update existing record
      subscriptionRecord = existingSubscriptions[0];
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        user_id: [userId],
        stripe_customer_id: subscription.customer,
        subscription_tier: tier,
        status: subscription.status,
        current_period_start: startDate,
        current_period_end: endDate,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
      });
      logger.info('Updated existing subscription record:', { subscriptionId: subscription.id, recordId: subscriptionRecord.id });
    } else {
      // Create new subscription record
      subscriptionRecord = await airtable.create('User_Subscriptions', {
        user_id: [userId],
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        status: subscription.status,
        current_period_start: startDate,
        current_period_end: endDate,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
      });
      logger.info('Created new subscription record:', { subscriptionId: subscription.id, recordId: subscriptionRecord.id });
    }

    // Update user record
    await airtable.update('Users', userId, {
      subscription_tier: tier,
      subscription_status: subscription.status
    });

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
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      
      // Update subscription record
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        subscription_tier: tier,
        status: subscription.status,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString().split('T')[0],
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0],
        cancel_at_period_end: subscription.cancel_at_period_end
      });

      // Update user record
      await airtable.update('Users', userId, {
        subscription_tier: tier,
        subscription_status: subscription.status
      });

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
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        status: 'canceled'
      });
    }

    // Update user record
    await airtable.update('Users', userId, {
      subscription_tier: 'free',
      subscription_status: 'canceled'
    });

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
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        status: 'paused'
      });
    }

    // Update user record - keep tier but mark as paused
    await airtable.update('Users', userId, {
      subscription_status: 'paused'
    });

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
    const existingSubscriptions = await airtable.findByField(
      'User_Subscriptions', 
      'stripe_subscription_id', 
      subscription.id
    );

    if (existingSubscriptions.length > 0) {
      const subscriptionRecord = existingSubscriptions[0];
      
      await airtable.update('User_Subscriptions', subscriptionRecord.id, {
        status: 'active',
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString().split('T')[0],
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0]
      });
    }

    // Update user record
    await airtable.update('Users', userId, {
      subscription_tier: tier,
      subscription_status: 'active'
    });

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

      // Update user status
      await airtable.update('Users', userId, {
        subscription_status: 'past_due'
      });

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
        const existingSubscriptions = await airtable.findByField(
          'User_Subscriptions', 
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

      // Check for existing usage record for this period to prevent duplicates
      const existingUsage = await airtable.findByField('Subscription_Usage', 'user_id', userId);
      const periodStart = new Date(subscription.current_period_start * 1000).toISOString().split('T')[0];
      const periodEnd = new Date(subscription.current_period_end * 1000).toISOString().split('T')[0];
      
      const existingPeriodUsage = existingUsage.find(usage => 
        usage.period_start === periodStart && usage.period_end === periodEnd
      );

      if (existingPeriodUsage) {
        logger.info('Usage record already exists for period:', { 
          userId, 
          periodStart, 
          periodEnd,
          usageId: existingPeriodUsage.id 
        });
        return;
      }

      const usageRecord = await airtable.create('Subscription_Usage', {
        user_id: [userId],
        subscription_id: [subscriptionRecord.id], // Use the User_Subscriptions record ID, not Stripe subscription ID
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
        subscriptionRecordId: subscriptionRecord.id,
        periodStart,
        periodEnd
      });
    } catch (error) {
      logger.error('Error creating record in Subscription_Usage:', error);
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
      
      await airtable.create('Subscription_Events', {
        stripe_event_id: event.id,
        user_id: userId ? [userId] : undefined,
        event_type: event.type,
        stripe_subscription_id: event.data.object.id,
        event_data: JSON.stringify(event.data.object, null, 2),
        processed_successfully: true
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
      const events = await airtable.findByField('Subscription_Events', 'stripe_event_id', eventId);
      if (events.length > 0) {
        await airtable.update('Subscription_Events', events[0].id, {
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
      const subscriptions = await airtable.findByField('User_Subscriptions', 'user_id', userId);
      const activeSubscription = subscriptions.find(sub => 
        ['active', 'paused', 'trialing'].includes(sub.status)
      );
      
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
    const user = await airtable.findById('Users', userId);
    const tierConfig = stripeConfig.getTierConfig(user.subscription_tier || 'free');
    
    if (!tierConfig) return false;
    
    switch (feature) {
      case 'analytics':
        return tierConfig.analyticsAccess;
      case 'api':
        return tierConfig.apiAccess;
      case 'unlimited_videos':
        return tierConfig.videoLimit === -1;
      default:
        return user.subscription_status === 'active';
    }
  }
}

module.exports = new StripeService();