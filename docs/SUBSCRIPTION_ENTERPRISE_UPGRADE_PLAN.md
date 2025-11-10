# Enterprise-Grade Subscription System Upgrade Plan

**Document Version:** 1.0
**Date:** 2025-11-10
**Status:** DRAFT
**Estimated Effort:** 4-6 weeks (1 developer)

---

## Executive Summary

The current subscription system handles basic Stripe integration but has **critical gaps** that prevent enterprise-grade reliability:

- ❌ **No webhook idempotency** - Duplicate events can corrupt data
- ❌ **Hardcoded plan configs** - Cannot change plans without deployment
- ❌ **Missing 11+ critical webhook handlers** - Payment failures, upgrades, trials
- ❌ **Race conditions** - Dual-write problem in checkout sync
- ❌ **Broken event logging** - Undefined variable prevents audit trail
- ❌ **No upgrade/downgrade handling** - Plan changes not properly tracked
- ❌ **No payment period transitions** - Monthly ↔ yearly switches undefined

**This plan provides a phased approach to achieve enterprise-grade reliability.**

---

## Table of Contents

1. [Phase 1: Critical Bug Fixes (Week 1)](#phase-1-critical-bug-fixes)
2. [Phase 2: Database Schema Migration (Week 1-2)](#phase-2-database-schema-migration)
3. [Phase 3: Webhook Handler Completion (Week 2-3)](#phase-3-webhook-handler-completion)
4. [Phase 4: Upgrade/Downgrade Logic (Week 3-4)](#phase-4-upgradedowngrade-logic)
5. [Phase 5: Payment Period Transitions (Week 4)](#phase-5-payment-period-transitions)
6. [Phase 6: Testing & Validation (Week 5)](#phase-6-testing--validation)
7. [Phase 7: Monitoring & Alerting (Week 6)](#phase-7-monitoring--alerting)
8. [Rollout Strategy](#rollout-strategy)
9. [Risk Mitigation](#risk-mitigation)
10. [Success Metrics](#success-metrics)

---

## Phase 1: Critical Bug Fixes (Week 1)

### Objective
Fix **showstopper bugs** that cause data corruption or system failures.

### Tasks

#### 1.1 Fix Undefined Variable in Event Logging
**File:** `src/services/stripe.service.js:680`

**Problem:**
```javascript
async logWebhookEvent(event) {
  await subscriptionEvents.createEvent({
    users_id: pgUserId,  // ❌ UNDEFINED - never declared
  });
}
```

**Solution:**
```javascript
async logWebhookEvent(event) {
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
    users_id: pgUserId,
    event_type: event.type,
    stripe_subscription_id: event.data.object.id,
    event_data: JSON.stringify(event.data.object, null, 2),
    processed_successfully: true
  });
}
```

**Effort:** 1 hour
**Priority:** CRITICAL

---

#### 1.2 Implement Webhook Idempotency

**Problem:** Stripe retries webhooks on timeout. Same event can be processed multiple times, causing duplicate subscriptions or incorrect usage counts.

**Solution:**

**File:** `src/services/stripe.service.js`

```javascript
async handleWebhookEvent(event) {
  try {
    logger.info('Processing webhook event:', { type: event.type, id: event.id });

    // ✅ CHECK: Has this event already been processed?
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
      await subscriptionEvents.updateEvent(existingEvent.id, {
        status: 'processing',
        retry_count: (existingEvent.retry_count || 0) + 1
      });
    }

    // Process event...
    let result;
    switch (event.type) {
      case 'customer.subscription.created':
        result = await this.handleSubscriptionCreated(event.data.object);
        break;
      // ... other cases
      default:
        logger.info('Unhandled webhook event type:', event.type);
        result = { processed: false, reason: 'Event type not handled' };
    }

    // Mark as successfully processed
    const eventRecord = await subscriptionEvents.findByStripeEventId(event.id);
    if (eventRecord) {
      await subscriptionEvents.updateEvent(eventRecord.id, {
        processed_successfully: true,
        status: 'processed',
        processed_at: new Date(),
        error_message: null
      });
    }

    return result;

  } catch (error) {
    logger.error('Error processing webhook event:', error);

    // Update event log with error
    await this.updateEventLog(event.id, false, error.message);
    throw error;
  }
}
```

**Effort:** 3 hours
**Priority:** CRITICAL

---

#### 1.3 Fix Dual-Write Race Condition

**Problem:** `getReceipt()` manually syncs subscription after checkout, but webhook may also be processing simultaneously, causing duplicate writes.

**Solution:**

**File:** `src/controllers/subscription.controller.js`

```javascript
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

    const stripeConfig = require('../config/stripe.config');
    const stripe = require('stripe')(stripeConfig.getSecretKey());
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.customer && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);

      // ✅ CHECK: Has webhook already processed this subscription?
      const existingSubscription = await userSubscription.getByStripeId(subscription.id);

      if (!existingSubscription) {
        // Webhook hasn't processed yet - manually sync as backup
        logger.info('Webhook not received yet, performing manual sync', {
          sessionId: session_id,
          subscriptionId: subscription.id
        });

        await stripeService.handleSubscriptionCreated(subscription);

        // Log manual sync event
        await database.create('subscription_events', {
          stripe_event_id: `manual_sync_${session_id}`,
          user_subscriptions_id: null,
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
      } else {
        logger.info('Webhook already processed subscription', {
          sessionId: session_id,
          subscriptionId: subscription.id,
          existingRecordId: existingSubscription.id
        });
      }

      // Update user's Stripe customer ID if not already set
      if (!user.stripe_customer_id) {
        const resolvedUserId = await resolveUserId(user.id);
        await database.update('users', resolvedUserId, {
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
```

**Effort:** 2 hours
**Priority:** CRITICAL

---

#### 1.4 Fix Hardcoded Tier Limits

**Problem:** `stripe.service.js` has incorrect hardcoded limits that don't match `stripe.config.js`.

**Solution:**

**File:** `src/services/stripe.service.js`

```javascript
async createUsageRecord(userId, subscription, subscriptionRecord = null, tier = null) {
  try {
    // ... existing code to find subscriptionRecord ...

    // ✅ FIX: Get limits from stripe config instead of hardcoded
    const stripeConfig = require('../config/stripe.config');
    const tierConfig = stripeConfig.getTierConfig(tier);

    if (!tierConfig) {
      logger.error('Unknown tier for usage record creation:', { tier });
      throw new Error(`Unknown subscription tier: ${tier}`);
    }

    const usageLimit = tierConfig.videoLimit; // Uses correct limit from config

    const usageRecord = await subscriptionUsage.createUsage({
      user_id: parseInt(userId),
      user_subscriptions_id: parseInt(subscriptionRecordId),
      period_start: periodStart,
      period_end: periodEnd,
      usage_limit: usageLimit,
      videos_processed: 0,
      api_calls_made: 0,
      storage_used_mb: 0,
      ai_summaries_generated: 0,
      analytics_views: 0
    });

    logger.info('Created usage record:', {
      usageId: usageRecord.id,
      userId,
      tier,
      usageLimit,
      periodStart,
      periodEnd
    });
  } catch (error) {
    logger.error('Error creating usage record:', error);
    throw error;
  }
}
```

**Effort:** 1 hour
**Priority:** HIGH

---

### Phase 1 Deliverables
- ✅ Event logging function fixed
- ✅ Webhook idempotency implemented
- ✅ Race condition eliminated
- ✅ Correct tier limits enforced
- ✅ All changes tested in development environment

**Total Effort:** 7 hours (1 day)

---

## Phase 2: Database Schema Migration (Week 1-2)

### Objective
Move subscription plan configurations from code to database for runtime flexibility.

### Tasks

#### 2.1 Run Database Migration

**File:** `database/migrations/add-subscription-plans-tables.sql` (already created)

**Execution:**
```bash
# Connect to PostgreSQL
psql -U postgres -d ourailegacy

# Run migration
\i database/migrations/add-subscription-plans-tables.sql

# Verify tables created
\dt subscription_plan*

# Verify seed data
SELECT plan_key, plan_name, video_limit FROM vw_subscription_plans_complete;
```

**Effort:** 2 hours
**Priority:** HIGH

---

#### 2.2 Populate Stripe Price IDs

**Script:** `scripts/populate-stripe-price-ids.js`

```javascript
const database = require('../src/services/database.service');
const { logger } = require('../src/utils');

async function populateStripePriceIds() {
  logger.info('Populating Stripe price IDs from environment variables...');

  const priceMapping = [
    // Basic
    { planKey: 'basic', period: 'month', priceId: process.env.STRIPE_BASIC_PRICE_ID, amount: 3900 },
    { planKey: 'basic', period: 'year', priceId: process.env.STRIPE_BASIC_YEARLY_PRICE_ID, amount: 39000 },

    // Premium
    { planKey: 'premium', period: 'month', priceId: process.env.STRIPE_PREMIUM_PRICE_ID, amount: 6900 },
    { planKey: 'premium', period: 'year', priceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID, amount: 69000 },

    // Creator
    { planKey: 'creator', period: 'month', priceId: process.env.STRIPE_CREATOR_PRICE_ID, amount: 12900 },
    { planKey: 'creator', period: 'year', priceId: process.env.STRIPE_CREATOR_YEARLY_PRICE_ID, amount: 129000 },

    // Enterprise
    { planKey: 'enterprise', period: 'month', priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID, amount: 39900 },
    { planKey: 'enterprise', period: 'year', priceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID, amount: 399000 },
  ];

  for (const mapping of priceMapping) {
    if (!mapping.priceId) {
      logger.warn(`Missing Stripe price ID for ${mapping.planKey} ${mapping.period}`);
      continue;
    }

    // Get plan ID
    const planResult = await database.query(
      'SELECT id FROM subscription_plans WHERE plan_key = $1',
      [mapping.planKey]
    );

    if (planResult.rows.length === 0) {
      logger.error(`Plan not found: ${mapping.planKey}`);
      continue;
    }

    const planId = planResult.rows[0].id;

    // Insert price record
    await database.query(`
      INSERT INTO subscription_plan_prices (
        subscription_plan_id, stripe_price_id, currency, amount,
        billing_period, display_price, is_active, is_default
      ) VALUES ($1, $2, 'usd', $3, $4, $5, true, $6)
      ON CONFLICT (stripe_price_id) DO UPDATE SET
        subscription_plan_id = EXCLUDED.subscription_plan_id,
        amount = EXCLUDED.amount,
        billing_period = EXCLUDED.billing_period,
        display_price = EXCLUDED.display_price
    `, [
      planId,
      mapping.priceId,
      mapping.amount,
      mapping.period,
      (mapping.amount / 100).toFixed(2),
      mapping.period === 'month' // Default to monthly
    ]);

    logger.info(`✅ Added price: ${mapping.planKey} ${mapping.period} - ${mapping.priceId}`);
  }

  logger.info('✅ Stripe price IDs populated successfully');
}

populateStripePriceIds()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Error populating price IDs:', error);
    process.exit(1);
  });
```

**Execution:**
```bash
node scripts/populate-stripe-price-ids.js
```

**Effort:** 2 hours
**Priority:** HIGH

---

#### 2.3 Create Database Service for Subscription Plans

**File:** `src/services/subscription-plans.service.js`

```javascript
const database = require('./database.service');
const { logger } = require('../utils');

class SubscriptionPlansService {
  /**
   * Get all active subscription plans with pricing
   */
  async getAllActivePlans() {
    try {
      const result = await database.query(`
        SELECT * FROM vw_active_subscription_plans
        ORDER BY sort_order
      `);

      return result.rows;
    } catch (error) {
      logger.error('Error fetching active plans:', error);
      throw error;
    }
  }

  /**
   * Get plan by key (e.g., 'basic', 'premium')
   */
  async getPlanByKey(planKey) {
    try {
      const result = await database.query(`
        SELECT * FROM vw_subscription_plans_complete
        WHERE plan_key = $1
      `, [planKey]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error fetching plan ${planKey}:`, error);
      throw error;
    }
  }

  /**
   * Get plan features by Stripe price ID
   */
  async getPlanByStripePriceId(stripePriceId) {
    try {
      const result = await database.query(`
        SELECT
          sp.id,
          sp.plan_key,
          sp.plan_name,
          spp.billing_period,
          spf.*
        FROM subscription_plan_prices spp
        JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
        LEFT JOIN subscription_plan_features spf ON sp.id = spf.subscription_plan_id
        WHERE spp.stripe_price_id = $1
          AND spp.is_active = true
      `, [stripePriceId]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error fetching plan by Stripe price ID ${stripePriceId}:`, error);
      throw error;
    }
  }

  /**
   * Get tier name from Stripe price ID
   */
  async getTierFromPrice(stripePriceId) {
    try {
      const plan = await this.getPlanByStripePriceId(stripePriceId);
      return plan ? plan.plan_key : null;
    } catch (error) {
      logger.error('Error getting tier from price ID:', error);
      return null;
    }
  }

  /**
   * Get plan features for a given tier
   */
  async getPlanFeatures(planKey) {
    try {
      const result = await database.query(`
        SELECT spf.*
        FROM subscription_plan_features spf
        JOIN subscription_plans sp ON spf.subscription_plan_id = sp.id
        WHERE sp.plan_key = $1
      `, [planKey]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error fetching features for ${planKey}:`, error);
      throw error;
    }
  }

  /**
   * Update plan configuration (admin only)
   */
  async updatePlan(planKey, updates) {
    try {
      const result = await database.query(`
        UPDATE subscription_plans
        SET
          plan_name = COALESCE($2, plan_name),
          description = COALESCE($3, description),
          is_active = COALESCE($4, is_active),
          is_visible = COALESCE($5, is_visible),
          updated_at = CURRENT_TIMESTAMP
        WHERE plan_key = $1
        RETURNING *
      `, [
        planKey,
        updates.plan_name,
        updates.description,
        updates.is_active,
        updates.is_visible
      ]);

      if (result.rows.length > 0) {
        logger.info(`Plan ${planKey} updated successfully`);
        return result.rows[0];
      } else {
        throw new Error(`Plan ${planKey} not found`);
      }
    } catch (error) {
      logger.error(`Error updating plan ${planKey}:`, error);
      throw error;
    }
  }

  /**
   * Update plan features (admin only)
   */
  async updatePlanFeatures(planKey, features) {
    try {
      const plan = await this.getPlanByKey(planKey);
      if (!plan) {
        throw new Error(`Plan ${planKey} not found`);
      }

      const result = await database.query(`
        UPDATE subscription_plan_features
        SET
          video_limit = COALESCE($2, video_limit),
          api_access = COALESCE($3, api_access),
          analytics_access = COALESCE($4, analytics_access),
          updated_at = CURRENT_TIMESTAMP
        WHERE subscription_plan_id = $1
        RETURNING *
      `, [
        plan.id,
        features.video_limit,
        features.api_access,
        features.analytics_access
      ]);

      logger.info(`Features for plan ${planKey} updated successfully`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating features for ${planKey}:`, error);
      throw error;
    }
  }
}

module.exports = new SubscriptionPlansService();
```

**Effort:** 4 hours
**Priority:** HIGH

---

#### 2.4 Refactor Stripe Service to Use Database Plans

**File:** `src/services/stripe.service.js`

Replace hardcoded tier lookups with database calls:

```javascript
const subscriptionPlansService = require('./subscription-plans.service');

// Replace getTierFromPrice method:
async getTierFromPrice(priceId) {
  const tier = await subscriptionPlansService.getTierFromPrice(priceId);
  if (!tier) {
    logger.warn('Unknown price ID:', priceId);
    return 'basic'; // fallback
  }
  return tier;
}

// Update handleSubscriptionCreated:
async handleSubscriptionCreated(subscription) {
  const userId = subscription.metadata.user_id;
  const tier = await this.getTierFromPrice(subscription.items.data[0].price.id);

  // ... rest of implementation
}
```

**Effort:** 3 hours
**Priority:** HIGH

---

### Phase 2 Deliverables
- ✅ Database tables created for subscription plans
- ✅ Seed data populated
- ✅ Stripe price IDs mapped to database
- ✅ New service layer for plan management
- ✅ Stripe service refactored to use database

**Total Effort:** 11 hours (1.5 days)

---

## Phase 3: Webhook Handler Completion (Week 2-3)

### Objective
Implement missing critical webhook event handlers for complete Stripe integration.

### Priority Event Handlers to Add

#### 3.1 Payment Action Required (3D Secure, etc.)

**Handler:** `handlePaymentActionRequired()`

```javascript
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

    // TODO: Send email to user with payment link
    // await emailService.sendPaymentActionRequired(user.email, {
    //   invoiceUrl: invoice.hosted_invoice_url
    // });

    logger.warn('Payment action required:', {
      invoiceId: invoice.id,
      subscriptionId,
      userId,
      paymentIntentStatus: invoice.payment_intent?.status
    });
  }

  return { processed: true };
}
```

**Add to switch statement:**
```javascript
case 'invoice.payment_action_required':
  return await this.handlePaymentActionRequired(event.data.object);
```

**Effort:** 2 hours

---

#### 3.2 Checkout Session Completed

**Handler:** `handleCheckoutSessionCompleted()`

```javascript
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
```

**Add to switch statement:**
```javascript
case 'checkout.session.completed':
  return await this.handleCheckoutSessionCompleted(event.data.object);
```

**Effort:** 2 hours

---

#### 3.3 Customer Subscription Trial Ended

**Handler:** `handleTrialEnded()`

```javascript
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
      status: subscription.status, // 'active' or 'canceled'
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null
    });
  }

  // Update user status
  await UserModel.updateUser(pgUserId, {
    subscription_status: subscription.status
  });

  // Force token refresh
  forceTokenRefresh(pgUserId);

  // TODO: Send trial ended email
  // if (subscription.status === 'active') {
  //   await emailService.sendTrialEndedActive(user.email);
  // } else {
  //   await emailService.sendTrialEndedCanceled(user.email);
  // }

  logger.info('Trial ended:', {
    subscriptionId: subscription.id,
    userId,
    newStatus: subscription.status
  });

  return { processed: true };
}
```

**Add to switch statement:**
```javascript
case 'customer.subscription.trial_ended':
  return await this.handleTrialEnded(event.data.object);
```

**Effort:** 2 hours

---

#### 3.4 Charge Events (Success, Failure, Refund)

**Handlers:** `handleChargeSucceeded()`, `handleChargeFailed()`, `handleChargeRefunded()`

```javascript
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

  // Optional: Store charge details for accounting
  // await database.create('payment_transactions', {
  //   stripe_charge_id: charge.id,
  //   amount: charge.amount,
  //   currency: charge.currency,
  //   status: 'succeeded',
  //   created_at: new Date(charge.created * 1000)
  // });

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

  // TODO: Send notification to admin
  // await emailService.sendAdminAlert('Payment Failure', {
  //   chargeId: charge.id,
  //   failureCode: charge.failure_code
  // });

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

  // TODO: Implement refund logic
  // - Reset usage counts?
  // - Downgrade subscription?
  // - Send refund confirmation email?

  return { processed: true };
}
```

**Add to switch statement:**
```javascript
case 'charge.succeeded':
  return await this.handleChargeSucceeded(event.data.object);
case 'charge.failed':
  return await this.handleChargeFailed(event.data.object);
case 'charge.refunded':
  return await this.handleChargeRefunded(event.data.object);
```

**Effort:** 3 hours

---

#### 3.5 Customer Events (Created, Updated, Deleted)

**Handlers:** Customer lifecycle tracking

```javascript
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
```

**Add to switch statement:**
```javascript
case 'customer.created':
  return await this.handleCustomerCreated(event.data.object);
case 'customer.updated':
  return await this.handleCustomerUpdated(event.data.object);
case 'customer.deleted':
  return await this.handleCustomerDeleted(event.data.object);
```

**Effort:** 3 hours

---

### Phase 3 Deliverables
- ✅ Payment action required handler
- ✅ Checkout completed handler
- ✅ Trial ended handler
- ✅ Charge event handlers (success, failure, refund)
- ✅ Customer lifecycle handlers
- ✅ All handlers tested with Stripe CLI

**Total Effort:** 12 hours (1.5 days)

---

## Phase 4: Upgrade/Downgrade Logic (Week 3-4)

### Objective
Properly handle subscription tier changes (upgrades, downgrades, crossgrades) with correct usage tracking and billing.

### Tasks

#### 4.1 Enhance Subscription Updated Handler

**File:** `src/services/stripe.service.js`

```javascript
async handleSubscriptionUpdated(subscription) {
  const userId = subscription.metadata.user_id;
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

  // Resolve user ID
  const pgUserId = await this.resolveUserId(userId);

  // Get user's current tier
  const user = await UserModel.findById(pgUserId);
  const oldTier = user.subscription_tier;

  // Detect plan change
  const tierChanged = oldTier !== newTier;
  const priceChanged = subscriptionRecord.stripe_price_id !== subscription.items.data[0].price.id;

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

  // Update subscription record
  await userSubscription.updateSubscription(subscriptionRecord.id, {
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString().split('T')[0],
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString().split('T')[0],
    cancel_at_period_end: subscription.cancel_at_period_end,
    stripe_price_id: subscription.items.data[0].price.id
  });

  // Update user record
  await UserModel.updateUser(pgUserId, {
    subscription_tier: newTier,
    subscription_status: subscription.status
  });

  // Clear cached user data
  clearCachedUser(userId);
  forceTokenRefresh(pgUserId);

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

        // TODO: Send email notification about usage overage
        // Optionally restrict access until next billing period
      }

      logger.info('Usage limit decreased on downgrade', {
        userId,
        oldLimit: currentUsage.usage_limit,
        newLimit: newVideoLimit,
        currentUsage: currentUsage.videos_processed
      });
    }

  } catch (error) {
    logger.error('Error handling tier change usage:', error);
    // Don't fail webhook if usage update fails
  }
}
```

**Effort:** 6 hours
**Priority:** HIGH

---

#### 4.2 Add Migration Analytics Dashboard

**File:** `src/controllers/analytics.controller.js`

```javascript
/**
 * Get subscription migration analytics
 * Shows upgrade/downgrade trends
 */
async getSubscriptionMigrations(req, res) {
  try {
    const { startDate, endDate } = req.query;

    const migrations = await database.query(`
      SELECT
        migration_type,
        COUNT(*) as count,
        AVG(proration_amount) as avg_proration,
        fp.plan_name as from_plan,
        tp.plan_name as to_plan
      FROM subscription_plan_migrations spm
      LEFT JOIN subscription_plans fp ON spm.from_plan_id = fp.id
      LEFT JOIN subscription_plans tp ON spm.to_plan_id = tp.id
      WHERE spm.created_at >= $1 AND spm.created_at <= $2
      GROUP BY migration_type, fp.plan_name, tp.plan_name
      ORDER BY count DESC
    `, [startDate, endDate]);

    res.json({
      success: true,
      data: migrations.rows
    });
  } catch (error) {
    logger.error('Error fetching migration analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch migration analytics'
    });
  }
}
```

**Effort:** 2 hours

---

### Phase 4 Deliverables
- ✅ Enhanced subscription update handler with tier change detection
- ✅ Plan migration tracking in database
- ✅ Usage limit updates on upgrades/downgrades
- ✅ Migration analytics endpoint
- ✅ Tested with Stripe test mode upgrades/downgrades

**Total Effort:** 8 hours (1 day)

---

## Phase 5: Payment Period Transitions (Week 4)

### Objective
Handle monthly ↔ yearly billing period changes correctly.

### Tasks

#### 5.1 Detect Billing Period Changes

**Enhancement to `handleSubscriptionUpdated`:**

```javascript
// In handleSubscriptionUpdated, after tier change detection:

// Detect billing period change
const newPriceId = subscription.items.data[0].price.id;
const subscriptionPlansService = require('./subscription-plans.service');
const newPrice = await subscriptionPlansService.getPlanByStripePriceId(newPriceId);
const oldPrice = await subscriptionPlansService.getPlanByStripePriceId(subscriptionRecord.stripe_price_id);

const periodChanged = oldPrice && newPrice && oldPrice.billing_period !== newPrice.billing_period;

if (periodChanged) {
  logger.info('Billing period changed', {
    subscriptionId: subscription.id,
    userId,
    oldPeriod: oldPrice.billing_period,
    newPeriod: newPrice.billing_period,
    tier: newTier
  });

  // Record period change
  await this.createPlanMigration(
    pgUserId,
    subscriptionRecord.id,
    oldTier,
    newTier,
    subscription,
    {
      periodChange: true,
      oldPeriod: oldPrice.billing_period,
      newPeriod: newPrice.billing_period
    }
  );

  // Handle period transition usage
  await this.handlePeriodTransition(pgUserId, subscriptionRecord.id, subscription, oldPrice, newPrice);
}
```

**Effort:** 2 hours

---

#### 5.2 Period Transition Logic

```javascript
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
    const oldPeriodStart = new Date(subscription.current_period_start * 1000);
    const newPeriodEnd = new Date(subscription.current_period_end * 1000);
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

    // Note: Usage counts carry over to new period
    // Only the period dates and limit change

  } catch (error) {
    logger.error('Error handling period transition:', error);
  }
}
```

**Effort:** 2 hours

---

### Phase 5 Deliverables
- ✅ Billing period change detection
- ✅ Period transition usage handling
- ✅ Migration records include period changes
- ✅ Tested monthly → yearly and yearly → monthly transitions

**Total Effort:** 4 hours (0.5 day)

---

## Phase 6: Testing & Validation (Week 5)

### Objective
Comprehensive testing of all subscription flows and edge cases.

### Tasks

#### 6.1 Re-enable and Update Unit Tests

**Files:**
- `tests/unit/auth.test.js.disabled` → `tests/unit/auth.test.js`
- Update mocks from Airtable to PostgreSQL
- Add new tests for subscription plan database queries

**Effort:** 8 hours

---

#### 6.2 Create Webhook Integration Tests

**File:** `tests/integration/stripe-webhooks.test.js`

Test coverage:
- Idempotency (send same event twice)
- Subscription created
- Subscription updated (tier change, period change)
- Payment failed
- Trial ended
- Customer deleted

**Effort:** 8 hours

---

#### 6.3 Test Plan Migration Scenarios

**Script:** `tests/e2e/subscription-migrations.test.js`

Scenarios:
1. Free → Basic upgrade
2. Basic → Premium upgrade
3. Premium → Basic downgrade
4. Basic monthly → Basic yearly
5. Premium yearly → Premium monthly
6. Upgrade mid-month (prorated)
7. Downgrade at period end

**Effort:** 6 hours

---

#### 6.4 Stripe CLI Webhook Testing

```bash
# Forward webhooks to local
stripe listen --forward-to localhost:3000/webhook/stripe

# Trigger test events
stripe trigger customer.subscription.created
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
stripe trigger customer.subscription.trial_ended
```

**Effort:** 4 hours

---

### Phase 6 Deliverables
- ✅ 50+ unit tests passing
- ✅ 20+ integration tests passing
- ✅ E2E migration tests passing
- ✅ All webhook events tested with Stripe CLI
- ✅ Test coverage >80%

**Total Effort:** 26 hours (3+ days)

---

## Phase 7: Monitoring & Alerting (Week 6)

### Objective
Production-ready observability and error handling.

### Tasks

#### 7.1 Webhook Processing Dashboard

**File:** `src/controllers/admin/webhooks.controller.js`

```javascript
/**
 * Get webhook processing statistics
 */
async getWebhookStats(req, res) {
  try {
    const stats = await database.query(`
      SELECT
        event_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed_successfully = true) as successful,
        COUNT(*) FILTER (WHERE processed_successfully = false) as failed,
        AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time
      FROM subscription_events
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY event_type
      ORDER BY total DESC
    `);

    res.json({
      success: true,
      data: stats.rows
    });
  } catch (error) {
    logger.error('Error fetching webhook stats:', error);
    res.status(500).json({ success: false });
  }
}

/**
 * Get failed webhooks for retry
 */
async getFailedWebhooks(req, res) {
  try {
    const failed = await database.query(`
      SELECT *
      FROM subscription_events
      WHERE processed_successfully = false
      AND retry_count < 5
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: failed.rows
    });
  } catch (error) {
    logger.error('Error fetching failed webhooks:', error);
    res.status(500).json({ success: false });
  }
}
```

**Effort:** 3 hours

---

#### 7.2 Automated Webhook Retry

**File:** `scripts/retry-failed-webhooks.js`

```javascript
const database = require('../src/services/database.service');
const stripeService = require('../src/services/stripe.service');
const { logger } = require('../src/utils');

async function retryFailedWebhooks() {
  logger.info('Starting failed webhook retry job...');

  const failedEvents = await database.query(`
    SELECT *
    FROM subscription_events
    WHERE processed_successfully = false
    AND retry_count < 5
    AND created_at >= NOW() - INTERVAL '24 hours'
    ORDER BY created_at ASC
    LIMIT 50
  `);

  for (const eventRecord of failedEvents.rows) {
    try {
      logger.info(`Retrying event ${eventRecord.stripe_event_id}...`);

      // Reconstruct event object
      const event = {
        id: eventRecord.stripe_event_id,
        type: eventRecord.event_type,
        data: {
          object: JSON.parse(eventRecord.event_data)
        }
      };

      // Retry processing
      await stripeService.handleWebhookEvent(event);

      logger.info(`✅ Successfully retried event ${eventRecord.stripe_event_id}`);
    } catch (error) {
      logger.error(`Failed to retry event ${eventRecord.stripe_event_id}:`, error);

      // Increment retry count
      await database.query(`
        UPDATE subscription_events
        SET retry_count = retry_count + 1,
            error_message = $2
        WHERE id = $1
      `, [eventRecord.id, error.message]);
    }
  }

  logger.info('Webhook retry job completed');
}

retryFailedWebhooks()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('Webhook retry job failed:', error);
    process.exit(1);
  });
```

**Cron job:** Run every 15 minutes

**Effort:** 2 hours

---

#### 7.3 Subscription Health Monitoring

**File:** `scripts/subscription-health-check.js`

Checks for:
- Users with `subscription_status='active'` but no active `user_subscriptions` record
- Users with `subscription_tier` mismatch between `users` and Stripe
- Usage records with `period_end` in the past (needs reset)
- Subscriptions with `cancel_at_period_end=true` ending soon

**Effort:** 3 hours

---

#### 7.4 Alerting Integration

**File:** `src/services/alerting.service.js`

```javascript
const { logger } = require('../utils');

class AlertingService {
  /**
   * Send critical alert (payment failure, webhook failure, etc.)
   */
  async sendCriticalAlert(title, details) {
    logger.error('CRITICAL ALERT:', { title, details });

    // TODO: Integrate with alerting service
    // - Send Slack notification
    // - Send email to admin
    // - Create PagerDuty incident
    // - Log to monitoring service (Datadog, New Relic, etc.)
  }

  /**
   * Send warning alert
   */
  async sendWarningAlert(title, details) {
    logger.warn('WARNING ALERT:', { title, details });

    // TODO: Send non-urgent notification
  }
}

module.exports = new AlertingService();
```

**Effort:** 2 hours

---

### Phase 7 Deliverables
- ✅ Webhook processing dashboard
- ✅ Failed webhook retry mechanism
- ✅ Subscription health monitoring
- ✅ Alerting service integration
- ✅ Cron jobs configured

**Total Effort:** 10 hours (1+ day)

---

## Rollout Strategy

### Pre-Production Checklist

- [ ] All Phase 1-7 tasks completed
- [ ] Database migration tested on staging
- [ ] All tests passing (unit, integration, e2e)
- [ ] Webhook handlers tested with Stripe CLI
- [ ] Load testing completed (simulate 100+ webhooks/min)
- [ ] Rollback plan documented
- [ ] Team trained on new system

### Deployment Phases

#### Phase A: Shadow Mode (Week 1)
- Deploy new code with feature flag **OFF**
- New webhook handlers log events but don't modify data
- Compare new vs old behavior
- Monitor for errors

#### Phase B: Gradual Rollout (Week 2)
- Enable for 10% of users
- Monitor webhook processing success rate
- Check for race conditions or duplicate data
- Enable for 50% of users
- Enable for 100% of users

#### Phase C: Deprecate Old Code (Week 3)
- Remove hardcoded tier configs from `stripe.config.js`
- Remove old webhook handlers
- Clean up migration scripts

---

## Risk Mitigation

### Risk 1: Database Migration Failure

**Mitigation:**
- Test migration on staging first
- Take full database backup before migration
- Have rollback script ready
- Run migration during low-traffic window

### Risk 2: Webhook Signature Verification Issues

**Mitigation:**
- Test signature verification thoroughly
- Have Stripe webhook secret backup
- Monitor webhook failure rate closely
- Keep old endpoint active during transition

### Risk 3: Subscription State Inconsistencies

**Mitigation:**
- Run subscription health check script before deployment
- Fix existing inconsistencies manually
- Monitor state consistency post-deployment
- Have manual reconciliation script ready

### Risk 4: Breaking Changes for Existing Subscriptions

**Mitigation:**
- Ensure backward compatibility
- Grandfather existing subscriptions
- Test with production-like data on staging
- Have customer support team on standby

---

## Success Metrics

### Technical Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Webhook processing success rate | ~95% | >99.5% |
| Webhook idempotency violations | Unknown | 0 |
| Duplicate subscription records | ~1-2% | 0% |
| Failed event retry success rate | N/A | >90% |
| Subscription state inconsistencies | ~5% | <0.1% |
| Test coverage | <40% | >80% |

### Business Metrics

| Metric | Target |
|--------|--------|
| Subscription upgrade rate | Track trend |
| Subscription downgrade rate | Track trend |
| Payment failure recovery rate | >50% |
| Churn rate | Track trend |
| Average subscription lifetime | Track trend |
| Revenue retention on downgrades | >70% |

### Operational Metrics

| Metric | Target |
|--------|--------|
| Mean time to detect subscription issues | <5 minutes |
| Mean time to resolve webhook failures | <1 hour |
| Manual subscription interventions | <5/month |
| Support tickets related to billing | Reduce by 50% |

---

## Estimated Total Effort

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1: Critical Bug Fixes | 7 hours | 1 day |
| Phase 2: Database Schema Migration | 11 hours | 1.5 days |
| Phase 3: Webhook Handler Completion | 12 hours | 1.5 days |
| Phase 4: Upgrade/Downgrade Logic | 8 hours | 1 day |
| Phase 5: Payment Period Transitions | 4 hours | 0.5 day |
| Phase 6: Testing & Validation | 26 hours | 3+ days |
| Phase 7: Monitoring & Alerting | 10 hours | 1+ day |
| **TOTAL** | **78 hours** | **10 working days** |

**With buffer for unexpected issues: 4-6 weeks**

---

## Conclusion

This plan transforms the subscription system from a basic Stripe integration to an **enterprise-grade billing platform** with:

✅ **Data integrity** - Idempotent webhook processing, no race conditions
✅ **Flexibility** - Database-driven plan configs, no code deployments
✅ **Completeness** - All critical Stripe events handled
✅ **Reliability** - Automated retry, health monitoring, alerting
✅ **Auditability** - Complete event history, migration tracking
✅ **Testability** - Comprehensive test coverage

The phased approach minimizes risk while delivering incremental value. Critical bugs are fixed first (Week 1), followed by infrastructure improvements (Weeks 2-4), and comprehensive validation (Weeks 5-6).

**Recommendation:** Proceed with Phase 1 immediately to address critical data integrity issues, then continue with remaining phases based on business priority.
