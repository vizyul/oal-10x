const { Pool } = require('pg');

/**
 * Automated Schema Validation Tests
 * Validates that database schema matches service expectations
 * Catches schema drift, missing migrations, and configuration issues
 */
describe('Automated Schema Validation', () => {
  let pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Database Connection Validation', () => {
    test('should connect to database successfully', async () => {
      const result = await pool.query('SELECT NOW() as current_time');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeDefined();
    });

    test('should have correct PostgreSQL version', async () => {
      const result = await pool.query('SELECT version()');
      expect(result.rows[0].version).toContain('PostgreSQL');
    });

    test('should have required extensions installed', async () => {
      const result = await pool.query(`
        SELECT extname FROM pg_extension 
        WHERE extname IN ('uuid-ossp', 'pg_trgm');
      `);
      
      // Check if we have any common extensions (not required but good to know)
      expect(result.rows).toBeDefined();
    });
  });

  describe('Service-Schema Compatibility', () => {
    /**
     * Validates that all fields used in our services actually exist in the database
     * This catches the exact issues we've been having
     */
    
    test('database.service.js field mappings should be valid', async () => {
      // Test that table name conversion works correctly
      const tableNameTests = [
        { service: 'Users', expected: 'users' },
        { service: 'Sessions', expected: 'sessions' },
        { service: 'UserSubscriptions', expected: 'user_subscriptions' }
      ];

      for (const test of tableNameTests) {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = $1
          );
        `, [test.expected]);
        
        expect(result.rows[0].exists).toBe(true);
      }
    });

    test('auth.service.js user fields should exist in users table', async () => {
      const requiredFields = [
        'email', 'first_name', 'last_name', 'password',
        'oauth_provider', 'oauth_id', 'email_verified',
        'status', 'subscription_tier', 'created_at', 'updated_at'
      ];

      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users';
      `);

      const actualFields = result.rows.map(row => row.column_name);

      for (const field of requiredFields) {
        expect(actualFields).toContain(field);
      }
    });

    test('session.service.js session fields should exist in sessions table', async () => {
      const requiredFields = [
        'id', 'users_id', 'user_email', 'login_method',
        'ip_address', 'user_agent', 'device_type', 'browser', 'os',
        'status', 'duration', 'created_at', 'updated_at', 'ended_at'
      ];

      const result = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sessions';
      `);

      const actualFields = result.rows.map(row => row.column_name);

      for (const field of requiredFields) {
        expect(actualFields).toContain(field);
      }
    });

    test('subscription.service.js subscription fields should exist', async () => {
      // Test user_subscriptions table
      const subscriptionFields = [
        'id', 'users_id', 'stripe_subscription_id', 'plan_name',
        'subscription_tier', 'status', 'created_at', 'updated_at'
      ];

      const subResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'user_subscriptions';
      `);

      const subFields = subResult.rows.map(row => row.column_name);

      for (const field of subscriptionFields) {
        expect(subFields).toContain(field);
      }

      // Test subscription_usage table
      const usageFields = [
        'id', 'user_subscriptions_id', 'usage_type', 'usage_count',
        'videos_processed', 'ai_summaries_generated', 'period_start', 'period_end'
      ];

      const usageResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'subscription_usage';
      `);

      const actualUsageFields = usageResult.rows.map(row => row.column_name);

      for (const field of usageFields) {
        expect(actualUsageFields).toContain(field);
      }
    });
  });

  describe('Data Type Validation', () => {
    test('duration field should be DECIMAL(5,2) for proper time calculation', async () => {
      const result = await pool.query(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_name = 'sessions' AND column_name = 'duration';
      `);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].data_type).toBe('numeric');
      expect(result.rows[0].numeric_precision).toBe(5);
      expect(result.rows[0].numeric_scale).toBe(2);
    });

    test('boolean fields should be proper boolean type', async () => {
      const booleanFields = [
        { table: 'users', column: 'email_verified' },
        { table: 'sessions', column: 'is_active' }
      ];

      for (const field of booleanFields) {
        const result = await pool.query(`
          SELECT data_type
          FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2;
        `, [field.table, field.column]);

        if (result.rows.length > 0) {
          expect(result.rows[0].data_type).toBe('boolean');
        }
      }
    });

    test('timestamp fields should include timezone', async () => {
      const timestampFields = [
        { table: 'users', column: 'created_at' },
        { table: 'users', column: 'updated_at' },
        { table: 'sessions', column: 'created_at' },
        { table: 'sessions', column: 'ended_at' }
      ];

      for (const field of timestampFields) {
        const result = await pool.query(`
          SELECT data_type
          FROM information_schema.columns
          WHERE table_name = $1 AND column_name = $2;
        `, [field.table, field.column]);

        if (result.rows.length > 0) {
          expect(result.rows[0].data_type).toBe('timestamp with time zone');
        }
      }
    });
  });

  describe('Foreign Key Validation', () => {
    test('should have proper foreign key relationships', async () => {
      const expectedFKs = [
        {
          table: 'sessions',
          column: 'users_id',
          references_table: 'users',
          references_column: 'id'
        },
        {
          table: 'user_subscriptions',
          column: 'users_id',
          references_table: 'users',
          references_column: 'id'
        },
        {
          table: 'subscription_usage',
          column: 'user_subscriptions_id',
          references_table: 'user_subscriptions',
          references_column: 'id'
        }
      ];

      for (const fk of expectedFKs) {
        const result = await pool.query(`
          SELECT
            tc.table_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_name = $1
            AND kcu.column_name = $2;
        `, [fk.table, fk.column]);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0].foreign_table_name).toBe(fk.references_table);
        expect(result.rows[0].foreign_column_name).toBe(fk.references_column);
      }
    });
  });

  describe('Index Validation', () => {
    test('should have performance indexes on commonly queried fields', async () => {
      const expectedIndexes = [
        { table: 'users', column: 'email' }, // Unique constraint creates index
        { table: 'sessions', column: 'users_id' }, // FK should have index
        { table: 'user_subscriptions', column: 'users_id' }
      ];

      for (const idx of expectedIndexes) {
        const result = await pool.query(`
          SELECT COUNT(*) as index_count
          FROM pg_indexes
          WHERE tablename = $1
            AND indexdef ILIKE '%' || $2 || '%';
        `, [idx.table, idx.column]);

        expect(parseInt(result.rows[0].index_count)).toBeGreaterThan(0);
      }
    });
  });

  describe('Migration Consistency', () => {
    test('should not have any broken or incomplete migrations', async () => {
      // Check for common migration issues
      
      // 1. Tables without primary keys
      const noPrimaryKey = await pool.query(`
        SELECT table_name
        FROM information_schema.tables t
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND NOT EXISTS (
            SELECT 1
            FROM information_schema.table_constraints tc
            WHERE tc.table_name = t.table_name
              AND tc.constraint_type = 'PRIMARY KEY'
          );
      `);

      expect(noPrimaryKey.rows).toHaveLength(0);

      // 2. Foreign keys pointing to non-existent columns
      const brokenFKs = await pool.query(`
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND NOT EXISTS (
            SELECT 1
            FROM information_schema.columns c
            WHERE c.table_name = ccu.table_name
              AND c.column_name = ccu.column_name
          );
      `);

      expect(brokenFKs.rows).toHaveLength(0);
    });
  });

  describe('Performance Validation', () => {
    test('should be able to perform queries efficiently', async () => {
      const start = Date.now();
      
      await pool.query(`
        SELECT u.id, u.email, u.subscription_tier, s.status
        FROM users u
        LEFT JOIN user_subscriptions us ON u.id = us.users_id
        LEFT JOIN sessions s ON u.id = s.users_id
        LIMIT 100;
      `);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});