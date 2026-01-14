/**
 * Subscription Middleware Unit Tests
 * Tests for subscription tier checking, usage limits, and feature access
 */

// Mock dependencies before requiring the middleware
jest.mock('../../../src/services/database.service', () => ({
  findByField: jest.fn(),
  query: jest.fn()
}));

jest.mock('../../../src/services/subscription.service', () => ({
  checkGrantAccess: jest.fn(),
  hasFreeVideoBeenUsed: jest.fn(),
  getCurrentPeriodUsage: jest.fn(),
  getCurrentPeriodUsageBreakdown: jest.fn(),
  trackUsage: jest.fn(),
  markFreeVideoAsUsed: jest.fn(),
  getUserActiveSubscriptionByPgId: jest.fn()
}));

jest.mock('../../../src/services/subscription-plans.service', () => ({
  getPlanByKey: jest.fn(),
  getFeatureFlags: jest.fn()
}));

jest.mock('../../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

const subscriptionMiddleware = require('../../../src/middleware/subscription.middleware');
const subscriptionService = require('../../../src/services/subscription.service');
const subscriptionPlansService = require('../../../src/services/subscription-plans.service');
const database = require('../../../src/services/database.service');

describe('Subscription Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      user: {
        id: 1,
        email: 'test@example.com',
        subscription_tier: 'basic',
        subscription_status: 'active'
      },
      path: '/api/test',
      xhr: false,
      headers: {},
      flash: jest.fn()
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis()
    };

    mockNext = jest.fn();
  });

  describe('requireSubscription', () => {
    it('should return 401 when user not authenticated', async () => {
      mockReq.user = null;
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: 'Authentication required'
      }));
    });

    it('should allow access when user has sufficient tier', async () => {
      mockReq.user.subscription_tier = 'premium';

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.userTier).toBe('premium');
    });

    it('should allow access when user has exact required tier', async () => {
      mockReq.user.subscription_tier = 'basic';

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when user tier is insufficient', async () => {
      mockReq.user.subscription_tier = 'free';
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireSubscription('premium');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Subscription upgrade required',
        current_tier: 'free',
        required_tier: 'premium'
      }));
    });

    it('should return 403 when paid subscription is not active', async () => {
      mockReq.user.subscription_tier = 'basic';
      mockReq.user.subscription_status = 'canceled';
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Active subscription required'
      }));
    });

    it('should allow trialing status for paid tiers', async () => {
      mockReq.user.subscription_tier = 'premium';
      mockReq.user.subscription_status = 'trialing';

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow paused status for paid tiers', async () => {
      mockReq.user.subscription_tier = 'basic';
      mockReq.user.subscription_status = 'paused';

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should redirect web requests to upgrade page', async () => {
      mockReq.user.subscription_tier = 'free';

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/subscription/upgrade');
    });

    it('should redirect to sign-in on 401', async () => {
      mockReq.user = null;

      const middleware = subscriptionMiddleware.requireSubscription('basic');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith('/auth/sign-in');
    });

    it('should handle tier hierarchy correctly', async () => {
      // Enterprise should access premium features
      mockReq.user.subscription_tier = 'enterprise';

      const middleware = subscriptionMiddleware.requireSubscription('premium');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle creator tier correctly', async () => {
      mockReq.user.subscription_tier = 'creator';

      const middleware = subscriptionMiddleware.requireSubscription('enterprise');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should set userSubscriptionStatus on request', async () => {
      mockReq.user.subscription_status = 'active';

      const middleware = subscriptionMiddleware.requireSubscription('free');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.userSubscriptionStatus).toBe('active');
    });
  });

  describe('checkUsageLimit', () => {
    beforeEach(() => {
      subscriptionService.checkGrantAccess.mockResolvedValue({ hasGrant: false });
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ videoLimit: 10 });
      subscriptionService.getCurrentPeriodUsage.mockResolvedValue(5);
    });

    it('should return 401 when user not authenticated', async () => {
      mockReq.user = null;
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should allow access when within usage limit', async () => {
      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.usageInfo).toBeDefined();
    });

    it('should return 429 when usage limit exceeded', async () => {
      subscriptionService.getCurrentPeriodUsage.mockResolvedValue(10);
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'videos limit exceeded'
      }));
    });

    it('should allow unlimited usage when limit is -1', async () => {
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ videoLimit: -1 });

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should check admin grants first', async () => {
      subscriptionService.checkGrantAccess.mockResolvedValue({
        hasGrant: true,
        grantType: 'full_access',
        videoLimit: Infinity
      });

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.usageInfo.hasAdminGrant).toBe(true);
    });

    it('should allow free user first video', async () => {
      mockReq.user.subscription_tier = 'free';
      subscriptionService.hasFreeVideoBeenUsed.mockResolvedValue(false);

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.usageInfo.isFreeTrialUser).toBe(true);
    });

    it('should block free user after first video used', async () => {
      mockReq.user.subscription_tier = 'free';
      mockReq.xhr = true;
      subscriptionService.hasFreeVideoBeenUsed.mockResolvedValue(true);

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        free_credit_used: true
      }));
    });

    it('should return 500 when plan not found', async () => {
      subscriptionPlansService.getPlanByKey.mockResolvedValue(null);
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.checkUsageLimit('videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });

    it('should set usage info with correct data', async () => {
      subscriptionService.getCurrentPeriodUsage.mockResolvedValue(3);
      subscriptionPlansService.getPlanByKey.mockResolvedValue({ videoLimit: 10 });

      const middleware = subscriptionMiddleware.checkUsageLimit('videos', 2);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockReq.usageInfo).toEqual(expect.objectContaining({
        userId: 1,
        resource: 'videos',
        increment: 2,
        currentUsage: 3,
        limit: 10
      }));
    });

    it('should check grant limit when grant has specific video limit', async () => {
      subscriptionService.checkGrantAccess.mockResolvedValue({
        hasGrant: true,
        grantType: 'limited',
        videoLimit: 5
      });
      subscriptionService.getCurrentPeriodUsage.mockResolvedValue(3);

      const middleware = subscriptionMiddleware.checkUsageLimit('videos', 1);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 429 when admin grant limit exceeded', async () => {
      subscriptionService.checkGrantAccess.mockResolvedValue({
        hasGrant: true,
        grantType: 'limited',
        videoLimit: 5
      });
      subscriptionService.getCurrentPeriodUsage.mockResolvedValue(5);
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.checkUsageLimit('videos', 1);
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        has_admin_grant: true
      }));
    });
  });

  describe('incrementUsage', () => {
    it('should call next without error when no usage info', async () => {
      await subscriptionMiddleware.incrementUsage(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should mark free video as used for free trial user', async () => {
      mockReq.usageInfo = {
        userId: 1,
        isFreeTrialUser: true
      };

      await subscriptionMiddleware.incrementUsage(mockReq, mockRes, mockNext);

      expect(subscriptionService.markFreeVideoAsUsed).toHaveBeenCalledWith(1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should track usage for paid users', async () => {
      mockReq.usageInfo = {
        userId: 1,
        resource: 'videos',
        increment: 1
      };

      await subscriptionMiddleware.incrementUsage(mockReq, mockRes, mockNext);

      expect(subscriptionService.trackUsage).toHaveBeenCalledWith(1, 'videos', 1);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should continue on error without failing request', async () => {
      mockReq.usageInfo = {
        userId: 1,
        resource: 'videos',
        increment: 1
      };
      subscriptionService.trackUsage.mockRejectedValue(new Error('DB error'));

      await subscriptionMiddleware.incrementUsage(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireFeature', () => {
    it('should return 401 when user not authenticated', async () => {
      mockReq.user = null;
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireFeature('analytics');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should allow access when feature is enabled', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        analyticsAccess: true
      });

      const middleware = subscriptionMiddleware.requireFeature('analytics');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 403 when feature not available', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        analyticsAccess: false
      });
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireFeature('analytics');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Feature requires upgrade',
        feature: 'analytics'
      }));
    });

    it('should check API access feature', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        apiAccess: true
      });

      const middleware = subscriptionMiddleware.requireFeature('api');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should check unlimited_videos feature', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        videoLimit: -1
      });

      const middleware = subscriptionMiddleware.requireFeature('unlimited_videos');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should check priority_support feature', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue({
        prioritySupport: true
      });

      const middleware = subscriptionMiddleware.requireFeature('priority_support');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 500 when feature flags not found', async () => {
      subscriptionPlansService.getFeatureFlags.mockResolvedValue(null);
      mockReq.xhr = true;

      const middleware = subscriptionMiddleware.requireFeature('analytics');
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('addSubscriptionInfo', () => {
    beforeEach(() => {
      subscriptionService.checkGrantAccess.mockResolvedValue({ hasGrant: false });
      subscriptionPlansService.getPlanByKey.mockResolvedValue({
        videoLimit: 10,
        features: ['Feature 1', 'Feature 2']
      });
      subscriptionService.getCurrentPeriodUsageBreakdown.mockResolvedValue({
        videos: 5,
        api_calls: 100,
        storage: 50,
        ai_summaries: 3
      });
    });

    it('should call next when no user', async () => {
      mockReq.user = null;

      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockReq.subscriptionInfo).toBeUndefined();
    });

    it('should add subscription info to request', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo).toBeDefined();
      expect(mockReq.subscriptionInfo.tier).toBe('basic');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should include usage data', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.usage).toEqual({
        videos: 5,
        api_calls: 100,
        storage: 50,
        ai_summaries: 3
      });
    });

    it('should include limits data', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.limits.videos).toBe(10);
    });

    it('should calculate percentages', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.percentages.videos).toBe(50);
    });

    it('should calculate remaining videos', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.remainingVideos).toBe(5);
    });

    it('should include features list', async () => {
      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.features).toEqual(['Feature 1', 'Feature 2']);
    });

    it('should handle admin grants', async () => {
      subscriptionService.checkGrantAccess.mockResolvedValue({
        hasGrant: true,
        grantType: 'full_access',
        tierOverride: 'enterprise',
        videoLimit: Infinity,
        expiresAt: '2025-12-31'
      });

      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.hasAdminGrant).toBe(true);
      expect(mockReq.subscriptionInfo.effectiveTier).toBe('enterprise');
      expect(mockReq.subscriptionInfo.limits.videos).toBe(-1);
    });

    it('should handle unlimited videos correctly', async () => {
      subscriptionPlansService.getPlanByKey.mockResolvedValue({
        videoLimit: -1,
        features: []
      });

      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockReq.subscriptionInfo.percentages.videos).toBe(0);
      expect(mockReq.subscriptionInfo.remainingVideos).toBe(Infinity);
    });

    it('should continue on error', async () => {
      subscriptionService.getCurrentPeriodUsageBreakdown.mockRejectedValue(new Error('DB error'));

      await subscriptionMiddleware.addSubscriptionInfo(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
