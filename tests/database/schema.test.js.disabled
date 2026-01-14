const { Pool } = require('pg');

/**
 * Schema Integration Tests
 * Tests actual database schema against our service expectations
 * This catches missing columns, wrong types, and schema mismatches
 */
describe('Database Schema Integration Tests', () => {
  let pool;
  
  beforeAll(async () => {
    // Use test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('Required Tables Exist', () => {
    const requiredTables = [
      'users', 
      'sessions', 
      'user_subscriptions', 
      'subscription_usage',
      'subscription_events'
    ];

    test.each(requiredTables)('table %s should exist', async (tableName) => {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [tableName]);
      
      expect(result.rows[0].exists).toBe(true);
    });
  });

  describe('Users Table Schema', () => {
    let userColumns;

    beforeAll(async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users'
        ORDER BY ordinal_position;
      `);
      userColumns = result.rows;
    });

    const requiredUserColumns = [
      { name: 'id', type: 'integer', nullable: 'NO' },
      { name: 'email', type: 'character varying', nullable: 'NO' },
      { name: 'first_name', type: 'character varying', nullable: 'YES' },
      { name: 'last_name', type: 'character varying', nullable: 'YES' },
      { name: 'password', type: 'character varying', nullable: 'YES' },
      { name: 'oauth_provider', type: 'character varying', nullable: 'YES' },
      { name: 'oauth_id', type: 'character varying', nullable: 'YES' },
      { name: 'subscription_tier', type: 'character varying', nullable: 'YES' },
      { name: 'email_verified', type: 'boolean', nullable: 'YES' },
      { name: 'status', type: 'character varying', nullable: 'YES' },
      { name: 'created_at', type: 'timestamp with time zone', nullable: 'YES' },
      { name: 'updated_at', type: 'timestamp with time zone', nullable: 'YES' }
    ];

    test.each(requiredUserColumns)('should have column $name with correct type and nullable', (expectedColumn) => {
      const actualColumn = userColumns.find(col => col.column_name === expectedColumn.name);
      
      expect(actualColumn).toBeDefined();
      expect(actualColumn.data_type).toBe(expectedColumn.type);
      expect(actualColumn.is_nullable).toBe(expectedColumn.nullable);
    });

    test('should have unique constraint on email', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as constraint_count
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'users' 
          AND tc.constraint_type = 'UNIQUE' 
          AND kcu.column_name = 'email';
      `);
      
      expect(parseInt(result.rows[0].constraint_count)).toBeGreaterThan(0);
    });
  });

  describe('Sessions Table Schema', () => {
    test('should have correct duration column type for hour.minute format', async () => {
      const result = await pool.query(`
        SELECT data_type, numeric_precision, numeric_scale
        FROM information_schema.columns 
        WHERE table_name = 'sessions' AND column_name = 'duration';
      `);
      
      expect(result.rows[0].data_type).toBe('numeric');
      expect(result.rows[0].numeric_precision).toBe(5);
      expect(result.rows[0].numeric_scale).toBe(2);
    });

    test('should have foreign key to users table', async () => {
      const result = await pool.query(`
        SELECT COUNT(*) as fk_count
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'sessions' 
          AND tc.constraint_type = 'FOREIGN KEY'
          AND ccu.table_name = 'users';
      `);
      
      expect(parseInt(result.rows[0].fk_count)).toBeGreaterThan(0);
    });
  });

  describe('Subscription Tables Relationships', () => {
    test('user_subscriptions should have foreign key to users', async () => {
      const result = await pool.query(`
        SELECT ccu.table_name AS foreign_table_name,
               ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'user_subscriptions' 
          AND tc.constraint_type = 'FOREIGN KEY';
      `);
      
      const userFK = result.rows.find(row => row.foreign_table_name === 'users');
      expect(userFK).toBeDefined();
    });

    test('subscription_usage should have foreign key to user_subscriptions', async () => {
      const result = await pool.query(`
        SELECT ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
        WHERE tc.table_name = 'subscription_usage' 
          AND tc.constraint_type = 'FOREIGN KEY';
      `);
      
      const subscriptionFK = result.rows.find(row => row.foreign_table_name === 'user_subscriptions');
      expect(subscriptionFK).toBeDefined();
    });
  });

  describe('Database Connection and Permissions', () => {
    test('should be able to perform basic CRUD operations', async () => {
      // Test INSERT
      const testUser = {
        email: `test-${Date.now()}@schema.test`,
        first_name: 'Schema',
        last_name: 'Test',
        status: 'active'
      };

      const insertResult = await pool.query(`
        INSERT INTO users (email, first_name, last_name, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        RETURNING id, email;
      `, [testUser.email, testUser.first_name, testUser.last_name, testUser.status]);

      expect(insertResult.rows).toHaveLength(1);
      expect(insertResult.rows[0].email).toBe(testUser.email);

      const userId = insertResult.rows[0].id;

      // Test SELECT
      const selectResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      expect(selectResult.rows).toHaveLength(1);
      expect(selectResult.rows[0].first_name).toBe(testUser.first_name);

      // Test UPDATE
      const updateResult = await pool.query(`
        UPDATE users SET first_name = $1, updated_at = NOW() 
        WHERE id = $2 RETURNING first_name;
      `, ['Updated', userId]);

      expect(updateResult.rows[0].first_name).toBe('Updated');

      // Test DELETE
      const deleteResult = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      expect(deleteResult.rowCount).toBe(1);
    });
  });
});