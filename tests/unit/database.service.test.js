const databaseService = require('../../src/services/database.service');

// Mock pg and utils
jest.mock('pg');
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('DatabaseService', () => {
  let originalPool;

  beforeEach(() => {
    jest.clearAllMocks();
    originalPool = databaseService.pool;
  });

  afterEach(() => {
    databaseService.pool = originalPool;
  });

  describe('query method', () => {
    it('should throw error when pool is not configured', async () => {
      databaseService.pool = null;

      await expect(databaseService.query('SELECT 1'))
        .rejects.toThrow('PostgreSQL not configured');
    });

    it('should execute query successfully', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 1, name: 'test' }],
          rowCount: 1
        })
      };
      
      databaseService.pool = mockPool;

      const result = await databaseService.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
    });

    it('should handle query errors', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Query failed'))
      };
      
      databaseService.pool = mockPool;

      await expect(databaseService.query('INVALID SQL'))
        .rejects.toThrow('Query failed');
    });

    it('should log slow queries', async () => {
      const mockPool = {
        query: jest.fn().mockImplementation(() => {
          // Simulate slow query
          return new Promise(resolve => {
            setTimeout(() => resolve({ rows: [], rowCount: 0 }), 600);
          });
        })
      };
      
      databaseService.pool = mockPool;

      await databaseService.query('SELECT * FROM large_table');

      expect(mockPool.query).toHaveBeenCalled();
    });
  });

  describe('findByField method', () => {
    it('should find records by field value', async () => {
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ id: 1, email: 'test@example.com' }],
          rowCount: 1
        })
      };
      
      databaseService.pool = mockPool;
      
      // Mock formatRecords method
      databaseService.formatRecords = jest.fn().mockReturnValue([{ id: 1, email: 'test@example.com' }]);

      const result = await databaseService.findByField('Users', 'email', 'test@example.com');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1',
        ['test@example.com']
      );
      expect(result).toEqual([{ id: 1, email: 'test@example.com' }]);
    });

    it('should handle database errors', async () => {
      const mockPool = {
        query: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      
      databaseService.pool = mockPool;

      await expect(databaseService.findByField('Users', 'email', 'test@example.com'))
        .rejects.toThrow('Failed to find records in Users');
    });
  });

  describe('close method', () => {
    it('should close database connections', async () => {
      const mockPool = {
        end: jest.fn().mockResolvedValue()
      };
      
      databaseService.pool = mockPool;

      await databaseService.close();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle case when pool is null', async () => {
      databaseService.pool = null;

      // Should not throw error
      await expect(databaseService.close()).resolves.not.toThrow();
    });
  });

  describe('service initialization', () => {
    it('should handle missing DATABASE_URL gracefully', () => {
      // The service should initialize without throwing
      // even when DATABASE_URL is not set
      expect(typeof databaseService).toBe('object');
      expect(typeof databaseService.query).toBe('function');
    });
  });
});