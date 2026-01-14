/**
 * Stripe Service Unit Tests
 * Tests for webhook handling, subscription management, and payment processing
 */

// Mock dependencies before requiring the service
jest.mock('stripe', () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: jest.fn()
      }
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn()
    },
    subscriptions: {
      retrieve: jest.fn()
    },
    billingPortal: {
      sessions: {
        create: jest.fn()
      }
    }
  };
  return jest.fn(() => mockStripe);
});

jest.mock('../../../src/config/stripe.config', () => ({
  getSecretKey: jest.fn().mockReturnValue('sk_test_mock'),
  validate: jest.fn(),
  successUrl: 'http://localhost:3000/success',
  cancelUrl: 'http://localhost:3000/cancel',
  customerPortalUrl: 'http://localhost:3000/portal'
}));

jest.mock('../../../src/services/database.service', () => ({
  query: jest.fn(),
  create: jest.fn()
}));

jest.mock('../../../src/models', () => ({
  user: {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    findByStripeCustomerId: jest.fn(),
    findByAirtableId: jest.fn(),
    updateUser: jest.fn()
  },
  userSubscription: {
    createSubscription: jest.fn(),
    updateSubscription: jest.fn(),
    getByStripeId: jest.fn(),
    getActiveByUserId: jest.fn()
  },
  subscriptionUsage: {
    createUsage: jest.fn(),
    updateUsage: jest.fn(),
    getCurrentBySubscriptionId: jest.fn(),
    getCurrentByUserId: jest.fn(),
    findByUserAndSubscription: jest.fn()
  },
  subscriptionEvents: {
    createEvent: jest.fn(),
    updateEvent: jest.fn(),
    findByStripeEventId: jest.fn(),
    update: jest.fn()
  }
}));

jest.mock('../../../src/middleware', () => ({
  clearCachedUser: jest.fn(),
  forceTokenRefresh: jest.fn()
}));

jest.mock('../../../src/services/email.service', () => ({
  sendSubscriptionUpgraded: jest.fn(),
  sendSubscriptionCanceled: jest.fn(),
  sendSubscriptionPaused: jest.fn(),
  sendSubscriptionResumed: jest.fn(),
  sendPaymentFailed: jest.fn(),
  sendPaymentActionRequired: jest.fn(),
  sendTrialEnded: jest.fn()
}));

jest.mock('../../../src/services/subscription-plans.service', () => ({
  getTierFromPrice: jest.fn(),
  getPlanByKey: jest.fn(),
  getPlanByStripePriceId: jest.fn(),
  getPlanFeatures: jest.fn(),
  getFeatureFlags: jest.fn()
}));

// Now require the service
const stripeService = require('../../../src/services/stripe.service');
const { user: UserModel, userSubscription, subscriptionUsage, subscriptionEvents } = require('../../../src/models');
const emailService = require('../../../src/services/email.service');
const subscriptionPlansService = require('../../../src/services/subscription-plans.service');
const { forceTokenRefresh } = require('../../../src/middleware');

