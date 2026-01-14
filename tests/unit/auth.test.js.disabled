const authService = require('../../src/services/auth.service');
const database = require('../../src/services/database.service');

// Mock dependencies
jest.mock('../../src/services/database.service');
jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock database pool as available by default
    database.pool = jest.fn();
  });

  describe('createUser', () => {
    it('should create a user with camelCase format', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'hashedpassword',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: false,
        termsAccepted: true,
        privacyAccepted: true,
        status: 'pending_verification'
      };

      const mockRecord = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: false,
        status: 'pending_verification'
      };

      database.create.mockResolvedValue(mockRecord);

      const result = await authService.createUser(userData);

      expect(database.create).toHaveBeenCalledWith('users', {
        email: 'test@example.com',
        password: 'hashedpassword',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: false,
        terms_accepted: true,
        privacy_accepted: true,
        status: 'pending_verification',
        subscription_tier: 'free',
        subscription_status: 'none',
        email_verification_token: undefined,
        email_verification_expires: undefined,
        password_reset_token: undefined,
        password_reset_expires: undefined,
        google_id: undefined,
        microsoft_id: undefined,
        apple_id: undefined,
        registration_method: undefined,
        stripe_customer_id: undefined
      });

      expect(result).toEqual(mockRecord);
    });

    it('should handle database errors', async () => {
      database.create.mockRejectedValue(new Error('Database error'));

      await expect(authService.createUser({ email: 'test@example.com' }))
        .rejects.toThrow('Failed to create user');
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email successfully', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe'
      };

      database.findByField.mockResolvedValue([mockUser]);

      const result = await authService.findUserByEmail('test@example.com');

      expect(database.findByField).toHaveBeenCalledWith('users', 'email', 'test@example.com');
      expect(result).toEqual(mockUser);
    });

    it('should return null if user not found', async () => {
      database.findByField.mockResolvedValue([]);

      const result = await authService.findUserByEmail('notfound@example.com');

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      database.findByField.mockRejectedValue(new Error('Database error'));

      await expect(authService.findUserByEmail('test@example.com'))
        .rejects.toThrow('Failed to find user by email');
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      const updateData = { first_name: 'Jane', email_verified: true };
      const mockUpdatedUser = { id: 1, ...updateData };

      database.update.mockResolvedValue([mockUpdatedUser]);

      const result = await authService.updateUser(1, updateData);

      expect(database.update).toHaveBeenCalledWith('users', 1, updateData);
      expect(result).toEqual(mockUpdatedUser);
    });

    it('should handle update errors', async () => {
      database.update.mockRejectedValue(new Error('Update failed'));

      await expect(authService.updateUser(1, { first_name: 'Jane' }))
        .rejects.toThrow('Failed to update user');
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      database.delete.mockResolvedValue({ success: true });

      const result = await authService.deleteUser(1);

      expect(database.delete).toHaveBeenCalledWith('users', 1);
      expect(result).toEqual({ success: true });
    });

    it('should handle delete errors', async () => {
      database.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(authService.deleteUser(1))
        .rejects.toThrow('Failed to delete user');
    });
  });

  describe('generateTokens', () => {
    beforeAll(() => {
      process.env.JWT_SECRET = 'test-secret';
    });

    it('should generate JWT token successfully', () => {
      const user = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe'
      };

      const result = authService.generateTokens(user);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('should handle missing JWT secret', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => {
        authService.generateTokens({ id: 1, email: 'test@example.com' });
      }).toThrow();

      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('verifyPassword', () => {
    it('should verify password successfully', async () => {
      const hashedPassword = '$2b$10$examplehashedpassword';
      const plainPassword = 'plainpassword';

      // Mock bcrypt.compare to return true
      jest.doMock('bcryptjs', () => ({
        compare: jest.fn().mockResolvedValue(true)
      }));

      const bcrypt = require('bcryptjs');
      const result = await authService.verifyPassword(plainPassword, hashedPassword);

      expect(bcrypt.compare).toHaveBeenCalledWith(plainPassword, hashedPassword);
      expect(result).toBe(true);
    });
  });
});