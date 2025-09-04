const stripeService = require('../services/stripe.service');
const stripeConfig = require('../config/stripe.config');
const airtable = require('../services/airtable.service');
const { logger } = require('../utils');

const subscriptionController = {
  /**
   * Create Stripe checkout session
   */
  async createCheckoutSession(req, res) {
    try {
      const { priceId } = req.body;
      const user = req.user;

      logger.info('Creating checkout session:', { 
        userId: user.id, 
        priceId, 
        email: user.email 
      });

      // Validate price ID exists in our configuration
      const allTiers = stripeConfig.getAllTiers();
      const validPriceId = allTiers.some(tier => {
        // Check both monthly and yearly price IDs for each tier
        return (tier.monthly && tier.monthly.priceId === priceId) || 
               (tier.yearly && tier.yearly.priceId === priceId);
      });
      
      if (!validPriceId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid price ID',
          error: 'INVALID_PRICE_ID'
        });
      }

      // Create checkout session
      const session = await stripeService.createCheckoutSession(
        user.id, 
        priceId, 
        user.email
      );

      res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });

    } catch (error) {
      logger.error('Error creating checkout session:', {
        error: error.message,
        stack: error.stack,
        userId: user.id,
        userEmail: user.email,
        priceId: req.body.priceId
      });
      res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
        error: 'CHECKOUT_SESSION_ERROR'
      });
    }
  },

  /**
   * Create Stripe customer portal session
   */
  async createPortalSession(req, res) {
    try {
      const user = req.user;

      if (!user.stripe_customer_id) {
        return res.status(400).json({
          success: false,
          message: 'No Stripe customer found',
          error: 'NO_CUSTOMER'
        });
      }

      const returnUrl = `${req.protocol}://${req.get('host')}/subscription/manage`;
      const session = await stripeService.createPortalSession(
        user.stripe_customer_id,
        returnUrl
      );

      res.json({
        success: true,
        url: session.url
      });

    } catch (error) {
      logger.error('Error creating portal session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create portal session',
        error: 'PORTAL_SESSION_ERROR'
      });
    }
  },

  /**
   * Get subscription status and details
   */
  async getSubscriptionStatus(req, res) {
    try {
      const user = req.user;
      const subscription = await stripeService.getUserSubscription(user.id);

      const response = {
        success: true,
        subscription: {
          tier: user.subscription_tier || 'free',
          status: user.subscription_status || 'none',
          hasActiveSubscription: subscription !== null
        },
        tiers: stripeConfig.getAllTiers().map(tier => ({
          key: tier.key,
          name: tier.name,
          priceId: tier.priceId,
          features: tier.features,
          videoLimit: tier.videoLimit,
          analyticsAccess: tier.analyticsAccess,
          apiAccess: tier.apiAccess
        }))
      };

      if (subscription) {
        response.subscription.details = {
          id: subscription.stripe_subscription_id,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          trialEnd: subscription.trial_end
        };
      }

      res.json(response);

    } catch (error) {
      logger.error('Error getting subscription status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get subscription status',
        error: 'SUBSCRIPTION_STATUS_ERROR'
      });
    }
  },

  /**
   * Get current usage for billing period
   */
  async getUsage(req, res) {
    try {
      const user = req.user;
      const userTier = user.subscription_tier || 'free';
      const tierConfig = stripeConfig.getTierConfig(userTier);

      // Get current usage from middleware helper
      const { subscriptionMiddleware } = require('../middleware');
      const currentUsage = await getCurrentUsageAll(user.id);

      const limits = {
        videos: tierConfig?.videoLimit || 0,
        api_calls: tierConfig?.apiLimit || 0,
        storage: tierConfig?.storageLimit || 0
      };

      const percentages = {
        videos: limits.videos === -1 ? 0 : Math.min((currentUsage.videos / limits.videos) * 100, 100),
        api_calls: limits.api_calls === -1 ? 0 : Math.min((currentUsage.api_calls / limits.api_calls) * 100, 100),
        storage: limits.storage === -1 ? 0 : Math.min((currentUsage.storage / limits.storage) * 100, 100)
      };

      res.json({
        success: true,
        tier: userTier,
        usage: currentUsage,
        limits: limits,
        percentages: percentages,
        isUnlimited: {
          videos: limits.videos === -1,
          api_calls: limits.api_calls === -1,
          storage: limits.storage === -1
        }
      });

    } catch (error) {
      logger.error('Error getting usage:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get usage data',
        error: 'USAGE_ERROR'
      });
    }
  },

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(req, res) {
    let event;
    
    console.log('🚀 SUBSCRIPTION CONTROLLER WEBHOOK HIT!');
    logger.info('🚀 SUBSCRIPTION CONTROLLER WEBHOOK HIT!');

    // Debug: Log all incoming webhook details
    logger.info('Webhook received:', {
      method: req.method,
      headers: {
        'x-test-webhook': req.headers['x-test-webhook'],
        'x-event-type': req.headers['x-event-type'],
        'stripe-signature': req.headers['stripe-signature'] ? 'present' : 'missing'
      },
      NODE_ENV: process.env.NODE_ENV,
      bodyType: typeof req.body,
      bodyLength: req.body ? req.body.length : 0
    });

    try {
      const signature = req.headers['stripe-signature'];
      const webhookSecret = stripeConfig.getWebhookSecret();

      // Development bypass for testing without Stripe signatures
      if (process.env.NODE_ENV === 'development' && req.headers['x-test-webhook'] === 'true') {
        logger.info('Development mode: bypassing webhook signature verification');
        const subscriptionData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Log the subscription data for debugging
        logger.info('Test subscription data received:', { 
          id: subscriptionData.id,
          metadata: subscriptionData.metadata,
          user_id: subscriptionData.metadata?.user_id,
          fullData: JSON.stringify(subscriptionData, null, 2)
        });
        
        event = {
          id: 'test_' + Date.now(),
          type: req.headers['x-event-type'] || 'customer.subscription.created',
          data: { 
            object: subscriptionData
          }
        };
      } else {
        // Production webhook signature verification
        if (!signature || !webhookSecret) {
          logger.error('Missing webhook signature or secret');
          return res.status(400).json({ error: 'Missing signature or secret' });
        }

        const stripe = require('stripe')(stripeConfig.getSecretKey());
        event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      }

      logger.info('Received webhook event:', { 
        type: event.type, 
        id: event.id 
      });

      // Process the event
      const result = await stripeService.handleWebhookEvent(event);
      
      logger.info('Webhook processed successfully:', { 
        eventId: event.id, 
        result 
      });

      res.json({ received: true });

    } catch (error) {
      logger.error('Webhook error:', error);
      
      if (error.type === 'StripeSignatureVerificationError') {
        return res.status(400).json({ error: 'Invalid signature' });
      }

      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  /**
   * Get receipt and sync subscription data after checkout
   */
  async getReceipt(req, res) {
    try {
      const { session_id } = req.query;
      const user = req.user;

      if (!session_id) {
        return res.status(400).json({
          success: false,
          message: 'Session ID required'
        });
      }

      logger.info('Getting receipt for session:', { sessionId: session_id, userId: user.id });

      // Get the checkout session from Stripe
      const stripeConfig = require('../config/stripe.config');
      const stripe = require('stripe')(stripeConfig.getSecretKey());
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.customer) {
        // Get the subscription from the session
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          
          // Manually trigger subscription sync as backup to webhooks
          await stripeService.handleSubscriptionCreated(subscription);
          
          // Log the manual sync event to Subscription_Events table
          await airtable.create('Subscription_Events', {
            stripe_event_id: `manual_sync_${session_id}`,
            user_id: [user.id],
            event_type: 'manual.subscription.sync',
            stripe_subscription_id: subscription.id,
            event_data: JSON.stringify({
              source: 'manual_receipt_sync',
              session_id: session_id,
              subscription_id: subscription.id,
              timestamp: new Date().toISOString()
            }, null, 2),
            processed_successfully: true
          });
          
          logger.info('Manual subscription sync completed:', { 
            sessionId: session_id, 
            subscriptionId: subscription.id,
            userId: user.id 
          });
        }

        // Update user's Stripe customer ID if not already set
        if (!user.stripe_customer_id) {
          await airtable.update('Users', user.id, {
            stripe_customer_id: session.customer
          });
        }
      }

      res.json({
        success: true,
        session_id: session_id,
        customer_id: session.customer,
        subscription_id: session.subscription
      });

    } catch (error) {
      logger.error('Error getting receipt:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process receipt',
        error: 'RECEIPT_ERROR'
      });
    }
  }
};

// Helper function to get usage (imported from middleware helper)
async function getCurrentUsageAll(userId) {
  try {
    const { airtable } = require('../services/airtable.service');
    
    // Get active subscription
    const subscriptions = await airtable.findByField('User_Subscriptions', 'user_id', userId);
    const subscription = subscriptions.find(sub => 
      ['active', 'trialing', 'paused'].includes(sub.status)
    );

    if (!subscription) {
      return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
    }

    // Get current period usage
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
    logger.error('Error getting usage:', error);
    return { videos: 0, api_calls: 0, storage: 0, ai_summaries: 0 };
  }
}

module.exports = subscriptionController;