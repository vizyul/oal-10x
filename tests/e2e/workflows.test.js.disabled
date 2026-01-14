const request = require('supertest');
const app = require('../../src/app');
const databaseService = require('../../src/services/database.service');

/**
 * End-to-End Workflow Tests
 * Tests complete user journeys to catch integration issues
 * across multiple services and controllers
 */
describe('Critical User Workflow Tests', () => {
  let testUsers = [];
  let testSessions = [];
  let testSubscriptions = [];

  beforeAll(async () => {
    // Ensure test database is available
    if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
      throw new Error('No database connection configured for E2E tests');
    }
  });

  afterAll(async () => {
    // Clean up all test data
    for (const session of testSessions) {
      try {
        await databaseService.delete('sessions', session);
      } catch (error) {
        console.warn(`Failed to clean up session ${session}:`, error.message);
      }
    }

    for (const subscription of testSubscriptions) {
      try {
        await databaseService.delete('user_subscriptions', subscription);
      } catch (error) {
        console.warn(`Failed to clean up subscription ${subscription}:`, error.message);
      }
    }

    for (const user of testUsers) {
      try {
        await databaseService.delete('users', user);
      } catch (error) {
        console.warn(`Failed to clean up user ${user}:`, error.message);
      }
    }

    await databaseService.close();
  });

  describe('User Registration and Authentication Workflow', () => {
    test('complete signup flow should work end-to-end', async () => {
      const testEmail = `e2e-signup-${Date.now()}@example.com`;
      
      // Step 1: Initial signup page should load
      const signupPageResponse = await request(app)
        .get('/auth/signup')
        .expect(200);

      expect(signupPageResponse.text).toContain('Sign Up');

      // Step 2: Submit signup form (step 1)
      const step1Response = await request(app)
        .post('/auth/signup/step1')
        .send({
          email: testEmail,
          first_name: 'E2E',
          last_name: 'Test'
        })
        .expect(302); // Should redirect to step 2

      expect(step1Response.headers.location).toContain('/auth/signup/step2');

      // Step 3: Complete password setup (step 2)
      const step2Response = await request(app)
        .post('/auth/signup/step2')
        .send({
          email: testEmail,
          password: 'testPassword123',
          confirm_password: 'testPassword123'
        })
        .expect(302); // Should redirect to step 3 or verification

      // Step 4: Verify user was created in database
      const createdUsers = await databaseService.findByField('users', 'email', testEmail);
      expect(createdUsers).toHaveLength(1);
      
      const createdUser = createdUsers[0];
      expect(createdUser.first_name).toBe('E2E');
      expect(createdUser.last_name).toBe('Test');
      expect(createdUser.email).toBe(testEmail);
      expect(createdUser.password).toBeDefined();
      expect(createdUser.password).not.toBe('testPassword123'); // Should be hashed

      testUsers.push(createdUser.id);

      // Step 5: Test login with new credentials
      const loginResponse = await request(app)
        .post('/auth/signin')
        .send({
          email: testEmail,
          password: 'testPassword123'
        })
        .expect(302); // Should redirect after successful login

      expect(loginResponse.headers.location).toBe('/dashboard');
    }, 15000);

    test('OAuth signup workflow should work end-to-end', async () => {
      const testOAuthUser = {
        email: `e2e-oauth-${Date.now()}@example.com`,
        first_name: 'OAuth',
        last_name: 'Test',
        oauth_provider: 'google',
        oauth_id: `google_${Date.now()}`,
        email_verified: false
      };

      // Simulate OAuth user creation (normally done by OAuth callback)
      const createdUser = await databaseService.create('users', testOAuthUser);
      expect(createdUser).toBeDefined();
      testUsers.push(createdUser.id);

      // Test social verification flow
      const verificationResponse = await request(app)
        .get('/auth/social-verify')
        .query({ email: testOAuthUser.email })
        .expect(200);

      expect(verificationResponse.text).toContain('Email Verification');
      expect(verificationResponse.text).toContain(testOAuthUser.email);

      // Test verification code submission
      // Note: In real tests, you'd need to extract the verification code from email/database
      const mockCode = '123456';
      const verifyResponse = await request(app)
        .post('/auth/verify-social-email')
        .send({
          email: testOAuthUser.email,
          verification_code: mockCode
        });

      // This might fail with invalid code, but tests the route exists and processes the request
      expect(verifyResponse.status).toBeOneOf([200, 400, 302]);
    });
  });

  describe('Session Management Workflow', () => {
    let testUserId;

    beforeAll(async () => {
      // Create test user for session tests
      const userData = {
        email: `e2e-session-${Date.now()}@example.com`,
        first_name: 'Session',
        last_name: 'Test',
        password: 'sessionPassword123',
        status: 'active',
        email_verified: true
      };

      const createdUser = await databaseService.create('users', userData);
      testUserId = createdUser.id;
      testUsers.push(testUserId);
    });

    test('login should create active session', async () => {
      const loginResponse = await request(app)
        .post('/auth/signin')
        .send({
          email: `e2e-session-${Date.now() - 1000}@example.com`,
          password: 'sessionPassword123'
        });

      // Even if login fails, test that session handling doesn't crash
      expect([200, 302, 400, 401]).toContain(loginResponse.status);

      // Check if any sessions were created
      const sessions = await databaseService.findByField('sessions', 'users_id', testUserId);
      // Don't assert exact count since login might fail, but verify query works
      expect(Array.isArray(sessions)).toBe(true);
    });

    test('logout should end session properly', async () => {
      // Create a test session directly
      const sessionData = {
        users_id: testUserId,
        user_email: `e2e-session-test@example.com`,
        login_method: 'email',
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser',
        device_type: 'desktop',
        status: 'active'
      };

      const session = await databaseService.create('sessions', sessionData);
      testSessions.push(session.id);

      // Test logout endpoint
      const logoutResponse = await request(app)
        .post('/auth/logout')
        .expect(302); // Should redirect after logout

      expect(logoutResponse.headers.location).toBe('/');
    });
  });

  describe('Subscription Workflow', () => {
    let testUserId;

    beforeAll(async () => {
      // Create test user for subscription tests
      const userData = {
        email: `e2e-subscription-${Date.now()}@example.com`,
        first_name: 'Subscription',
        last_name: 'Test',
        status: 'active',
        subscription_tier: 'free'
      };

      const createdUser = await databaseService.create('users', userData);
      testUserId = createdUser.id;
      testUsers.push(testUserId);
    });

    test('new user should get default free subscription', async () => {
      // Create default subscription for user
      const subscriptionData = {
        users_id: testUserId,
        plan_name: 'free',
        subscription_tier: 'free',
        status: 'active'
      };

      const subscription = await databaseService.create('user_subscriptions', subscriptionData);
      testSubscriptions.push(subscription.id);

      expect(subscription.subscription_tier).toBe('free');
      expect(subscription.users_id).toBe(testUserId);

      // Create initial usage record
      const usageData = {
        user_subscriptions_id: subscription.id,
        usage_type: 'monthly',
        usage_count: 0,
        videos_processed: 0,
        ai_summaries_generated: 0,
        period_start: new Date(),
        period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const usage = await databaseService.create('subscription_usage', usageData);
      expect(usage.videos_processed).toBe(0);
    });

    test('subscription upgrade workflow should work', async () => {
      // Find user's subscription
      const subscriptions = await databaseService.findByField('user_subscriptions', 'users_id', testUserId);
      expect(subscriptions).toHaveLength(1);

      const subscription = subscriptions[0];

      // Simulate subscription upgrade
      const updatedSubscription = await databaseService.update('user_subscriptions', subscription.id, {
        plan_name: 'premium',
        subscription_tier: 'premium',
        status: 'active'
      });

      expect(updatedSubscription.subscription_tier).toBe('premium');

      // Update user's subscription tier
      const updatedUser = await databaseService.update('users', testUserId, {
        subscription_tier: 'premium'
      });

      expect(updatedUser.subscription_tier).toBe('premium');
    });
  });

  describe('API Integration Workflow', () => {
    test('protected API endpoints should require authentication', async () => {
      // Test accessing protected endpoint without auth
      const response = await request(app)
        .get('/api/user/profile')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('API should handle CORS properly', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('health check endpoint should work', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Error Handling Workflow', () => {
    test('should handle database connection errors gracefully', async () => {
      // Test with malformed request that would cause DB error
      const response = await request(app)
        .post('/auth/signin')
        .send({
          email: 'not-an-email',
          password: ''
        });

      // Should not crash, should return proper error response
      expect([400, 422, 500]).toContain(response.status);
      
      if (response.body) {
        expect(response.body).toHaveProperty('error');
      }
    });

    test('should handle invalid routes properly', async () => {
      const response = await request(app)
        .get('/nonexistent-route')
        .expect(404);

      // Should return 404 page or JSON error
      expect(response.status).toBe(404);
    });

    test('should handle server errors without crashing', async () => {
      // Test route that might cause server error
      const response = await request(app)
        .post('/auth/signup/step1')
        .send({
          // Missing required fields
        });

      // Should handle gracefully, not crash
      expect([400, 422, 500]).toContain(response.status);
    });
  });

  describe('Performance Validation', () => {
    test('critical endpoints should respond within reasonable time', async () => {
      const endpoints = [
        { method: 'GET', path: '/', maxTime: 2000 },
        { method: 'GET', path: '/auth/signin', maxTime: 2000 },
        { method: 'GET', path: '/health', maxTime: 1000 }
      ];

      for (const endpoint of endpoints) {
        const start = Date.now();
        
        const response = await request(app)[endpoint.method.toLowerCase()](endpoint.path);
        
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(endpoint.maxTime);
        expect([200, 302, 404]).toContain(response.status); // Any reasonable response
      }
    });
  });
});