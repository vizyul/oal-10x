/**
 * Auth Service Unit Tests
 * Tests for src/services/auth.service.js
 */

// Mock dependencies before requiring the service
jest.mock('../../../src/models', () => ({
  user: {
    createUser: jest.fn(),
    findByEmail: jest.fn(),
    findByEmailWithPassword: jest.fn(),
    findById: jest.fn(),
    findByField: jest.fn(),
    findByOAuth: jest.fn(),
    updateUser: jest.fn(),
    findAll: jest.fn(),
    resolveUserId: jest.fn()
  }
}));

jest.mock('jsonwebtoken');
jest.mock('bcryptjs');

const authService = require('../../../src/services/auth.service');
const { user: UserModel } = require('../../../src/models');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_EXPIRES_IN = '7d';
  });

  describe('createUser', () => {
    const mockUserData = {
      email: 'test@example.com',
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe'
    };

    const mockCreatedUser = {
      id: 1,
      email: 'test@example.com',
      first_name: 'John',
      last_name: 'Doe',
      status: 'pending',
      email_verified: false
    };

    it('should create a user with hashed password', async () => {
      bcrypt.hash.mockResolvedValue('hashedPassword123');
      UserModel.createUser.mockResolvedValue(mockCreatedUser);

      const result = await authService.createUser(mockUserData);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(UserModel.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com',
        password: 'hashedPassword123',
        first_name: 'John',
        last_name: 'Doe'
      }));
      expect(result).toHaveProperty('id', 1);
      expect(result).toHaveProperty('email', 'test@example.com');
    });

    it('should create user with Airtable-style field names (OAuth)', async () => {
      const oauthUserData = {
        'Email': 'oauth@example.com',
        'First Name': 'OAuth',
        'Last Name': 'User',
        'OAuth Provider': 'google',
        'OAuth ID': 'google123'
      };

      UserModel.createUser.mockResolvedValue({
        id: 2,
        email: 'oauth@example.com',
        first_name: 'OAuth',
        last_name: 'User',
        oauth_provider: 'google',
        oauth_id: 'google123'
      });

      const result = await authService.createUser(oauthUserData);

      expect(UserModel.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'oauth@example.com',
        oauth_provider: 'google',
        oauth_id: 'google123'
      }));
      expect(result).toHaveProperty('email', 'oauth@example.com');
    });

    it('should throw error when user creation fails', async () => {
      UserModel.createUser.mockRejectedValue(new Error('Database error'));

      await expect(authService.createUser(mockUserData))
        .rejects.toThrow('Failed to create user');
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        status: 'active'
      };
      UserModel.findByEmail.mockResolvedValue(mockUser);

      const result = await authService.findUserByEmail('test@example.com');

      expect(UserModel.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(result).toHaveProperty('email', 'test@example.com');
      expect(result).toHaveProperty('firstName', 'John');
    });

    it('should return null when user not found', async () => {
      UserModel.findByEmail.mockResolvedValue(null);

      const result = await authService.findUserByEmail('notfound@example.com');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      UserModel.findByEmail.mockRejectedValue(new Error('Database error'));

      const result = await authService.findUserByEmail('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findUserByEmailForVerification', () => {
    it('should return user with verification fields', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        email_verification_token: 'token123',
        email_verification_expires: '2025-12-31T00:00:00Z'
      };
      UserModel.findByEmailWithPassword.mockResolvedValue(mockUser);

      const result = await authService.findUserByEmailForVerification('test@example.com');

      expect(result).toHaveProperty('emailVerificationToken', 'token123');
      expect(result).toHaveProperty('emailVerificationExpires', '2025-12-31T00:00:00Z');
    });

    it('should return null when user not found', async () => {
      UserModel.findByEmailWithPassword.mockResolvedValue(null);

      const result = await authService.findUserByEmailForVerification('notfound@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findUserByEmailForAuth', () => {
    it('should return user with password for authentication', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword',
        first_name: 'John'
      };
      UserModel.findByEmailWithPassword.mockResolvedValue(mockUser);

      const result = await authService.findUserByEmailForAuth('test@example.com');

      expect(result).toHaveProperty('password', 'hashedPassword');
    });
  });

  describe('findUserById', () => {
    it('should find user by ID', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John'
      };
      UserModel.findById.mockResolvedValue(mockUser);

      const result = await authService.findUserById(1);

      expect(UserModel.findById).toHaveBeenCalledWith(1);
      expect(result).toHaveProperty('id', 1);
    });

    it('should return null when user not found', async () => {
      UserModel.findById.mockResolvedValue(null);

      const result = await authService.findUserById(999);

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      UserModel.findById.mockRejectedValue(new Error('Database error'));

      await expect(authService.findUserById(1))
        .rejects.toThrow('Failed to find user');
    });
  });

  describe('findUserByAppleId', () => {
    it('should find user by Apple OAuth ID', async () => {
      const mockUser = {
        id: 1,
        email: 'apple@example.com',
        oauth_provider: 'apple',
        oauth_id: 'apple123'
      };
      UserModel.findByOAuth.mockResolvedValue(mockUser);

      const result = await authService.findUserByAppleId('apple123');

      expect(UserModel.findByOAuth).toHaveBeenCalledWith('apple', 'apple123');
      expect(result).toHaveProperty('oauthProvider', 'apple');
    });

    it('should return null when Apple user not found', async () => {
      UserModel.findByOAuth.mockResolvedValue(null);

      const result = await authService.findUserByAppleId('notfound');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      const mockUpdatedUser = {
        id: 1,
        email: 'test@example.com',
        first_name: 'Jane',
        last_name: 'Smith'
      };
      UserModel.updateUser.mockResolvedValue(mockUpdatedUser);

      const result = await authService.updateUser(1, {
        firstName: 'Jane',
        lastName: 'Smith'
      });

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
        first_name: 'Jane',
        last_name: 'Smith'
      }));
      expect(result).toHaveProperty('firstName', 'Jane');
    });

    it('should map OAuth ID fields correctly', async () => {
      UserModel.updateUser.mockResolvedValue({ id: 1, oauth_provider: 'google', oauth_id: 'google123' });

      await authService.updateUser(1, { 'Google ID': 'google123' });

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
        oauth_provider: 'google',
        oauth_id: 'google123'
      }));
    });

    it('should throw error on update failure', async () => {
      UserModel.updateUser.mockRejectedValue(new Error('Database error'));

      await expect(authService.updateUser(1, { firstName: 'Jane' }))
        .rejects.toThrow('Failed to update user');
    });
  });

  describe('verifyEmailToken', () => {
    it('should verify valid email token and update user', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        email_verification_token: 'validtoken',
        email_verification_expires: new Date(Date.now() + 3600000).toISOString()
      };
      UserModel.findByField.mockResolvedValue(mockUser);
      UserModel.updateUser.mockResolvedValue({
        ...mockUser,
        email_verified: true,
        status: 'active'
      });

      const result = await authService.verifyEmailToken('validtoken');

      expect(UserModel.findByField).toHaveBeenCalledWith('email_verification_token', 'validtoken');
      expect(result).toHaveProperty('emailVerified', true);
    });

    it('should return null for invalid token', async () => {
      UserModel.findByField.mockResolvedValue(null);

      const result = await authService.verifyEmailToken('invalidtoken');

      expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
      const mockUser = {
        id: 1,
        email_verification_token: 'expiredtoken',
        email_verification_expires: new Date(Date.now() - 3600000).toISOString()
      };
      UserModel.findByField.mockResolvedValue(mockUser);

      const result = await authService.verifyEmailToken('expiredtoken');

      expect(result).toBeNull();
    });
  });

  describe('deleteUser', () => {
    it('should soft delete user by setting status to deleted', async () => {
      UserModel.updateUser.mockResolvedValue({
        id: 1,
        status: 'deleted'
      });

      const result = await authService.deleteUser(1);

      expect(UserModel.updateUser).toHaveBeenCalledWith(1, { status: 'deleted' });
      expect(result).toHaveProperty('status', 'deleted');
    });

    it('should throw error on delete failure', async () => {
      UserModel.updateUser.mockRejectedValue(new Error('Database error'));

      await expect(authService.deleteUser(1))
        .rejects.toThrow('Failed to delete user');
    });
  });

  describe('formatUserRecord', () => {
    it('should format PostgreSQL record to user object', () => {
      const record = {
        id: 1,
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        email_verified: true,
        status: 'active',
        oauth_provider: 'google',
        oauth_id: 'google123',
        subscription_tier: 'premium'
      };

      const result = authService.formatUserRecord(record);

      expect(result).toEqual(expect.objectContaining({
        id: 1,
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        emailVerified: true,
        status: 'active',
        oauthProvider: 'google',
        oauthId: 'google123',
        googleId: 'google123',
        appleId: null,
        microsoftId: null,
        subscription_tier: 'premium'
      }));
    });

    it('should return null for null record', () => {
      const result = authService.formatUserRecord(null);
      expect(result).toBeNull();
    });

    it('should handle record with fields property', () => {
      const record = {
        id: 1,
        fields: {
          email: 'test@example.com',
          first_name: 'John'
        }
      };

      const result = authService.formatUserRecord(record);

      expect(result).toHaveProperty('email', 'test@example.com');
    });
  });

  describe('generateToken', () => {
    it('should generate JWT token with user data', () => {
      jwt.sign.mockReturnValue('mock-jwt-token');

      const result = authService.generateToken(1, 'test@example.com', {
        firstName: 'John',
        subscription_tier: 'premium'
      });

      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          email: 'test@example.com',
          firstName: 'John',
          subscription_tier: 'premium'
        }),
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(result).toBe('mock-jwt-token');
    });

    it('should generate token without user data', () => {
      jwt.sign.mockReturnValue('simple-token');

      const result = authService.generateToken(1, 'test@example.com');

      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 1, email: 'test@example.com' },
        'test-secret',
        { expiresIn: '7d' }
      );
      expect(result).toBe('simple-token');
    });

    it('should throw error when JWT signing fails', () => {
      jwt.sign.mockImplementation(() => {
        throw new Error('JWT error');
      });

      expect(() => authService.generateToken(1, 'test@example.com'))
        .toThrow('Failed to generate authentication token');
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockUsers = [
        { id: 1, status: 'active', email_verified: true },
        { id: 2, status: 'active', email_verified: true },
        { id: 3, status: 'pending_verification', email_verified: false }
      ];
      UserModel.findAll.mockResolvedValue(mockUsers);

      const result = await authService.getUserStats();

      expect(result).toEqual({
        total: 3,
        active: 2,
        pending: 1,
        verified: 2,
        unverified: 1
      });
    });

    it('should throw error on failure', async () => {
      UserModel.findAll.mockRejectedValue(new Error('Database error'));

      await expect(authService.getUserStats())
        .rejects.toThrow('Failed to get user statistics');
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate user with valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword',
        first_name: 'John'
      };
      UserModel.findByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await authService.authenticateUser('test@example.com', 'password123');

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(result).toHaveProperty('email', 'test@example.com');
    });

    it('should return null for invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword'
      };
      UserModel.findByEmail.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const result = await authService.authenticateUser('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      UserModel.findByEmail.mockResolvedValue(null);

      const result = await authService.authenticateUser('notfound@example.com', 'password');

      expect(result).toBeNull();
    });

    it('should return null for OAuth user without password', async () => {
      const mockUser = {
        id: 1,
        email: 'oauth@example.com',
        password: null,
        oauth_provider: 'google'
      };
      UserModel.findByEmail.mockResolvedValue(mockUser);

      const result = await authService.authenticateUser('oauth@example.com', 'password');

      expect(result).toBeNull();
    });
  });

  describe('createOAuthUser', () => {
    it('should create OAuth user with normalized fields', async () => {
      const oauthData = {
        email: 'oauth@example.com',
        first_name: 'OAuth',
        last_name: 'User',
        oauth_provider: 'google',
        oauth_id: 'google123'
      };
      const mockCreatedUser = {
        id: 1,
        ...oauthData,
        email_verified: true,
        status: 'active'
      };
      UserModel.createUser.mockResolvedValue(mockCreatedUser);

      const result = await authService.createOAuthUser(oauthData);

      expect(UserModel.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'oauth@example.com',
        oauth_provider: 'google',
        oauth_id: 'google123',
        email_verified: true,
        status: 'active'
      }));
      expect(result).toHaveProperty('oauthProvider', 'google');
    });

    it('should throw error when OAuth provider is missing', async () => {
      const invalidData = {
        email: 'test@example.com',
        oauth_id: 'id123'
      };

      await expect(authService.createOAuthUser(invalidData))
        .rejects.toThrow('OAuth provider and ID are required');
    });

    it('should throw error when OAuth ID is missing', async () => {
      const invalidData = {
        email: 'test@example.com',
        oauth_provider: 'google'
      };

      await expect(authService.createOAuthUser(invalidData))
        .rejects.toThrow('OAuth provider and ID are required');
    });
  });

  describe('findUserByOAuth', () => {
    it('should find user by OAuth provider and ID', async () => {
      const mockUser = {
        id: 1,
        email: 'oauth@example.com',
        oauth_provider: 'google',
        oauth_id: 'google123'
      };
      UserModel.findByOAuth.mockResolvedValue(mockUser);

      const result = await authService.findUserByOAuth('google', 'google123');

      expect(UserModel.findByOAuth).toHaveBeenCalledWith('google', 'google123');
      expect(result).toHaveProperty('oauthProvider', 'google');
    });

    it('should return null when OAuth user not found', async () => {
      UserModel.findByOAuth.mockResolvedValue(null);

      const result = await authService.findUserByOAuth('google', 'notfound');

      expect(result).toBeNull();
    });

    it('should throw error on database failure', async () => {
      UserModel.findByOAuth.mockRejectedValue(new Error('Database error'));

      await expect(authService.findUserByOAuth('google', 'id123'))
        .rejects.toThrow('Failed to find user by OAuth credentials');
    });
  });
});
