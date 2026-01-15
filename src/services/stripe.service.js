const stripe = require('stripe')(require('../config/stripe.config').getSecretKey());
const stripeConfig = require('../config/stripe.config');
const database = require('./database.service');
const { user: UserModel, userSubscription, subscriptionUsage, subscriptionEvents } = require('../models');
const { logger } = require('../utils');
const { clearCachedUser, forceTokenRefresh } = require('../middleware');
const emailService = require('./email.service');
const trackingService = require('./tracking.service');

/**
 * Extract period dates from subscription object
 * Handles both top-level fields and nested items.data[0] structure
 */
function getSubscriptionPeriod(subscription) {
  const rawStart = subscription.current_period_start
    || (subscription.items?.data?.[0]?.current_period_start)
    || subscription.start_date
    || Math.floor(Date.now() / 1000);
  const rawEnd = subscription.current_period_end
    || (subscription.items?.data?.[0]?.current_period_end)
    || (rawStart + 30 * 24 * 60 * 60); // Default to 30 days from start

  return {
    rawStart,
    rawEnd,
    startDate: new Date(rawStart * 1000).toISOString().split('T')[0],
    endDate: new Date(rawEnd * 1000).toISOString().split('T')[0],
    startTimestamp: new Date(rawStart * 1000),
    endTimestamp: new Date(rawEnd * 1000)
  };
}

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

      // Get user record to check for affiliate referral code
      const user = await UserModel.findById(userId);
      const referredByCode = user?.referred_by_code || null;

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
          user_id: userId,
          referred_by_code: referredByCode,
          is_referred: referredByCode ? 'true' : 'false'
        },
        subscription_data: {
          metadata: {
            user_id: userId,
            referred_by_code: referredByCode,
            is_referred: referredByCode ? 'true' : 'false'
          }
        }
      });

      logger.info('Checkout session created:', {
        sessionId: session.id,
        userId,
        customerId: customer.id,
        referredByCode: referredByCode || 'none'
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
        user = await UserModel.findById(userId);
      // eslint-disable-next-line no-unused-vars
      } catch (_recordIdError) {
        logger.info('User ID not found by ID, searching by email:', { userId, email });
        user = await UserModel.findByEmail(email);
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

        // Ensure customer has user_id in metadata (backfill for older customers)
        if (!customer.metadata?.user_id && actualUserId) {
          await stripe.customers.update(userStripeCustomerId, {
            metadata: {
              ...customer.metadata,
              user_id: String(actualUserId)
            }
          });
          logger.info('Updated Stripe customer with user_id metadata', {
            customerId: userStripeCustomerId,
            userId: actualUserId
          });
          customer.metadata = customer.metadata || {};
          customer.metadata.user_id = String(actualUserId);
        }

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
      await UserModel.updateUser(actualUserId, {
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
      logger.info('Processing webhook event:', { type: event.type, id: event.id });

      // CHECK: Has this event already been processed?
      const existingEvent = await subscriptionEvents.findByStripeEventId(event.id);
      if (existingEvent && existingEvent.processed_successfully === true) {
        logger.info('Event already processed successfully, skipping', {
          eventId: event.id,
          eventType: event.type,
          previousProcessing: existingEvent.processed_at
        });
        return {
          processed: true,
          duplicate: true,
          message: 'Event already processed'
        };
      }

      // Mark event as being processed (prevents concurrent processing)
      if (!existingEvent) {
        await this.logWebhookEvent(event);
      } else {
        await subscriptionEvents.update(existingEvent.id, {
          status: 'processing',
          retry_count: (existingEvent.retry_count || 0) + 1
        });
      }

      // Process event
      let result;
      switch (event.type) {
      case 'customer.subscription.created':
        result = await this.handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        result = await this.handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        result = await this.handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.paused':
        result = await this.handleSubscriptionPaused(event.data.object);
        break;

      case 'customer.subscription.resumed':
        result = await this.handleSubscriptionResumed(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        result = await this.handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        result = await this.handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        result = await this.handleTrialWillEnd(event.data.object);
        break;

      case 'invoice.payment_action_required':
        result = await this.handlePaymentActionRequired(event.data.object);
        break;

      case 'checkout.session.completed':
        result = await this.handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'customer.subscription.trial_ended':
        result = await this.handleTrialEnded(event.data.object);
        break;

      case 'charge.succeeded':
        result = await this.handleChargeSucceeded(event.data.object);
        break;

      case 'charge.failed':
        result = await this.handleChargeFailed(event.data.object);
        break;

      case 'charge.refunded':
        result = await this.handleChargeRefunded(event.data.object);
        break;

      case 'customer.created':
        result = await this.handleCustomerCreated(event.data.object);
        break;

      case 'customer.updated':
        result = await this.handleCustomerUpdated(event.data.object);
        break;

      case 'customer.deleted':
        result = await this.handleCustomerDeleted(event.data.object);
        break;

      default:
        logger.info('Unhandled webhook event type:', event.type);
        result = { processed: false, reason: 'Event type not handled' };
      }

      // Mark as successfully processed
      const eventRecord = await subscriptionEvents.findByStripeEventId(event.id);
      if (eventRecord) {
        await subscriptionEvents.update(eventRecord.id, {
          processed_successfully: true,
          status: 'processed',
          processed_at: new Date(),
          error_message: null
        });
      }

      return result;

    } catch (error) {
      logger.error('Error processing webhook event:', {
        message: error.message,
        stack: error.stack,
        eventType: event.type,
        eventId: event.id
      });

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
      const user = await UserModel.findByAirtableId(userId);
      if (!user) {
        throw new Error(`No user found with airtable_id ${userId}`);
      }
      return user.id;
    } else if (typeof userId === 'string' && userId.includes('@')) {
      const user = await UserModel.findByEmail(userId);
      if (!user) {
        throw new Error(`No user found with email ${userId}`);
      }
      return user.id;
    } else {
      throw new Error(`Unrecognized userId format: ${userId} (type: ${typeof userId})`);
    }
  }

  /**
   * Resolve user ID with fallback to Stripe customer ID or subscription record
   * Used when metadata.user_id may be missing (e.g., Customer Portal actions)
   * @param {string|number|undefined} userId - User ID from metadata
   * @param {string} customerId - Stripe customer ID
   * @param {object|null} subscriptionRecord - Existing subscription record from database
   * @returns {Promise<number|null>} PostgreSQL user ID or null if not found
   */
  async resolveUserIdWithFallback(userId, customerId, subscriptionRecord = null) {
    // Try metadata user_id first
    if (userId) {
      try {
        return await this.resolveUserId(userId);
      } catch (error) {
        logger.warn('Failed to resolve user_id from metadata, trying fallbacks', {
          userId,
          error: error.message
        });
      }
    }

    // Try Stripe customer ID lookup
    if (customerId) {
      const user = await UserModel.findByStripeCustomerId(customerId);
      if (user) {
        logger.info('Resolved user via Stripe customer ID', {
          customerId,
          userId: user.id
        });
        return user.id;
      }
    }

    // Try subscription record
    if (subscriptionRecord && subscriptionRecord.users_id) {
      logger.info('Resolved user via subscription record', {
        subscriptionRecordId: subscriptionRecord.id,
        userId: subscriptionRecord.users_id
      });
      return subscriptionRecord.users_id;
    }

    logger.error('Could not resolve user ID with any fallback method', {
      userId,
      customerId,
      hasSubscriptionRecord: !!subscriptionRecord
    });
    return null;
  }

  /**
   * Handle subscription created
   */
  async handleSubscriptionCreated(subscription) {
    let userId = subscription.metadata?.user_id;
    const tier = await this.getTierFromPrice(subscription.items.data[0].price.id);

    logger.info('Processing subscription created webhook:', {
      subscriptionId: subscription.id,
      customerId: subscription.customer,
      userId: userId,
      userIdType: typeof userId,
      tier: tier,
      metadata: subscription.metadata
    });

    // Try to resolve user ID with multiple fallback strategies
    let pgUserId;

    // Strategy 1: Use metadata user_id if present
    if (userId) {
      try {
        pgUserId = await this.resolveUserId(userId);
        logger.info('Successfully resolved user ID from metadata:', {
          originalUserId: userId,
          resolvedUserId: pgUserId
        });
      } catch (userError) {
        logger.warn('Failed to resolve user_id from metadata, trying fallbacks:', {
          originalUserId: userId,
          error: userError.message
        });
      }
    }

    // Strategy 2: Look up by Stripe customer ID in our database
    if (!pgUserId && subscription.customer) {
      const userByCustomerId = await UserModel.findByStripeCustomerId(subscription.customer);
      if (userByCustomerId) {
        pgUserId = userByCustomerId.id;
        userId = userByCustomerId.id;
        logger.info('Found user by Stripe customer ID:', {
          customerId: subscription.customer,
          resolvedUserId: pgUserId
        });
      }
    }

    // Strategy 3: Get user_id from Stripe customer metadata
    if (!pgUserId && subscription.customer) {
      try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        if (customer.metadata?.user_id) {
          pgUserId = await this.resolveUserId(customer.metadata.user_id);
          userId = customer.metadata.user_id;
          logger.info('Found user from Stripe customer metadata:', {
            customerId: subscription.customer,
            resolvedUserId: pgUserId
          });
        }
      } catch (customerMetaError) {
        logger.warn('Error getting customer metadata from Stripe:', customerMetaError.message);
      }
    }

    // Strategy 4: Look up by customer email from Stripe
    if (!pgUserId && subscription.customer) {
      try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        if (customer.email) {
          const userByEmail = await UserModel.findByEmail(customer.email);
          if (userByEmail) {
            pgUserId = userByEmail.id;
            userId = userByEmail.id;
            logger.info('Found user by customer email:', {
              email: customer.email,
              resolvedUserId: pgUserId
            });

            // Also update user's stripe_customer_id if not set
            if (!userByEmail.stripe_customer_id) {
              await UserModel.updateUser(pgUserId, {
                stripe_customer_id: subscription.customer
              });
              logger.info('Updated user with Stripe customer ID');
            }
          }
        }
      } catch (customerError) {
        logger.error('Error retrieving customer from Stripe:', customerError.message);
      }
    }

    // If still no user found, throw error
    if (!pgUserId) {
      logger.error('Cannot find user for subscription creation:', {
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        metadata: subscription.metadata
      });
      throw new Error('Cannot find user for subscription - no user_id in metadata and customer lookup failed');
    }

    // Extract period dates using helper function
    const period = getSubscriptionPeriod(subscription);
    const startDate = period.startDate;
    const endDate = period.endDate;
    logger.info('Subscription dates:', {
      rawStart: period.rawStart,
      rawEnd: period.rawEnd,
      formattedStart: startDate,
      formattedEnd: endDate,
      source: subscription.current_period_start ? 'top-level' : 'items.data[0]'
    });

    // Check for existing subscription record by Stripe subscription ID first
    let subscriptionRecord = await userSubscription.getByStripeId(subscription.id);

    // Get plan name from tier
    const planName = tier.charAt(0).toUpperCase() + tier.slice(1); // Capitalize tier name
    const priceId = subscription.items.data[0].price.id;

    if (subscriptionRecord) {
      // Update existing record
      subscriptionRecord = await userSubscription.updateSubscription(subscriptionRecord.id, {
        users_id: pgUserId,
        stripe_customer_id: subscription.customer,
        plan_name: planName,
        price_id: priceId,
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
      subscriptionRecord = await userSubscription.createSubscription({
        users_id: pgUserId,
        stripe_customer_id: subscription.customer,
        stripe_subscription_id: subscription.id,
        plan_name: planName,
        price_id: priceId,
        status: subscription.status,
        current_period_start: startDate,
        current_period_end: endDate,
        cancel_at_period_end: subscription.cancel_at_period_end,
        trial_start: subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString().split('.')[0] + 'Z' : null,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString().split('.')[0] + 'Z' : null
      });
      logger.info('Created new subscription record:', { subscriptionId: subscription.id, recordId: subscriptionRecord.id });
    }

    // Cancel any existing Free tier subscription when user upgrades to paid plan
    if (tier !== 'free') {
      const freeSubscriptions = await userSubscription.getActiveByUserId(pgUserId);
      if (freeSubscriptions) {
        // Check if there's a Free subscription without Stripe ID (created during registration)
        const existingFree = await database.query(`
          SELECT id FROM user_subscriptions
          WHERE users_id = $1
          AND plan_name = 'Free'
          AND stripe_subscription_id IS NULL
          AND status = 'active'
          AND id != $2
        `, [pgUserId, subscriptionRecord.id]);

        if (existingFree.rows.length > 0) {
          logger.info(`Canceling old Free subscription for user ${pgUserId} (upgrading to ${tier})`);
          await userSubscription.updateSubscription(existingFree.rows[0].id, {
            status: 'canceled'
          });
        }
      }
    }

    // Get user's current tier BEFORE updating to detect upgrades
    const currentUser = await UserModel.findById(pgUserId);
    const oldTier = currentUser?.subscription_tier || 'free';
    const isUpgrade = this.getChangeType(oldTier, tier) === 'upgrade';

    logger.info('Subscription created - tier check', {
      subscriptionId: subscription.id,
      userId: pgUserId,
      oldTier,
      newTier: tier,
      isUpgrade
    });

    // Update user record with proper ID resolution (use already resolved pgUserId)
    await UserModel.updateUser(pgUserId, {
      subscription_tier: tier,
      subscription_status: subscription.status
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    // SEND UPGRADE EMAIL if this is an upgrade (handles checkout-based upgrades)
    if (isUpgrade && oldTier !== tier) {
      try {
        const userForEmail = await UserModel.findById(pgUserId);
        if (userForEmail && userForEmail.email) {
          const subscriptionPlansService = require('./subscription-plans.service');
          const newPlanData = await subscriptionPlansService.getPlanByKey(tier);
          const newFeatures = newPlanData ? newPlanData.features : [];

          await emailService.sendSubscriptionUpgraded(userForEmail.email, {
            firstName: userForEmail.first_name || 'User',
            oldPlanName: oldTier.charAt(0).toUpperCase() + oldTier.slice(1),
            newPlanName: tier.charAt(0).toUpperCase() + tier.slice(1),
            newFeatures: newFeatures
          });

          logger.info('Upgrade email sent from handleSubscriptionCreated', {
            userId: pgUserId,
            email: userForEmail.email,
            oldTier,
            newTier: tier
          });
        }
      } catch (emailError) {
        logger.error('Failed to send upgrade email from handleSubscriptionCreated', {
          error: emailError.message,
          userId: pgUserId,
          oldTier,
          newTier: tier
        });
        // Don't fail webhook if email fails
      }
    }

    // Create initial usage record for the subscription
    await this.createUsageRecord(userId, subscription, subscriptionRecord, tier);

    // Track affiliate conversion if user was referred
    try {
      const refgrowService = require('./refgrow.service');
      const userRecord = await UserModel.findById(pgUserId);

      if (userRecord && userRecord.referred_by_code) {
        const subscriptionAmount = subscription.items.data[0].price.unit_amount / 100;

        await refgrowService.trackConversion(
          userRecord.referred_by_code,
          pgUserId,
          subscriptionAmount,
          subscription.id
        );

        logger.info('Affiliate conversion tracked', {
          userId: pgUserId,
          referralCode: userRecord.referred_by_code,
          amount: subscriptionAmount
        });
      }
    } catch (affiliateError) {
      logger.error('Error tracking affiliate conversion:', affiliateError);
      // Don't fail subscription creation if affiliate tracking fails
    }

    // Server-side pixel tracking (Meta Conversions API & TikTok Events API)
    // This ensures tracking even if user doesn't reach success page or has ad blockers
    try {
      const userForTracking = await UserModel.findById(pgUserId);
      const subscriptionAmount = subscription.items.data[0].price.unit_amount / 100;

      await trackingService.trackPurchase({
        email: userForTracking?.email,
        userId: pgUserId,
        value: subscriptionAmount,
        currency: (subscription.currency || 'usd').toUpperCase(),
        planName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan`,
        subscriptionId: subscription.id,
        eventSourceUrl: `${process.env.BASE_URL || 'https://amplifycontent.ai'}/subscription/success`,
        // Additional parameters for improved Meta event match quality
        firstName: userForTracking?.first_name,
        lastName: userForTracking?.last_name
        // Note: ipAddress, userAgent, fbc, fbp would need to be captured during checkout
        // and stored with the session/user to be available here in the webhook context
      });

      logger.info('Server-side purchase tracking completed', {
        userId: pgUserId,
        tier,
        amount: subscriptionAmount
      });
    } catch (trackingError) {
      logger.error('Server-side purchase tracking error:', {
        error: trackingError.message,
        userId: pgUserId,
        tier
      });
      // Don't fail subscription creation if tracking fails
    }

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
    let userId = subscription.metadata?.user_id;
    const newTier = await this.getTierFromPrice(subscription.items.data[0].price.id);

    // Find existing subscription record
    const subscriptionRecord = await userSubscription.getByStripeId(subscription.id);

    if (!subscriptionRecord) {
      logger.error('Subscription record not found for update', {
        subscriptionId: subscription.id,
        userId
      });
      return { processed: false, reason: 'Subscription record not found' };
    }

    // Resolve user ID - fall back to looking up by Stripe customer ID if metadata is missing
    let pgUserId;
    if (userId) {
      pgUserId = await this.resolveUserId(userId);
    } else {
      // Look up user by Stripe customer ID (common when updates come from Customer Portal)
      logger.info('No user_id in subscription metadata, looking up by customer ID', {
        subscriptionId: subscription.id,
        customerId: subscription.customer
      });

      const user = await UserModel.findByStripeCustomerId(subscription.customer);
      if (!user) {
        // Also try from the subscription record
        if (subscriptionRecord.users_id) {
          pgUserId = subscriptionRecord.users_id;
          logger.info('Found user from subscription record', { pgUserId });
        } else {
          logger.error('Cannot find user for subscription update', {
            subscriptionId: subscription.id,
            customerId: subscription.customer
          });
          return { processed: false, reason: 'User not found' };
        }
      } else {
        pgUserId = user.id;
        userId = user.id; // Set for later use
        logger.info('Found user by Stripe customer ID', { pgUserId, customerId: subscription.customer });
      }
    }

    // Get user's current tier
    const user = await UserModel.findById(pgUserId);
    const oldTier = user.subscription_tier;

    // Detect plan change
    const tierChanged = oldTier !== newTier;
    const newPriceId = subscription.items.data[0].price.id;
    const priceChanged = subscriptionRecord.price_id !== newPriceId;

    // Always log tier comparison for debugging upgrade emails
    logger.info('Subscription update tier comparison', {
      subscriptionId: subscription.id,
      userId: pgUserId,
      oldTier,
      newTier,
      tierChanged,
      priceChanged,
      subscriptionRecordPriceId: subscriptionRecord.price_id,
      newPriceId
    });

    if (tierChanged) {
      logger.info('Plan change detected', {
        subscriptionId: subscription.id,
        userId,
        oldTier,
        newTier,
        changeType: this.getChangeType(oldTier, newTier)
      });

      // Create migration record
      await this.createPlanMigration(pgUserId, subscriptionRecord.id, oldTier, newTier, subscription);

      // Handle usage limits for the new tier
      await this.handleTierChangeUsage(pgUserId, subscriptionRecord.id, oldTier, newTier);
    }

    // Detect billing period change
    const subscriptionPlansService = require('./subscription-plans.service');
    const newPrice = await subscriptionPlansService.getPlanByStripePriceId(newPriceId);
    const oldPrice = subscriptionRecord.price_id ?
      await subscriptionPlansService.getPlanByStripePriceId(subscriptionRecord.price_id) : null;

    const periodChanged = oldPrice && newPrice && oldPrice.billing_period !== newPrice.billing_period;

    if (periodChanged) {
      logger.info('Billing period changed', {
        subscriptionId: subscription.id,
        userId,
        oldPeriod: oldPrice.billing_period,
        newPeriod: newPrice.billing_period,
        tier: newTier
      });

      // Record period change in migration table
      await this.createPlanMigration(
        pgUserId,
        subscriptionRecord.id,
        oldTier,
        newTier,
        subscription
      );

      // Handle period transition usage
      await this.handlePeriodTransition(pgUserId, subscriptionRecord.id, subscription, oldPrice, newPrice);
    }

    // Update subscription record
    const updatedPeriod = getSubscriptionPeriod(subscription);
    await userSubscription.updateSubscription(subscriptionRecord.id, {
      status: subscription.status,
      current_period_start: updatedPeriod.startDate,
      current_period_end: updatedPeriod.endDate,
      cancel_at_period_end: subscription.cancel_at_period_end,
      price_id: newPriceId
    });

    // Update user record
    await UserModel.updateUser(pgUserId, {
      subscription_tier: newTier,
      subscription_status: subscription.status
    });

    // Clear cached user data
    clearCachedUser(userId);
    forceTokenRefresh(pgUserId);

    // SEND UPGRADE EMAIL if tier changed to a higher tier
    if (tierChanged) {
      const changeType = this.getChangeType(oldTier, newTier);
      logger.info('Tier change email decision', {
        subscriptionId: subscription.id,
        userId: pgUserId,
        oldTier,
        newTier,
        changeType,
        willSendEmail: changeType === 'upgrade'
      });

      if (changeType === 'upgrade') {
        try {
          const userForEmail = await UserModel.findById(pgUserId);
          if (userForEmail && userForEmail.email) {
            const subscriptionPlansService = require('./subscription-plans.service');
            const newPlanData = await subscriptionPlansService.getPlanByKey(newTier);
            const newFeatures = newPlanData ? newPlanData.features : [];

            await emailService.sendSubscriptionUpgraded(userForEmail.email, {
              firstName: userForEmail.first_name || 'User',
              oldPlanName: oldTier.charAt(0).toUpperCase() + oldTier.slice(1),
              newPlanName: newTier.charAt(0).toUpperCase() + newTier.slice(1),
              newFeatures: newFeatures
            });

            logger.info('Upgrade email sent successfully', {
              userId: pgUserId,
              email: userForEmail.email,
              oldTier,
              newTier
            });
          }
        } catch (emailError) {
          logger.error('Failed to send subscription upgraded email', {
            error: emailError.message,
            userId: pgUserId,
            oldTier,
            newTier
          });
          // Don't fail webhook if email fails
        }
      } else {
        logger.info('No upgrade email sent - not an upgrade', {
          subscriptionId: subscription.id,
          userId: pgUserId,
          changeType
        });
      }
    } else {
      logger.info('No upgrade email sent - tier did not change', {
        subscriptionId: subscription.id,
        userId: pgUserId,
        currentTier: oldTier,
        incomingTier: newTier
      });
    }

    logger.info('Subscription updated:', {
      subscriptionId: subscription.id,
      userId,
      tier: newTier,
      status: subscription.status,
      tierChanged,
      priceChanged
    });

    return { processed: true, tierChanged, oldTier, newTier };
  }

  /**
   * Handle subscription deleted/canceled
   */
  async handleSubscriptionDeleted(subscription) {
    const userId = subscription.metadata?.user_id;

    // Update subscription record
    const subscriptionRecord = await userSubscription.getByStripeId(subscription.id);

    if (subscriptionRecord) {
      await userSubscription.updateSubscription(subscriptionRecord.id, {
        status: 'canceled'
      });
    }

    // Resolve user ID with fallback to Stripe customer ID or subscription record
    const pgUserId = await this.resolveUserIdWithFallback(userId, subscription.customer, subscriptionRecord);
    if (!pgUserId) {
      logger.error('Cannot find user for subscription delete', {
        subscriptionId: subscription.id,
        customerId: subscription.customer
      });
      return { processed: false, reason: 'User not found' };
    }
    await UserModel.updateUser(pgUserId, {
      subscription_tier: 'free',
      subscription_status: 'canceled'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    // SEND EMAIL
    try {
      const user = await UserModel.findById(pgUserId);
      if (user && user.email) {
        const tier = await this.getTierFromPrice(subscription.items.data[0]?.price?.id);
        const planName = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'subscription';
        const cancelPeriod = getSubscriptionPeriod(subscription);
        const endDate = cancelPeriod.endTimestamp.toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        });

        await emailService.sendSubscriptionCanceled(user.email, {
          firstName: user.first_name || 'User',
          planName: planName,
          endDate: endDate
        });
      }
    } catch (err) {
      logger.error('Failed to send subscription canceled email', err);
    }

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
    const userId = subscription.metadata?.user_id;

    // Update subscription record
    const subscriptionRecord = await userSubscription.getByStripeId(subscription.id);

    if (subscriptionRecord) {
      await userSubscription.updateSubscription(subscriptionRecord.id, {
        status: 'paused'
      });
    }

    // Resolve user ID with fallback to Stripe customer ID or subscription record
    const pgUserId = await this.resolveUserIdWithFallback(userId, subscription.customer, subscriptionRecord);
    if (!pgUserId) {
      logger.error('Cannot find user for subscription pause', {
        subscriptionId: subscription.id,
        customerId: subscription.customer
      });
      return { processed: false, reason: 'User not found' };
    }
    await UserModel.updateUser(pgUserId, {
      subscription_status: 'paused'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    // SEND EMAIL
    try {
      const user = await UserModel.findById(pgUserId);
      if (user && user.email) {
        const tier = await this.getTierFromPrice(subscription.items.data[0]?.price?.id);
        const planName = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'subscription';

        await emailService.sendSubscriptionPaused(user.email, {
          firstName: user.first_name || 'User',
          planName: planName
        });
      }
    } catch (err) {
      logger.error('Failed to send subscription paused email', err);
    }

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
    const userId = subscription.metadata?.user_id;
    const tier = await this.getTierFromPrice(subscription.items.data[0].price.id);

    // Update subscription record
    const subscriptionRecord = await userSubscription.getByStripeId(subscription.id);

    if (subscriptionRecord) {
      const renewPeriod = getSubscriptionPeriod(subscription);
      await userSubscription.updateSubscription(subscriptionRecord.id, {
        status: 'active',
        current_period_start: renewPeriod.startDate,
        current_period_end: renewPeriod.endDate
      });
    }

    // Resolve user ID with fallback to Stripe customer ID or subscription record
    const pgUserId = await this.resolveUserIdWithFallback(userId, subscription.customer, subscriptionRecord);
    if (!pgUserId) {
      logger.error('Cannot find user for subscription resume', {
        subscriptionId: subscription.id,
        customerId: subscription.customer
      });
      return { processed: false, reason: 'User not found' };
    }
    await UserModel.updateUser(pgUserId, {
      subscription_tier: tier,
      subscription_status: 'active'
    });

    // Force token refresh to update subscription info in JWT
    forceTokenRefresh(pgUserId);

    // SEND EMAIL
    try {
      const user = await UserModel.findById(pgUserId);
      if (user && user.email) {
        const planName = tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : 'subscription';

        await emailService.sendSubscriptionResumed(user.email, {
          firstName: user.first_name || 'User',
          planName: planName
        });
      }
    } catch (err) {
      logger.error('Failed to send subscription resumed email', err);
    }

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
      const tier = await this.getTierFromPrice(subscription.items.data[0].price.id);
      await this.createUsageRecord(userId, subscription, null, tier);

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
      await UserModel.updateUser(pgUserId, {
        subscription_status: 'past_due'
      });

      // Clear cached user data to force reload with new subscription info
      clearCachedUser(userId);

      // SEND EMAIL
      try {
        const user = await UserModel.findById(pgUserId);
        if (user && user.email) {
          await emailService.sendPaymentFailed(user.email, {
            amount: (invoice.amount_due / 100).toFixed(2),
            invoiceUrl: invoice.hosted_invoice_url
          });
        }
      } catch (err) {
        logger.error('Failed to send payment failed email', err);
      }

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
   * Handle invoice.payment_action_required
   * Triggered when payment requires additional user action (3D Secure, etc.)
   */
  async handlePaymentActionRequired(invoice) {
    const subscriptionId = invoice.subscription;

    if (subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const userId = subscription.metadata.user_id;
      const pgUserId = await this.resolveUserId(userId);

      // Update subscription status
      await UserModel.updateUser(pgUserId, {
        subscription_status: 'incomplete'
      });

      // SEND EMAIL
      try {
        const user = await UserModel.findById(pgUserId);
        if (user && user.email) {
          await emailService.sendPaymentActionRequired(user.email, {
            amount: (invoice.amount_due / 100).toFixed(2),
            invoiceUrl: invoice.hosted_invoice_url
          });
        }
      } catch (err) {
        logger.error('Failed to send payment action required email', err);
      }

      logger.warn('Payment action required:', {
        invoiceId: invoice.id,
        subscriptionId,
        userId,
        paymentIntentStatus: invoice.payment_intent?.status
      });
    }

    return { processed: true };
  }

  /**
   * Handle checkout.session.completed
   * Alternative to manual sync in getReceipt()
   */
  async handleCheckoutSessionCompleted(session) {
    const userId = session.metadata?.user_id || session.client_reference_id;

    if (!userId) {
      logger.warn('No user ID in checkout session metadata', {
        sessionId: session.id
      });
      return { processed: false, reason: 'No user ID' };
    }

    // Retrieve subscription from session
    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);

      // Ensure subscription has user_id in metadata (may be missing on retrieve)
      // The checkout session metadata is reliable, so inject it into subscription
      if (!subscription.metadata?.user_id && userId) {
        logger.info('Injecting user_id from checkout session into subscription metadata', {
          sessionId: session.id,
          subscriptionId: subscription.id,
          userId
        });
        subscription.metadata = subscription.metadata || {};
        subscription.metadata.user_id = userId;
      }

      // Process subscription (will be idempotent with customer.subscription.created)
      await this.handleSubscriptionCreated(subscription);

      logger.info('Processed checkout session', {
        sessionId: session.id,
        subscriptionId: subscription.id,
        userId
      });
    }

    return { processed: true };
  }

  /**
   * Handle customer.subscription.trial_ended
   * Triggered when trial ends and subscription converts to active (or cancels)
   */
  async handleTrialEnded(subscription) {
    const userId = subscription.metadata.user_id;
    const pgUserId = await this.resolveUserId(userId);

    // Update subscription record
    const subscriptionRecord = await userSubscription.getByStripeId(subscription.id);
    if (subscriptionRecord) {
      await userSubscription.updateSubscription(subscriptionRecord.id, {
        status: subscription.status,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
      });
    }

    // Update user status
    await UserModel.updateUser(pgUserId, {
      subscription_status: subscription.status
    });

    // Force token refresh
    forceTokenRefresh(pgUserId);

    // SEND EMAIL
    try {
      const user = await UserModel.findById(pgUserId);
      if (user && user.email) {
        await emailService.sendTrialEnded(user.email, {
          isActive: subscription.status === 'active',
          firstName: user.first_name || 'User'
        });
      }
    } catch (err) {
      logger.error('Failed to send trial ended email', err);
    }

    logger.info('Trial ended:', {
      subscriptionId: subscription.id,
      userId,
      newStatus: subscription.status
    });

    return { processed: true };
  }

  /**
   * Handle charge.succeeded
   * Record successful charges for analytics
   */
  async handleChargeSucceeded(charge) {
    logger.info('Charge succeeded:', {
      chargeId: charge.id,
      amount: charge.amount,
      currency: charge.currency,
      customerId: charge.customer
    });

    return { processed: true };
  }

  /**
   * Handle charge.failed
   * Alert on payment failures
   */
  async handleChargeFailed(charge) {
    logger.error('Charge failed:', {
      chargeId: charge.id,
      failureCode: charge.failure_code,
      failureMessage: charge.failure_message,
      customerId: charge.customer
    });

    return { processed: true };
  }

  /**
   * Handle charge.refunded
   * Process refunds and update subscription state
   */
  async handleChargeRefunded(charge) {
    logger.warn('Charge refunded:', {
      chargeId: charge.id,
      amount: charge.amount_refunded,
      customerId: charge.customer
    });

    return { processed: true };
  }

  /**
   * Handle customer.created
   */
  async handleCustomerCreated(customer) {
    logger.info('Customer created in Stripe:', {
      customerId: customer.id,
      email: customer.email
    });

    // Try to find user by email and update stripe_customer_id
    if (customer.email) {
      const user = await UserModel.findByEmail(customer.email);
      if (user && !user.stripe_customer_id) {
        await UserModel.updateUser(user.id, {
          stripe_customer_id: customer.id
        });
        logger.info('Linked Stripe customer to user', {
          userId: user.id,
          customerId: customer.id
        });
      }
    }

    return { processed: true };
  }

  /**
   * Handle customer.updated
   */
  async handleCustomerUpdated(customer) {
    logger.info('Customer updated in Stripe:', {
      customerId: customer.id
    });

    // Sync email changes, metadata updates, etc.
    const user = await UserModel.findByStripeCustomerId(customer.id);
    if (user) {
      // Update user record if email changed
      if (customer.email && customer.email !== user.email) {
        await UserModel.updateUser(user.id, {
          email: customer.email
        });
        logger.info('Synced email from Stripe customer', {
          userId: user.id,
          newEmail: customer.email
        });
      }
    }

    return { processed: true };
  }

  /**
   * Handle customer.deleted
   */
  async handleCustomerDeleted(customer) {
    logger.warn('Customer deleted in Stripe:', {
      customerId: customer.id
    });

    // Optionally mark user for review or soft-delete
    const user = await UserModel.findByStripeCustomerId(customer.id);
    if (user) {
      await UserModel.updateUser(user.id, {
        stripe_customer_id: null,
        subscription_status: 'deleted'
      });
      logger.warn('Removed Stripe customer ID from user', {
        userId: user.id
      });
    }

    return { processed: true };
  }

  /**
   * Determine if tier change is upgrade, downgrade, or crossgrade
   */
  getChangeType(oldTier, newTier) {
    const tierOrder = ['free', 'basic', 'premium', 'creator', 'enterprise'];
    const oldIndex = tierOrder.indexOf(oldTier);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex > oldIndex) return 'upgrade';
    if (newIndex < oldIndex) return 'downgrade';
    return 'crossgrade'; // Same level but different billing period
  }

  /**
   * Create plan migration record for analytics
   */
  async createPlanMigration(userId, subscriptionId, oldTier, newTier, subscription) {
    try {
      // Get plan IDs from database
      const subscriptionPlansService = require('./subscription-plans.service');
      const oldPlan = await subscriptionPlansService.getPlanByKey(oldTier);
      const newPlan = await subscriptionPlansService.getPlanByKey(newTier);

      const changeType = this.getChangeType(oldTier, newTier);

      await database.create('subscription_plan_migrations', {
        users_id: userId,
        user_subscriptions_id: subscriptionId,
        from_plan_id: oldPlan ? oldPlan.id : null,
        to_plan_id: newPlan ? newPlan.id : null,
        migration_type: changeType,
        migration_reason: 'user_initiated',
        effective_date: new Date(),
        is_prorated: true,
        stripe_subscription_id: subscription.id,
        status: 'completed',
        completed_at: new Date()
      });

      logger.info('Plan migration recorded', {
        userId,
        changeType,
        oldTier,
        newTier
      });
    } catch (error) {
      logger.error('Error creating plan migration record:', error);
      // Don't fail the webhook if migration tracking fails
    }
  }

  /**
   * Handle usage tracking when tier changes
   */
  async handleTierChangeUsage(userId, subscriptionId, oldTier, newTier) {
    try {
      const changeType = this.getChangeType(oldTier, newTier);

      // Get current usage
      const currentUsage = await subscriptionUsage.getCurrentBySubscriptionId(subscriptionId);

      if (!currentUsage) {
        logger.warn('No current usage record found during tier change', {
          userId,
          subscriptionId
        });
        return;
      }

      // Get new tier limits
      const subscriptionPlansService = require('./subscription-plans.service');
      const newPlanFeatures = await subscriptionPlansService.getPlanFeatures(newTier);

      if (!newPlanFeatures) {
        logger.error('Could not fetch new plan features', { newTier });
        return;
      }

      const newVideoLimit = newPlanFeatures.video_limit;

      if (changeType === 'upgrade') {
        // Upgrade: Increase usage limit immediately
        await subscriptionUsage.updateUsage(currentUsage.id, {
          usage_limit: newVideoLimit
        });

        logger.info('Usage limit increased on upgrade', {
          userId,
          oldLimit: currentUsage.usage_limit,
          newLimit: newVideoLimit,
          currentUsage: currentUsage.videos_processed
        });

      } else if (changeType === 'downgrade') {
        // Downgrade: Update limit but don't restrict current usage
        await subscriptionUsage.updateUsage(currentUsage.id, {
          usage_limit: newVideoLimit
        });

        // Check if user already exceeded new limit
        if (currentUsage.videos_processed > newVideoLimit) {
          logger.warn('User exceeded new limit after downgrade', {
            userId,
            currentUsage: currentUsage.videos_processed,
            newLimit: newVideoLimit
          });
        }

        logger.info('Usage limit decreased on downgrade', {
          userId,
          oldLimit: currentUsage.usage_limit,
          newLimit: newVideoLimit,
          currentUsage: currentUsage.videos_processed
        });
      }

    } catch (error) {
      logger.error('Error handling tier change usage:', {
        message: error.message,
        stack: error.stack,
        userId,
        subscriptionId,
        oldTier,
        newTier
      });
      // Don't fail webhook if usage update fails
    }
  }

  /**
   * Handle usage tracking when billing period changes
   */
  async handlePeriodTransition(userId, subscriptionId, subscription, oldPrice, newPrice) {
    try {
      const currentUsage = await subscriptionUsage.getCurrentBySubscriptionId(subscriptionId);

      if (!currentUsage) {
        logger.warn('No current usage record for period transition', {
          userId,
          subscriptionId
        });
        return;
      }

      // Calculate prorated usage allowance for period change
      const transitionPeriod = getSubscriptionPeriod(subscription);
      const oldPeriodStart = transitionPeriod.startTimestamp;
      const newPeriodEnd = transitionPeriod.endTimestamp;
      const now = new Date();

      const daysRemaining = Math.ceil((newPeriodEnd - now) / (1000 * 60 * 60 * 24));

      logger.info('Period transition calculated', {
        userId,
        oldPeriod: oldPrice.billing_period,
        newPeriod: newPrice.billing_period,
        daysRemaining,
        currentVideosProcessed: currentUsage.videos_processed
      });

      // Update usage record with new period dates
      await subscriptionUsage.updateUsage(currentUsage.id, {
        period_start: oldPeriodStart.toISOString().split('T')[0],
        period_end: newPeriodEnd.toISOString().split('T')[0]
      });

      logger.info('Updated usage period dates for billing period transition', {
        userId,
        subscriptionId,
        oldPeriod: oldPrice.billing_period,
        newPeriod: newPrice.billing_period
      });

      // Note: Usage counts carry over to new period
      // Only the period dates and limit change

    } catch (error) {
      logger.error('Error handling period transition:', error);
    }
  }

  /**
   * Create usage record for new billing period
   */
  async createUsageRecord(userId, subscription, subscriptionRecord = null, tier = null) {
    try {
      // If subscriptionRecord is not provided, find it
      if (!subscriptionRecord) {
        subscriptionRecord = await userSubscription.getByStripeId(subscription.id);
      }

      if (!subscriptionRecord) {
        logger.error('No subscription record found for usage creation:', {
          subscriptionId: subscription.id,
          userId
        });
        return;
      }

      // Check for existing usage record using the unique constraint: users_id and subscription_id
      const usagePeriod = getSubscriptionPeriod(subscription);
      const periodStart = usagePeriod.startDate;
      const periodEnd = usagePeriod.endDate;

      // Handle both database service formatted records (with .fields property) and direct PostgreSQL rows
      const subscriptionRecordId = subscriptionRecord.id || (subscriptionRecord.fields && subscriptionRecord.fields.id) || subscriptionRecord.id;

      const existingUsage = await subscriptionUsage.findByUserAndSubscription(
        parseInt(userId),
        parseInt(subscriptionRecordId)
      );

      if (existingUsage) {
        // Update existing usage record with new period dates if needed
        const existingUsageFields = existingUsage.fields || existingUsage;
        const currentPeriodStart = existingUsageFields.period_start;
        const currentPeriodEnd = existingUsageFields.period_end;

        if (currentPeriodStart !== periodStart || currentPeriodEnd !== periodEnd) {
          const usageRecordId = existingUsage.id || (existingUsage.fields && existingUsage.fields.id) || existingUsage.id;
          await subscriptionUsage.updateUsage(usageRecordId, {
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

      // Get limits from database subscription_plans table
      const subscriptionPlansService = require('./subscription-plans.service');
      const planData = await subscriptionPlansService.getPlanByKey(tier);

      if (!planData) {
        logger.error('Unknown tier for usage record creation:', { tier });
        throw new Error(`Unknown subscription tier: ${tier}`);
      }

      const usageLimit = planData.videoLimit; // Uses limit from database

      // Check if user has an existing usage record from current billing period (from old subscription/plan)
      // This handles plan upgrades/downgrades - we should carry over the usage count
      let videosProcessed = 0;
      let apiCallsMade = 0;
      let storageUsedMb = 0;
      let aiSummariesGenerated = 0;
      let analyticsViews = 0;

      const currentPeriodUsage = await subscriptionUsage.getCurrentByUserId(parseInt(userId));
      if (currentPeriodUsage) {
        // Carry over usage from current period when upgrading/downgrading
        videosProcessed = currentPeriodUsage.videos_processed || 0;
        apiCallsMade = currentPeriodUsage.api_calls_made || 0;
        storageUsedMb = currentPeriodUsage.storage_used_mb || 0;
        aiSummariesGenerated = currentPeriodUsage.ai_summaries_generated || 0;
        analyticsViews = currentPeriodUsage.analytics_views || 0;

        logger.info('Carrying over usage from current period:', {
          userId,
          videosProcessed,
          apiCallsMade,
          storageUsedMb,
          aiSummariesGenerated,
          analyticsViews
        });
      }

      const usageRecord = await subscriptionUsage.createUsage({
        user_id: parseInt(userId),
        user_subscriptions_id: parseInt(subscriptionRecordId), // Use the user_subscriptions record ID, not Stripe subscription ID
        period_start: periodStart,
        period_end: periodEnd,
        usage_limit: usageLimit,
        videos_processed: videosProcessed,
        api_calls_made: apiCallsMade,
        storage_used_mb: storageUsedMb,
        ai_summaries_generated: aiSummariesGenerated,
        analytics_views: analyticsViews
      });

      logger.info('Created usage record:', {
        usageId: usageRecord.id,
        userId,
        subscriptionRecordId: subscriptionRecordId,
        periodStart,
        periodEnd
      });
    } catch (error) {
      logger.error('Error creating record in subscription_usage:', {
        message: error.message,
        stack: error.stack,
        userId,
        subscriptionId: subscription?.id,
        tier
      });
    }
  }

  /**
   * Log webhook event for debugging
   */
  async logWebhookEvent(event) {
    try {
      const userId = event.data.object.metadata?.user_id ||
                    event.data.object.customer_details?.user_id;

      if (!userId) {
        logger.warn('Skipping subscription_events - user_id is blank', {
          eventId: event.id,
          eventType: event.type
        });
        return;
      }

      // Resolve to PostgreSQL ID
      let pgUserId = null;
      try {
        pgUserId = await this.resolveUserId(userId);
      } catch (error) {
        logger.error('Failed to resolve user ID for event logging', {
          eventId: event.id,
          userId,
          error: error.message
        });
        // Continue logging with null user_id for manual review
      }

      await subscriptionEvents.createEvent({
        stripe_event_id: event.id,
        user_id: pgUserId,
        event_type: event.type,
        stripe_subscription_id: event.data.object.id,
        event_data: JSON.stringify(event.data.object, null, 2),
        status: 'pending',
        processed_successfully: false
      });

      logger.info('Subscription event logged successfully:', {
        eventId: event.id,
        eventType: event.type,
        userId,
        pgUserId
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
      const event = await subscriptionEvents.findByStripeEventId(eventId);
      if (event) {
        await subscriptionEvents.updateEvent(event.id, {
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
  async getTierFromPrice(priceId) {
    const subscriptionPlansService = require('./subscription-plans.service');
    const tier = await subscriptionPlansService.getTierFromPrice(priceId);
    if (!tier) {
      logger.warn('Unknown price ID:', priceId);
      return 'basic'; // fallback
    }
    return tier;
  }

  /**
   * Get current subscription for user
   */
  async getUserSubscription(userId) {
    try {
      const activeSubscription = await userSubscription.getActiveByUserId(parseInt(userId));
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
    const user = await UserModel.findById(parseInt(userId));
    if (!user) return false;

    const subscriptionPlansService = require('./subscription-plans.service');
    const featureFlags = await subscriptionPlansService.getFeatureFlags(user.subscription_tier || 'free');

    if (!featureFlags) return false;

    switch (feature) {
    case 'analytics':
      return featureFlags.analyticsAccess;
    case 'api':
      return featureFlags.apiAccess;
    case 'unlimited_videos':
      return featureFlags.videoLimit === -1;
    default:
      return user.subscription_status === 'active';
    }
  }
}

module.exports = new StripeService();
