const { Pool } = require('pg');

/**
 * Database Test Setup Helper
 * Provides utilities for database testing and cleanup
 */
class DatabaseTestHelper {
  constructor() {
    this.pool = null;
    this.testData = {
      users: [],
      sessions: [],
      subscriptions: [],
      usage: []
    };
  }

  async connect() {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
      });
    }
    return this.pool;
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  /**
   * Create test user with tracking for cleanup
   */
  async createTestUser(userData = {}) {
    const pool = await this.connect();
    
    const defaultUser = {
      email: `test-${Date.now()}-${Math.random().toString(36).substring(2)}@example.com`,
      first_name: 'Test',
      last_name: 'User',
      status: 'active',
      email_verified: true,
      ...userData
    };

    const result = await pool.query(`
      INSERT INTO users (email, first_name, last_name, status, email_verified, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `, [defaultUser.email, defaultUser.first_name, defaultUser.last_name, defaultUser.status, defaultUser.email_verified]);

    const user = result.rows[0];
    this.testData.users.push(user.id);
    return user;
  }

  /**
   * Create test session with tracking for cleanup
   */
  async createTestSession(sessionData = {}) {
    const pool = await this.connect();

    // Create test user if no users_id provided
    let userId = sessionData.users_id;
    if (!userId) {
      const user = await this.createTestUser();
      userId = user.id;
    }

    const defaultSession = {
      users_id: userId,
      user_email: 'test@example.com',
      login_method: 'email',
      ip_address: '127.0.0.1',
      user_agent: 'Test Browser',
      device_type: 'desktop',
      browser: 'Chrome',
      os: 'Windows',
      status: 'active',
      ...sessionData
    };

    const result = await pool.query(`
      INSERT INTO sessions (
        users_id, user_email, login_method, ip_address, user_agent, 
        device_type, browser, os, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *;
    `, [
      defaultSession.users_id, defaultSession.user_email, defaultSession.login_method,
      defaultSession.ip_address, defaultSession.user_agent, defaultSession.device_type,
      defaultSession.browser, defaultSession.os, defaultSession.status
    ]);

    const session = result.rows[0];
    this.testData.sessions.push(session.id);
    return session;
  }

  /**
   * Create test subscription with tracking for cleanup
   */
  async createTestSubscription(subscriptionData = {}) {
    const pool = await this.connect();

    // Create test user if no users_id provided
    let userId = subscriptionData.users_id;
    if (!userId) {
      const user = await this.createTestUser();
      userId = user.id;
    }

    const defaultSubscription = {
      users_id: userId,
      stripe_subscription_id: `sub_test_${Date.now()}`,
      plan_name: 'free',
      subscription_tier: 'free',
      status: 'active',
      ...subscriptionData
    };

    const result = await pool.query(`
      INSERT INTO user_subscriptions (
        users_id, stripe_subscription_id, plan_name, subscription_tier, status, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING *;
    `, [
      defaultSubscription.users_id, defaultSubscription.stripe_subscription_id,
      defaultSubscription.plan_name, defaultSubscription.subscription_tier, defaultSubscription.status
    ]);

    const subscription = result.rows[0];
    this.testData.subscriptions.push(subscription.id);
    return subscription;
  }

  /**
   * Clean up all test data created during tests
   */
  async cleanup() {
    const pool = await this.connect();

    try {
      // Clean up in reverse dependency order
      
      // 1. Usage records
      for (const usageId of this.testData.usage) {
        await pool.query('DELETE FROM subscription_usage WHERE id = $1', [usageId]);
      }

      // 2. Sessions
      for (const sessionId of this.testData.sessions) {
        await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
      }

      // 3. Subscriptions
      for (const subscriptionId of this.testData.subscriptions) {
        await pool.query('DELETE FROM user_subscriptions WHERE id = $1', [subscriptionId]);
      }

      // 4. Users (last, due to FK constraints)
      for (const userId of this.testData.users) {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }

    } catch (error) {
      console.warn('Error during test cleanup:', error.message);
    } finally {
      // Reset tracking arrays
      this.testData = {
        users: [],
        sessions: [],
        subscriptions: [],
        usage: []
      };
    }
  }

  /**
   * Check if database is available and properly configured
   */
  async checkDatabaseHealth() {
    try {
      const pool = await this.connect();
      const result = await pool.query('SELECT NOW() as current_time, version() as version');
      return {
        available: true,
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version
      };
    } catch (error) {
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Wait for database to be ready (useful for CI environments)
   */
  async waitForDatabase(maxAttempts = 10, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const health = await this.checkDatabaseHealth();
      
      if (health.available) {
        return health;
      }

      if (attempt < maxAttempts) {
        console.log(`Database not ready (attempt ${attempt}/${maxAttempts}), waiting ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error(`Database not available after ${maxAttempts} attempts`);
  }

  /**
   * Execute raw SQL for custom test scenarios
   */
  async query(sql, params = []) {
    const pool = await this.connect();
    return pool.query(sql, params);
  }
}

// Create singleton instance for use across tests
const dbHelper = new DatabaseTestHelper();

// Export both class and instance
module.exports = {
  DatabaseTestHelper,
  dbHelper
};

// Global setup/teardown for tests
global.beforeAll(async () => {
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    try {
      await dbHelper.waitForDatabase();
      console.log('Database connection established for tests');
    } catch (error) {
      console.warn('Database not available for tests:', error.message);
      // Don't fail tests if database isn't available - some tests might be mocked
    }
  }
});

global.afterAll(async () => {
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    try {
      await dbHelper.cleanup();
      await dbHelper.disconnect();
      console.log('Database connections closed and test data cleaned up');
    } catch (error) {
      console.warn('Error during global test cleanup:', error.message);
    }
  }
});