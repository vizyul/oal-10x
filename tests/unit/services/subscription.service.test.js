/**
 * Subscription Service Unit Tests
 * Tests for src/services/subscription.service.js
 */

// Mock dependencies before requiring the service
jest.mock('../../../src/services/database.service', () => ({
  pool: { mockPool: true },
  query: jest.fn()
}));

jest.mock('../../../src/models', () => ({
  user: {
    resolveUserId: jest.fn()
  },
  userSubscription: {
    getActiveByUserId: jest.fn(),
    createSubscription: jest.fn(),
    create: jest.fn()
  },
  subscriptionUsage: {
    getCurrentBySubscriptionId: jest.fn(),
    getCurrentByUserId: jest.fn(),
    incrementUsage: jest.fn(),
    decrementUsage: jest.fn(),
    createUsage: jest.fn(),
    hasExceededLimit: jest.fn()
  }
}));

const subscriptionService = require('../../../src/services/subscription.service');
const database = require('../../../src/services/database.service');
const { user, userSubscription, subscriptionUsage } = require('../../../src/models');

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_resolveUserId', () => {
    it('should resolve user ID using User model', async () => {
      user.resolveUserId.mockResolvedValue(123);

      const result = await subscriptionService._resolveUserId('test@example.com');

      expect(user.resolveUserId).toHaveBeenCalledWith('test@example.com');
      expect(result).toBe(123);
    });

    it('should return null when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService._resolveUserId('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('getActiveGrant', () => {
    it('should return active grant for user', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          id: 1,
          user_id: 1,
          grant_type: 'unlimited_videos',
          is_active: true
        }]
      });

      const result = await subscriptionService.getActiveGrant(1);

      expect(result).toHaveProperty('grant_type', 'unlimited_videos');
    });

    it('should return null when no active grant exists', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({ rows: [] });

      const result = await subscriptionService.getActiveGrant(1);

      expect(result).toBeNull();
    });

    it('should return null when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.getActiveGrant('notfound');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockRejectedValue(new Error('Database error'));

      const result = await subscriptionService.getActiveGrant(1);

      expect(result).toBeNull();
    });
  });

  describe('checkGrantAccess', () => {
    it('should return hasGrant false when no grant exists', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({ rows: [] });

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result).toEqual({ hasGrant: false });
    });

    it('should return unlimited video limit for unlimited_videos grant', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          id: 1,
          user_id: 1,
          grant_type: 'unlimited_videos',
          is_active: true
        }]
      });

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result.hasGrant).toBe(true);
      expect(result.videoLimit).toBe(Infinity);
      expect(result.grantType).toBe('unlimited_videos');
    });

    it('should return video_limit_override from grant', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          id: 1,
          grant_type: 'video_limit_override',
          video_limit_override: 25,
          is_active: true
        }]
      });

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result.hasGrant).toBe(true);
      expect(result.videoLimit).toBe(25);
    });

    it('should return tier-based limit for full_access grant', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          id: 1,
          grant_type: 'full_access',
          tier_override: 'premium',
          is_active: true
        }]
      });

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result.hasGrant).toBe(true);
      expect(result.videoLimit).toBe(8); // premium tier limit
    });

    it('should return 1 video limit for trial_extension grant', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          id: 1,
          grant_type: 'trial_extension',
          is_active: true
        }]
      });

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result.hasGrant).toBe(true);
      expect(result.videoLimit).toBe(1);
    });

    it('should return hasGrant false on error', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.checkGrantAccess(1);

      expect(result).toEqual({ hasGrant: false });
    });
  });

  describe('createGrant', () => {
    const mockGrantData = {
      userId: 1,
      grantedById: 2,
      grantType: 'unlimited_videos',
      reason: 'Test grant'
    };

    it('should create new grant and deactivate existing grants', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] }) // Deactivate existing
        .mockResolvedValueOnce({ // Create new
          rows: [{
            id: 1,
            user_id: 1,
            granted_by_id: 2,
            grant_type: 'unlimited_videos'
          }]
        });

      const result = await subscriptionService.createGrant(mockGrantData);

      expect(database.query).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('grant_type', 'unlimited_videos');
    });

    it('should update user tier for full_access grant', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] }) // Deactivate
        .mockResolvedValueOnce({ // Create
          rows: [{
            id: 1,
            grant_type: 'full_access',
            tier_override: 'premium'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update user tier

      await subscriptionService.createGrant({
        ...mockGrantData,
        grantType: 'full_access',
        tierOverride: 'premium'
      });

      expect(database.query).toHaveBeenCalledTimes(3);
    });

    it('should throw error on database failure', async () => {
      database.query.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionService.createGrant(mockGrantData))
        .rejects.toThrow('Database error');
    });
  });

  describe('revokeGrant', () => {
    it('should revoke grant and deactivate it', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          grant_type: 'unlimited_videos',
          is_active: false
        }]
      });

      const result = await subscriptionService.revokeGrant(1, 2);

      expect(result).toHaveProperty('is_active', false);
    });

    it('should revert user to free tier for full_access grant', async () => {
      database.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            user_id: 1,
            grant_type: 'full_access'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update user

      await subscriptionService.revokeGrant(1, 2);

      expect(database.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error when grant not found', async () => {
      database.query.mockResolvedValue({ rows: [] });

      await expect(subscriptionService.revokeGrant(999, 1))
        .rejects.toThrow('Grant not found');
    });
  });

  describe('getUsageFieldName', () => {
    it('should map videos to videos_processed', () => {
      expect(subscriptionService.getUsageFieldName('videos')).toBe('videos_processed');
    });

    it('should map api_calls to api_calls_made', () => {
      expect(subscriptionService.getUsageFieldName('api_calls')).toBe('api_calls_made');
    });

    it('should map storage to storage_used_mb', () => {
      expect(subscriptionService.getUsageFieldName('storage')).toBe('storage_used_mb');
    });

    it('should map ai_summaries to ai_summaries_generated', () => {
      expect(subscriptionService.getUsageFieldName('ai_summaries')).toBe('ai_summaries_generated');
    });

    it('should map analytics to analytics_views', () => {
      expect(subscriptionService.getUsageFieldName('analytics')).toBe('analytics_views');
    });

    it('should default to videos_processed for unknown resource', () => {
      expect(subscriptionService.getUsageFieldName('unknown')).toBe('videos_processed');
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current usage for user', async () => {
      user.resolveUserId.mockResolvedValue(1);
      subscriptionUsage.getCurrentByUserId.mockResolvedValue({
        videos_processed: 5,
        api_calls_made: 100,
        storage_used_mb: 50,
        ai_summaries_generated: 10
      });

      const result = await subscriptionService.getCurrentUsage(1);

      expect(result).toEqual({
        videos: 5,
        api_calls: 100,
        storage: 50,
        ai_summaries: 10
      });
    });

    it('should return zeros when no usage record exists', async () => {
      user.resolveUserId.mockResolvedValue(1);
      subscriptionUsage.getCurrentByUserId.mockResolvedValue(null);

      const result = await subscriptionService.getCurrentUsage(1);

      expect(result).toEqual({
        videos: 0,
        api_calls: 0,
        storage: 0,
        ai_summaries: 0
      });
    });

    it('should return zeros when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.getCurrentUsage('notfound');

      expect(result).toEqual({
        videos: 0,
        api_calls: 0,
        storage: 0,
        ai_summaries: 0
      });
    });

    it('should return zeros on error', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.getCurrentUsage(1);

      expect(result).toEqual({
        videos: 0,
        api_calls: 0,
        storage: 0,
        ai_summaries: 0
      });
    });
  });

  describe('getUserActiveSubscription', () => {
    it('should return active subscription for user', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({
        id: 1,
        users_id: 1,
        plan_name: 'Premium',
        status: 'active'
      });

      const result = await subscriptionService.getUserActiveSubscription(1);

      expect(result).toHaveProperty('plan_name', 'Premium');
    });

    it('should return null when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.getUserActiveSubscription('notfound');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.getUserActiveSubscription(1);

      expect(result).toBeNull();
    });
  });

  describe('getCurrentPeriodUsage', () => {
    it('should return current videos_processed count', async () => {
      subscriptionUsage.getCurrentByUserId.mockResolvedValue({
        videos_processed: 7
      });
      database.query.mockResolvedValue({
        rows: [{ subscription_tier: 'basic', free_video_used: false }]
      });

      const result = await subscriptionService.getCurrentPeriodUsage(1);

      expect(result).toBe(7);
    });

    it('should return 0 when no usage record', async () => {
      subscriptionUsage.getCurrentByUserId.mockResolvedValue(null);

      const result = await subscriptionService.getCurrentPeriodUsage(1);

      expect(result).toBe(0);
    });

    it('should return 0 on error', async () => {
      subscriptionUsage.getCurrentByUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.getCurrentPeriodUsage(1);

      expect(result).toBe(0);
    });
  });

  describe('getCurrentPeriodUsageBreakdown', () => {
    it('should return usage breakdown', async () => {
      user.resolveUserId.mockResolvedValue(1);
      subscriptionUsage.getCurrentByUserId.mockResolvedValue({
        videos_processed: 5,
        api_calls_made: 100,
        storage_used_mb: 50,
        ai_summaries_generated: 10
      });
      database.query.mockResolvedValue({
        rows: [{ subscription_tier: 'basic', free_video_used: false }]
      });

      const result = await subscriptionService.getCurrentPeriodUsageBreakdown(1);

      expect(result).toEqual({
        videos: 5,
        api_calls: 100,
        storage: 50,
        ai_summaries: 10
      });
    });

    it('should return zeros when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.getCurrentPeriodUsageBreakdown('notfound');

      expect(result).toEqual({
        videos: 0,
        api_calls: 0,
        storage: 0,
        ai_summaries: 0
      });
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage for existing record', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({
        id: 1,
        current_period_start: new Date(),
        current_period_end: new Date()
      });
      subscriptionUsage.getCurrentBySubscriptionId.mockResolvedValue({
        id: 1,
        videos_processed: 5
      });

      await subscriptionService.incrementUsage(1, 'videos', 1);

      expect(subscriptionUsage.incrementUsage).toHaveBeenCalledWith(1, 'videos_processed', 1);
    });

    it('should create new usage record if none exists', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({
        id: 1,
        current_period_start: new Date(),
        current_period_end: new Date()
      });
      subscriptionUsage.getCurrentBySubscriptionId.mockResolvedValue(null);

      await subscriptionService.incrementUsage(1, 'videos', 1);

      expect(subscriptionUsage.createUsage).toHaveBeenCalled();
      expect(subscriptionUsage.incrementUsage).toHaveBeenCalled();
    });

    it('should skip when no subscription found', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue(null);

      await subscriptionService.incrementUsage(1, 'videos', 1);

      expect(subscriptionUsage.incrementUsage).not.toHaveBeenCalled();
    });
  });

  describe('trackUsage', () => {
    it('should track usage for existing subscription', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue({
        id: 1,
        current_period_start: new Date(),
        current_period_end: new Date()
      });
      subscriptionUsage.getCurrentBySubscriptionId.mockResolvedValue({
        id: 1
      });

      await subscriptionService.trackUsage(1, 'videos', 1);

      expect(subscriptionUsage.incrementUsage).toHaveBeenCalledWith(1, 'videos_processed', 1);
    });

    it('should skip tracking when no subscription', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue(null);

      await subscriptionService.trackUsage(1, 'videos', 1);

      expect(subscriptionUsage.incrementUsage).not.toHaveBeenCalled();
    });
  });

  describe('createSubscription', () => {
    it('should create subscription record', async () => {
      userSubscription.createSubscription.mockResolvedValue({
        id: 1,
        users_id: 1,
        plan_name: 'Premium'
      });

      const result = await subscriptionService.createSubscription({
        users_id: 1,
        plan_name: 'Premium'
      });

      expect(result).toHaveProperty('plan_name', 'Premium');
    });

    it('should throw error on failure', async () => {
      userSubscription.createSubscription.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionService.createSubscription({ users_id: 1 }))
        .rejects.toThrow('Failed to create subscription');
    });
  });

  describe('createUsageRecord', () => {
    it('should create usage record', async () => {
      subscriptionUsage.createUsage.mockResolvedValue({
        id: 1,
        user_subscriptions_id: 1
      });

      const result = await subscriptionService.createUsageRecord({
        user_subscriptions_id: 1
      });

      expect(result).toHaveProperty('user_subscriptions_id', 1);
    });

    it('should throw error on failure', async () => {
      subscriptionUsage.createUsage.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionService.createUsageRecord({}))
        .rejects.toThrow('Failed to create usage record');
    });
  });

  describe('canProcessVideo', () => {
    it('should return true when within limits', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({ id: 1 });
      subscriptionUsage.hasExceededLimit.mockResolvedValue(false);

      const result = await subscriptionService.canProcessVideo(1);

      expect(result).toBe(true);
    });

    it('should return false when limit exceeded', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({ id: 1 });
      subscriptionUsage.hasExceededLimit.mockResolvedValue(true);

      const result = await subscriptionService.canProcessVideo(1);

      expect(result).toBe(false);
    });

    it('should return true when user not found (fail-safe)', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.canProcessVideo('notfound');

      expect(result).toBe(true);
    });

    it('should return true on error (fail-safe)', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.canProcessVideo(1);

      expect(result).toBe(true);
    });
  });

  describe('decrementVideoProcessedCount', () => {
    it('should decrement count successfully', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({ id: 1 });
      subscriptionUsage.getCurrentBySubscriptionId.mockResolvedValue({
        videos_processed: 5
      });

      const result = await subscriptionService.decrementVideoProcessedCount(1);

      expect(subscriptionUsage.decrementUsage).toHaveBeenCalledWith(1, 'videos_processed', 1);
      expect(result).toBe(true);
    });

    it('should not decrement when count is 0', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue({ id: 1 });
      subscriptionUsage.getCurrentBySubscriptionId.mockResolvedValue({
        videos_processed: 0
      });

      const result = await subscriptionService.decrementVideoProcessedCount(1);

      expect(subscriptionUsage.decrementUsage).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('should return false when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.decrementVideoProcessedCount('notfound');

      expect(result).toBe(false);
    });

    it('should return false when no subscription', async () => {
      user.resolveUserId.mockResolvedValue(1);
      userSubscription.getActiveByUserId.mockResolvedValue(null);

      const result = await subscriptionService.decrementVideoProcessedCount(1);

      expect(result).toBe(false);
    });
  });

  describe('hasFreeVideoBeenUsed', () => {
    it('should return true when free video is used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{ free_video_used: true }]
      });

      const result = await subscriptionService.hasFreeVideoBeenUsed(1);

      expect(result).toBe(true);
    });

    it('should return false when free video not used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{ free_video_used: false }]
      });

      const result = await subscriptionService.hasFreeVideoBeenUsed(1);

      expect(result).toBe(false);
    });

    it('should return true when user not found (safe default)', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.hasFreeVideoBeenUsed('notfound');

      expect(result).toBe(true);
    });

    it('should return true on error (safe default)', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.hasFreeVideoBeenUsed(1);

      expect(result).toBe(true);
    });
  });

  describe('markFreeVideoAsUsed', () => {
    it('should mark free video as used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({ rows: [{ id: 1 }] });
      userSubscription.getActiveByUserId.mockResolvedValue(null);

      const result = await subscriptionService.markFreeVideoAsUsed(1);

      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.markFreeVideoAsUsed('notfound');

      expect(result).toBe(false);
    });

    it('should return false when already used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({ rows: [] });

      const result = await subscriptionService.markFreeVideoAsUsed(1);

      expect(result).toBe(false);
    });
  });

  describe('canProcessVideoEnhanced', () => {
    it('should allow processing with unlimited admin grant', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [{
          grant_type: 'unlimited_videos',
          is_active: true
        }]
      });

      const result = await subscriptionService.canProcessVideoEnhanced(1);

      expect(result.canProcess).toBe(true);
      expect(result.reason).toContain('Unlimited');
    });

    it('should allow free user to process if trial not used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      // No grant
      database.query
        .mockResolvedValueOnce({ rows: [] })
        // User data
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'free', free_video_used: false }]
        });

      const result = await subscriptionService.canProcessVideoEnhanced(1);

      expect(result.canProcess).toBe(true);
      expect(result.reason).toBe('Free video available');
    });

    it('should deny free user if trial used', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query
        .mockResolvedValueOnce({ rows: [] }) // No grant
        .mockResolvedValueOnce({
          rows: [{ subscription_tier: 'free', free_video_used: true }]
        });

      const result = await subscriptionService.canProcessVideoEnhanced(1);

      expect(result.canProcess).toBe(false);
      expect(result.requiresUpgrade).toBe(true);
    });

    it('should return canProcess false when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.canProcessVideoEnhanced('notfound');

      expect(result.canProcess).toBe(false);
      expect(result.reason).toBe('User not found');
    });
  });

  describe('initializeFreeUserSubscription', () => {
    it('should initialize subscription and usage for free user', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue(null);
      userSubscription.create.mockResolvedValue({
        id: 1,
        users_id: 1,
        plan_name: 'Free'
      });
      subscriptionUsage.createUsage.mockResolvedValue({
        id: 1,
        user_subscriptions_id: 1,
        usage_limit: 1
      });

      const result = await subscriptionService.initializeFreeUserSubscription(1);

      expect(result).toHaveProperty('subscription');
      expect(result).toHaveProperty('usage');
      expect(userSubscription.create).toHaveBeenCalled();
      expect(subscriptionUsage.createUsage).toHaveBeenCalled();
    });

    it('should skip if user already has subscription', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue({
        id: 1,
        users_id: 1,
        plan_name: 'Premium'
      });

      const result = await subscriptionService.initializeFreeUserSubscription(1);

      expect(result).toHaveProperty('subscription');
      expect(userSubscription.create).not.toHaveBeenCalled();
    });

    it('should throw error on failure', async () => {
      userSubscription.getActiveByUserId.mockResolvedValue(null);
      userSubscription.create.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionService.initializeFreeUserSubscription(1))
        .rejects.toThrow();
    });
  });

  describe('getAllGrants', () => {
    it('should return paginated grants list', async () => {
      database.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, grant_type: 'unlimited_videos', user_email: 'test@example.com' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [{ count: '1' }]
        });

      const result = await subscriptionService.getAllGrants({ status: 'active', page: 1, limit: 50 });

      expect(result).toHaveProperty('grants');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
    });

    it('should throw error on database failure', async () => {
      database.query.mockRejectedValue(new Error('Database error'));

      await expect(subscriptionService.getAllGrants())
        .rejects.toThrow();
    });
  });

  describe('getUserGrants', () => {
    it('should return grants for specific user', async () => {
      user.resolveUserId.mockResolvedValue(1);
      database.query.mockResolvedValue({
        rows: [
          { id: 1, grant_type: 'unlimited_videos' },
          { id: 2, grant_type: 'full_access' }
        ]
      });

      const result = await subscriptionService.getUserGrants(1);

      expect(result).toHaveLength(2);
    });

    it('should return empty array when user not found', async () => {
      user.resolveUserId.mockResolvedValue(null);

      const result = await subscriptionService.getUserGrants('notfound');

      expect(result).toEqual([]);
    });

    it('should return empty array on error', async () => {
      user.resolveUserId.mockRejectedValue(new Error('Error'));

      const result = await subscriptionService.getUserGrants(1);

      expect(result).toEqual([]);
    });
  });
});
