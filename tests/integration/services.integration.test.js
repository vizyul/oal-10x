const databaseService = require('../../src/services/database.service');
const authService = require('../../src/services/auth.service');
const sessionService = require('../../src/services/session.service');
const subscriptionService = require('../../src/services/subscription.service');

/**
 * Service Integration Tests
 * Tests services with REAL database calls to catch field mapping errors,
 * SQL syntax issues, and service method problems
 */
describe('Service Integration Tests', () => {
  let testUserId;
  let testSessionId;
  let testSubscriptionId;

  beforeAll(async () => {
    // Ensure we have a clean test environment
    if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
      throw new Error('No database connection configured for tests');
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (testSubscriptionId) {
      try {
        await databaseService.delete('user_subscriptions', testSubscriptionId);
      } catch (error) {
        console.warn('Failed to clean up test subscription:', error.message);
      }
    }
    
    if (testSessionId) {
      try {
        await databaseService.delete('sessions', testSessionId);
      } catch (error) {
        console.warn('Failed to clean up test session:', error.message);
      }
    }

    if (testUserId) {
      try {
        await databaseService.delete('users', testUserId);
      } catch (error) {
        console.warn('Failed to clean up test user:', error.message);
      }
    }

    await databaseService.close();
  });

  describe('Database Service Integration', () => {
    test('should create and retrieve user with all required fields', async () => {
      const userData = {
        email: `integration-test-${Date.now()}@example.com`,
        first_name: 'Integration',
        last_name: 'Test',
        password: 'hashedpassword123',
        status: 'active',
        subscription_tier: 'free',
        email_verified: false
      };

      // Test CREATE
      const createdUser = await databaseService.create('users', userData);
      expect(createdUser).toBeDefined();
      expect(createdUser.id).toBeDefined();
      expect(createdUser.email).toBe(userData.email);

      testUserId = createdUser.id;

      // Test FIND BY ID
      const foundUser = await databaseService.findById('users', testUserId);
      expect(foundUser).toBeDefined();
      expect(foundUser.email).toBe(userData.email);
      expect(foundUser.subscription_tier).toBe('free');

      // Test FIND BY FIELD
      const usersByEmail = await databaseService.findByField('users', 'email', userData.email);
      expect(usersByEmail).toHaveLength(1);
      expect(usersByEmail[0].id).toBe(testUserId);

      // Test UPDATE
      const updateData = { first_name: 'Updated', subscription_tier: 'premium' };
      const updatedUser = await databaseService.update('users', testUserId, updateData);
      expect(updatedUser.first_name).toBe('Updated');
      expect(updatedUser.subscription_tier).toBe('premium');
    });

    test('should handle OAuth user creation with normalized fields', async () => {
      const oauthUser = {
        email: `oauth-test-${Date.now()}@example.com`,
        first_name: 'OAuth',
        last_name: 'User',
        oauth_provider: 'google',
        oauth_id: 'google_123456',
        email_verified: true,
        status: 'active'
      };

      const createdUser = await databaseService.create('users', oauthUser);
      expect(createdUser.oauth_provider).toBe('google');
      expect(createdUser.oauth_id).toBe('google_123456');
      expect(createdUser.email_verified).toBe(true);

      // Clean up
      await databaseService.delete('users', createdUser.id);
    });
  });

  describe('Auth Service Integration', () => {
    test('should create user with proper password hashing', async () => {
      const userData = {
        email: `auth-test-${Date.now()}@example.com`,
        first_name: 'Auth',
        last_name: 'Test',
        password: 'plainPassword123'
      };

      const createdUser = await authService.createUser(userData);
      expect(createdUser).toBeDefined();
      expect(createdUser.id).toBeDefined();
      expect(createdUser.password).not.toBe('plainPassword123'); // Should be hashed
      expect(createdUser.password).toBeDefined();
      expect(createdUser.password.length).toBeGreaterThan(50); // bcrypt hashes are long

      // Clean up
      await databaseService.delete('users', createdUser.id);
    });

    test('should authenticate user with correct password', async () => {
      const userData = {
        email: `auth-verify-${Date.now()}@example.com`,
        first_name: 'Auth',
        last_name: 'Verify',
        password: 'testPassword123'
      };

      // Create user
      const createdUser = await authService.createUser(userData);
      
      // Test authentication
      const authenticatedUser = await authService.authenticateUser(userData.email, userData.password);
      expect(authenticatedUser).toBeDefined();
      expect(authenticatedUser.id).toBe(createdUser.id);

      // Test wrong password
      const wrongAuth = await authService.authenticateUser(userData.email, 'wrongPassword');
      expect(wrongAuth).toBeNull();

      // Clean up
      await databaseService.delete('users', createdUser.id);
    });

    test('should handle OAuth user creation and lookup', async () => {
      const oauthData = {
        email: `oauth-service-${Date.now()}@example.com`,
        first_name: 'OAuth',
        last_name: 'Service',
        oauth_provider: 'google',
        oauth_id: `google_${Date.now()}`
      };

      // Create OAuth user
      const createdUser = await authService.createOAuthUser(oauthData);
      expect(createdUser).toBeDefined();
      expect(createdUser.oauth_provider).toBe('google');

      // Find by OAuth credentials
      const foundUser = await authService.findUserByOAuth('google', oauthData.oauth_id);
      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(createdUser.id);

      // Clean up
      await databaseService.delete('users', createdUser.id);
    });
  });

  describe('Session Service Integration', () => {
    beforeEach(async () => {
      // Create test user for session tests
      if (!testUserId) {
        const userData = {
          email: `session-test-${Date.now()}@example.com`,
          first_name: 'Session',
          last_name: 'Test',
          status: 'active'
        };
        const createdUser = await databaseService.create('users', userData);
        testUserId = createdUser.id;
      }
    });

    test('should create session with proper duration calculation', async () => {
      const sessionData = {
        users_id: testUserId,
        user_email: 'session-test@example.com',
        login_method: 'email',
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser',
        device_type: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
        status: 'active'
      };

      const session = await sessionService.createSession(sessionData);
      expect(session).toBeDefined();
      expect(session.users_id).toBe(testUserId);
      expect(session.status).toBe('active');
      expect(session.duration).toBeDefined();
      expect(typeof session.duration).toBe('string'); // Should be DECIMAL format

      testSessionId = session.id;
    });

    test('should update session duration correctly', async () => {
      if (!testSessionId) {
        throw new Error('Test session not created');
      }

      // Wait a bit to ensure duration calculation
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedSession = await sessionService.updateSessionDuration(testSessionId);
      expect(updatedSession).toBeDefined();
      expect(parseFloat(updatedSession.duration)).toBeGreaterThan(0);
    });

    test('should end session properly', async () => {
      if (!testSessionId) {
        throw new Error('Test session not created');
      }

      const endedSession = await sessionService.endSession(testSessionId);
      expect(endedSession.status).toBe('ended');
      expect(endedSession.ended_at).toBeDefined();
      expect(parseFloat(endedSession.duration)).toBeGreaterThan(0);
    });
  });

  describe('Subscription Service Integration', () => {
    beforeEach(async () => {
      // Create test user for subscription tests
      if (!testUserId) {
        const userData = {
          email: `subscription-test-${Date.now()}@example.com`,
          first_name: 'Subscription',
          last_name: 'Test',
          status: 'active'
        };
        const createdUser = await databaseService.create('users', userData);
        testUserId = createdUser.id;
      }
    });

    test('should create subscription with proper relationships', async () => {
      const subscriptionData = {
        users_id: testUserId,
        stripe_subscription_id: `sub_test_${Date.now()}`,
        plan_name: 'premium',
        subscription_tier: 'premium',
        status: 'active'
      };

      const subscription = await subscriptionService.createSubscription(subscriptionData);
      expect(subscription).toBeDefined();
      expect(subscription.users_id).toBe(testUserId);
      expect(subscription.subscription_tier).toBe('premium');

      testSubscriptionId = subscription.id;
    });

    test('should track usage with proper foreign keys', async () => {
      if (!testSubscriptionId) {
        throw new Error('Test subscription not created');
      }

      const usageData = {
        user_subscriptions_id: testSubscriptionId,
        usage_type: 'monthly',
        videos_processed: 5,
        usage_count: 5,
        ai_summaries_generated: 3,
        period_start: new Date(),
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };

      const usage = await subscriptionService.createUsageRecord(usageData);
      expect(usage).toBeDefined();
      expect(usage.user_subscriptions_id).toBe(testSubscriptionId);
      expect(usage.videos_processed).toBe(5);
      expect(usage.ai_summaries_generated).toBe(3);
    });

    test('should check usage limits correctly', async () => {
      if (!testUserId) {
        throw new Error('Test user not created');
      }

      const currentUsage = await subscriptionService.getCurrentUsage(testUserId);
      expect(currentUsage).toBeDefined();
      expect(typeof currentUsage.videos_processed).toBe('number');
      
      const canProcess = await subscriptionService.canProcessVideo(testUserId);
      expect(typeof canProcess).toBe('boolean');
    });
  });

  describe('Cross-Service Integration', () => {
    test('should handle complete user signup workflow', async () => {
      const signupData = {
        email: `workflow-test-${Date.now()}@example.com`,
        first_name: 'Workflow',
        last_name: 'Test',
        password: 'workflowPassword123'
      };

      // 1. Create user
      const user = await authService.createUser(signupData);
      expect(user).toBeDefined();

      // 2. Create default subscription
      const subscription = await subscriptionService.createSubscription({
        users_id: user.id,
        plan_name: 'free',
        subscription_tier: 'free',
        status: 'active'
      });
      expect(subscription).toBeDefined();

      // 3. Create session
      const session = await sessionService.createSession({
        users_id: user.id,
        user_email: user.email,
        login_method: 'email',
        ip_address: '127.0.0.1',
        device_type: 'desktop',
        status: 'active'
      });
      expect(session).toBeDefined();

      // 4. Verify relationships work
      const userWithSubscription = await databaseService.query(`
        SELECT u.*, us.subscription_tier, s.status as session_status
        FROM users u
        LEFT JOIN user_subscriptions us ON u.id = us.users_id
        LEFT JOIN sessions s ON u.id = s.users_id
        WHERE u.id = $1 AND s.id = $2
      `, [user.id, session.id]);

      expect(userWithSubscription.rows).toHaveLength(1);
      expect(userWithSubscription.rows[0].subscription_tier).toBe('free');
      expect(userWithSubscription.rows[0].session_status).toBe('active');

      // Clean up
      await databaseService.delete('sessions', session.id);
      await databaseService.delete('user_subscriptions', subscription.id);
      await databaseService.delete('users', user.id);
    });
  });
});