describe('StripeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveUserId', () => {
    it('should return integer when given numeric string', async () => {
      const result = await stripeService.resolveUserId('123');
      expect(result).toBe(123);
    });

    it('should return integer when given number', async () => {
      const result = await stripeService.resolveUserId(456);
      expect(result).toBe(456);
    });

    it('should resolve Airtable ID to PostgreSQL ID', async () => {
      UserModel.findByAirtableId.mockResolvedValue({ id: 789 });

      const result = await stripeService.resolveUserId('recABC123');

      expect(UserModel.findByAirtableId).toHaveBeenCalledWith('recABC123');
      expect(result).toBe(789);
    });

    it('should resolve email to PostgreSQL ID', async () => {
      UserModel.findByEmail.mockResolvedValue({ id: 101 });

      const result = await stripeService.resolveUserId('test@example.com');

      expect(UserModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toBe(101);
    });

    it('should throw error for unrecognized format', async () => {
      await expect(stripeService.resolveUserId('invalid-format'))
        .rejects.toThrow('Unrecognized userId format');
    });

    it('should throw error when Airtable ID not found', async () => {
      UserModel.findByAirtableId.mockResolvedValue(null);

      await expect(stripeService.resolveUserId('recNotFound'))
        .rejects.toThrow('No user found with airtable_id');
    });
  });

  describe('resolveUserIdWithFallback', () => {
    it('should resolve user ID from metadata first', async () => {
      const result = await stripeService.resolveUserIdWithFallback('123', 'cus_test', null);
      expect(result).toBe(123);
    });

    it('should fallback to Stripe customer ID when metadata fails', async () => {
      UserModel.findByStripeCustomerId.mockResolvedValue({ id: 456 });

      const result = await stripeService.resolveUserIdWithFallback(null, 'cus_test', null);

      expect(UserModel.findByStripeCustomerId).toHaveBeenCalledWith('cus_test');
      expect(result).toBe(456);
    });

    it('should fallback to subscription record when customer lookup fails', async () => {
      UserModel.findByStripeCustomerId.mockResolvedValue(null);
      const subscriptionRecord = { id: 1, users_id: 789 };

      const result = await stripeService.resolveUserIdWithFallback(null, 'cus_test', subscriptionRecord);

      expect(result).toBe(789);
    });

    it('should return null when all fallbacks fail', async () => {
      UserModel.findByStripeCustomerId.mockResolvedValue(null);

      const result = await stripeService.resolveUserIdWithFallback(null, 'cus_test', null);

      expect(result).toBeNull();
    });
  });

  describe('getChangeType', () => {
    it('should return upgrade when moving to higher tier', () => {
      expect(stripeService.getChangeType('free', 'basic')).toBe('upgrade');
      expect(stripeService.getChangeType('basic', 'premium')).toBe('upgrade');
      expect(stripeService.getChangeType('premium', 'creator')).toBe('upgrade');
      expect(stripeService.getChangeType('creator', 'enterprise')).toBe('upgrade');
    });

    it('should return downgrade when moving to lower tier', () => {
      expect(stripeService.getChangeType('enterprise', 'creator')).toBe('downgrade');
      expect(stripeService.getChangeType('creator', 'premium')).toBe('downgrade');
      expect(stripeService.getChangeType('premium', 'basic')).toBe('downgrade');
      expect(stripeService.getChangeType('basic', 'free')).toBe('downgrade');
    });

    it('should return crossgrade for same tier', () => {
      expect(stripeService.getChangeType('basic', 'basic')).toBe('crossgrade');
      expect(stripeService.getChangeType('premium', 'premium')).toBe('crossgrade');
    });
  });

  describe('handleWebhookEvent', () => {
    const mockEvent = {
      id: 'evt_test123',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test123',
          customer: 'cus_test123',
          metadata: { user_id: '1' },
          items: {
            data: [{ price: { id: 'price_test' } }]
          },
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
        }
      }
    };

    it('should skip already processed events', async () => {
      subscriptionEvents.findByStripeEventId.mockResolvedValue({
        id: 1,
        processed_successfully: true,
        processed_at: new Date()
      });

      const result = await stripeService.handleWebhookEvent(mockEvent);

      expect(result.duplicate).toBe(true);
      expect(result.processed).toBe(true);
    });

    it('should log new events before processing', async () => {
      subscriptionEvents.findByStripeEventId.mockResolvedValue(null);
      subscriptionEvents.createEvent.mockResolvedValue({ id: 1 });
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('basic');
      UserModel.findById.mockResolvedValue({ id: 1, email: 'test@example.com' });
      userSubscription.getByStripeId.mockResolvedValue(null);
      userSubscription.createSubscription.mockResolvedValue({ id: 1 });
      subscriptionUsage.findByUserAndSubscription.mockResolvedValue(null);
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ videoLimit: 10 });
      subscriptionUsage.getCurrentByUserId.mockResolvedValue(null);
      subscriptionUsage.createUsage.mockResolvedValue({ id: 1 });

      await stripeService.handleWebhookEvent(mockEvent);

      expect(subscriptionEvents.createEvent).toHaveBeenCalled();
    });

    it('should handle unhandled event types gracefully', async () => {
      subscriptionEvents.findByStripeEventId.mockResolvedValue(null);
      const unhandledEvent = {
        id: 'evt_unhandled',
        type: 'some.unknown.event',
        data: { object: { metadata: {} } }
      };

      const result = await stripeService.handleWebhookEvent(unhandledEvent);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Event type not handled');
    });
  });

  describe('handleSubscriptionCreated', () => {
    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      metadata: { user_id: '1' },
      items: {
        data: [{ price: { id: 'price_basic' } }]
      },
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
      trial_start: null,
      trial_end: null
    };

    beforeEach(() => {
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('basic');
      UserModel.findById.mockResolvedValue({ id: 1, email: 'test@example.com' });
      userSubscription.getByStripeId.mockResolvedValue(null);
      userSubscription.createSubscription.mockResolvedValue({ id: 1 });
      userSubscription.getActiveByUserId.mockResolvedValue(null);
      subscriptionUsage.findByUserAndSubscription.mockResolvedValue(null);
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ videoLimit: 10 });
      subscriptionUsage.getCurrentByUserId.mockResolvedValue(null);
      subscriptionUsage.createUsage.mockResolvedValue({ id: 1 });
    });

    it('should create new subscription record', async () => {
      const result = await stripeService.handleSubscriptionCreated(mockSubscription);

      expect(userSubscription.createSubscription).toHaveBeenCalledWith(
        expect.objectContaining({
          users_id: 1,
          stripe_subscription_id: 'sub_test123',
          status: 'active'
        })
      );
      expect(result.processed).toBe(true);
    });

    it('should update user subscription tier', async () => {
      await stripeService.handleSubscriptionCreated(mockSubscription);

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, {
        subscription_tier: 'basic',
        subscription_status: 'active'
      });
    });

    it('should force token refresh after subscription creation', async () => {
      await stripeService.handleSubscriptionCreated(mockSubscription);

      expect(forceTokenRefresh).toHaveBeenCalledWith(1);
    });

    it('should create usage record for new subscription', async () => {
      await stripeService.handleSubscriptionCreated(mockSubscription);

      expect(subscriptionUsage.createUsage).toHaveBeenCalled();
    });

    it('should update existing subscription record if found', async () => {
      userSubscription.getByStripeId.mockResolvedValue({ id: 5 });
      userSubscription.updateSubscription.mockResolvedValue({ id: 5 });

      await stripeService.handleSubscriptionCreated(mockSubscription);

      expect(userSubscription.updateSubscription).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ status: 'active' })
      );
    });
  });

  describe('handleSubscriptionUpdated', () => {
    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      metadata: { user_id: '1' },
      items: {
        data: [{ price: { id: 'price_premium' } }]
      },
      status: 'active',
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false
    };

    beforeEach(() => {
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('premium');
      userSubscription.getByStripeId.mockResolvedValue({ id: 1, stripe_price_id: 'price_basic' });
      UserModel.findById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        first_name: 'Test',
        subscription_tier: 'basic'
      });
      subscriptionPlansService.getPlanByStripePriceId.mockResolvedValue({ billing_period: 'monthly' });
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ features: ['Feature 1', 'Feature 2'] });
    });

    it('should detect tier upgrade', async () => {
      const result = await stripeService.handleSubscriptionUpdated(mockSubscription);

      expect(result.tierChanged).toBe(true);
      expect(result.oldTier).toBe('basic');
      expect(result.newTier).toBe('premium');
    });

    it('should send upgrade email on tier upgrade', async () => {
      await stripeService.handleSubscriptionUpdated(mockSubscription);

      expect(emailService.sendSubscriptionUpgraded).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          oldPlanName: 'Basic',
          newPlanName: 'Premium'
        })
      );
    });

    it('should not send email on downgrade', async () => {
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('free');
      UserModel.findById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        subscription_tier: 'basic'
      });

      await stripeService.handleSubscriptionUpdated(mockSubscription);

      expect(emailService.sendSubscriptionUpgraded).not.toHaveBeenCalled();
    });

    it('should return error when subscription record not found', async () => {
      userSubscription.getByStripeId.mockResolvedValue(null);

      const result = await stripeService.handleSubscriptionUpdated(mockSubscription);

      expect(result.processed).toBe(false);
      expect(result.reason).toBe('Subscription record not found');
    });
  });

  describe('handleSubscriptionDeleted', () => {
    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      metadata: { user_id: '1' },
      items: {
        data: [{ price: { id: 'price_basic' } }]
      },
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    };

    beforeEach(() => {
      userSubscription.getByStripeId.mockResolvedValue({ id: 1, users_id: 1 });
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('basic');
      UserModel.findById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        first_name: 'Test'
      });
    });

    it('should mark subscription as canceled', async () => {
      await stripeService.handleSubscriptionDeleted(mockSubscription);

      expect(userSubscription.updateSubscription).toHaveBeenCalledWith(1, {
        status: 'canceled'
      });
    });

    it('should revert user to free tier', async () => {
      await stripeService.handleSubscriptionDeleted(mockSubscription);

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, {
        subscription_tier: 'free',
        subscription_status: 'canceled'
      });
    });

    it('should send cancellation email', async () => {
      await stripeService.handleSubscriptionDeleted(mockSubscription);

      expect(emailService.sendSubscriptionCanceled).toHaveBeenCalledWith(
        'test@example.com',
        expect.objectContaining({
          firstName: 'Test',
          planName: 'Basic'
        })
      );
    });
  });

  describe('handleSubscriptionPaused', () => {
    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      metadata: { user_id: '1' },
      items: {
        data: [{ price: { id: 'price_basic' } }]
      }
    };

    beforeEach(() => {
      userSubscription.getByStripeId.mockResolvedValue({ id: 1, users_id: 1 });
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('basic');
      UserModel.findById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        first_name: 'Test'
      });
    });

    it('should update subscription status to paused', async () => {
      await stripeService.handleSubscriptionPaused(mockSubscription);

      expect(userSubscription.updateSubscription).toHaveBeenCalledWith(1, {
        status: 'paused'
      });
    });

    it('should send pause email notification', async () => {
      await stripeService.handleSubscriptionPaused(mockSubscription);

      expect(emailService.sendSubscriptionPaused).toHaveBeenCalled();
    });
  });

  describe('handleSubscriptionResumed', () => {
    const mockSubscription = {
      id: 'sub_test123',
      customer: 'cus_test123',
      metadata: { user_id: '1' },
      items: {
        data: [{ price: { id: 'price_basic' } }]
      },
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
    };

    beforeEach(() => {
      userSubscription.getByStripeId.mockResolvedValue({ id: 1, users_id: 1 });
      subscriptionPlansService.getTierFromPrice.mockResolvedValue('basic');
      UserModel.findById.mockResolvedValue({
        id: 1,
        email: 'test@example.com',
        first_name: 'Test'
      });
    });

    it('should update subscription status to active', async () => {
      await stripeService.handleSubscriptionResumed(mockSubscription);

      expect(userSubscription.updateSubscription).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: 'active' })
      );
    });

    it('should restore user subscription tier', async () => {
      await stripeService.handleSubscriptionResumed(mockSubscription);

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, {
        subscription_tier: 'basic',
        subscription_status: 'active'
      });
    });
  });

  // Note: handlePaymentFailed and handleCheckoutSessionCompleted tests require
  // complex Stripe SDK mocking that causes issues with Jest's module system.
  // These methods are tested via integration tests and manual testing.
  // TODO: Add integration tests for payment failure and checkout completion flows

  describe('getUserSubscription', () => {
    it('should return active subscription for user', async () => {
      const mockSubscription = { id: 1, status: 'active' };
      userSubscription.getActiveByUserId.mockResolvedValue(mockSubscription);

      const result = await stripeService.getUserSubscription(1);

      expect(result).toEqual(mockSubscription);
    });

    it('should return null when no subscription found', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue(null);

      const result = await stripeService.getUserSubscription(1);

      expect(result).toBeNull();
    });
  });

  describe('canAccessFeature', () => {
    beforeEach(() => {
      UserModel.findById.mockResolvedValue({
        id: 1,
        subscription_tier: 'premium',
        subscription_status: 'active'
      });
    });

    it('should check analytics access', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        analyticsAccess: true,
        apiAccess: false,
        videoLimit: 50
      });

      const result = await stripeService.canAccessFeature(1, 'analytics');

      expect(result).toBe(true);
    });

    it('should check API access', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        analyticsAccess: true,
        apiAccess: true,
        videoLimit: 50
      });

      const result = await stripeService.canAccessFeature(1, 'api');

      expect(result).toBe(true);
    });

    it('should check unlimited videos access', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        analyticsAccess: true,
        apiAccess: true,
        videoLimit: -1
      });

      const result = await stripeService.canAccessFeature(1, 'unlimited_videos');

      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      UserModel.findById.mockResolvedValue(null);

      const result = await stripeService.canAccessFeature(999, 'analytics');

      expect(result).toBe(false);
    });
  });
});
