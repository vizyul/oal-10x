const authService = require('../../src/services/auth.service');
const airtableService = require('../../src/services/airtable.service');
const jwt = require('jsonwebtoken');

// Mock dependencies
jest.mock('../../src/services/airtable.service');
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
    // Mock Airtable base as available by default
    airtableService.base = jest.fn();
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
        id: 'rec123',
        fields: {
          'Email': 'test@example.com',
          'First Name': 'John',
          'Last Name': 'Doe',
          'Email Verified': false,
          'Status': 'pending_verification'
        }
      };

      airtableService.create.mockResolvedValue(mockRecord);

      const result = await authService.createUser(userData);

      expect(airtableService.create).toHaveBeenCalledWith('Users', {
        'Email': 'test@example.com',
        'Password': 'hashedpassword',
        'First Name': 'John',
        'Last Name': 'Doe',
        'Email Verified': false,
        'Email Verification Token': undefined,
        'Email Verification Expires': undefined,
        'Terms Accepted': true,
        'Privacy Accepted': true,
        'Status': 'pending_verification',
        'Created At': undefined,
        'Updated At': undefined
      });

      expect(result).toEqual({
        id: 'rec123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        emailVerified: false,
        status: 'pending_verification',
        subscription_tier: 'free',
        subscription_status: 'none',
        welcomeEmailSent: false,
        termsAccepted: false,
        privacyAccepted: false,
        password: undefined,
        emailVerificationToken: undefined,
        emailVerificationExpires: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        lastLoginAt: undefined,
        googleId: undefined,
        appleId: undefined,
        microsoftId: undefined,
        registrationMethod: undefined,
        welcomeEmailSentAt: undefined,
        stripe_customer_id: undefined
      });
    });

    it('should create a user with Airtable field format (OAuth)', async () => {
      const userData = {
        'Email': 'oauth@example.com',
        'First Name': 'OAuth',
        'Last Name': 'User',
        'Google ID': 'google123',
        'Registration Method': 'google',
        'Status': 'active'
      };

      const mockRecord = {
        id: 'rec456',
        fields: userData
      };

      airtableService.create.mockResolvedValue(mockRecord);

      const result = await authService.createUser(userData);

      expect(airtableService.create).toHaveBeenCalledWith('Users', userData);
      expect(result.email).toBe('oauth@example.com');
      expect(result.googleId).toBe('google123');
    });

    it('should handle database not configured error', async () => {
      airtableService.base = null;

      await expect(authService.createUser({ email: 'test@example.com' }))
        .rejects.toThrow('Failed to create user');
    });

    it('should handle Airtable creation error', async () => {
      airtableService.create.mockRejectedValue(new Error('Airtable error'));

      await expect(authService.createUser({ email: 'test@example.com' }))
        .rejects.toThrow('Failed to create user');
    });
  });

  describe('findUserByEmail', () => {
    it('should find user by email successfully', async () => {
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'test@example.com',
          'First Name': 'John',
          'Last Name': 'Doe',
          'Status': 'active'
        }
      };

      airtableService.findByField.mockResolvedValue([mockRecord]);

      const result = await authService.findUserByEmail('test@example.com');

      expect(airtableService.findByField).toHaveBeenCalledWith('Users', 'Email', 'test@example.com');
      expect(result.email).toBe('test@example.com');
      expect(result.id).toBe('rec123');
    });

    it('should return null if user not found', async () => {
      airtableService.findByField.mockResolvedValue([]);

      const result = await authService.findUserByEmail('notfound@example.com');

      expect(result).toBeNull();
    });

    it('should handle database not configured', async () => {
      airtableService.base = null;

      const result = await authService.findUserByEmail('test@example.com');

      expect(result).toBeNull();
    });

    it('should handle table not found error gracefully', async () => {
      airtableService.findByField.mockRejectedValue(new Error('Table does not exist'));

      const result = await authService.findUserByEmail('test@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findUserByAppleId', () => {
    it('should find user by Apple ID successfully', async () => {
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'apple@example.com',
          'Apple ID': 'apple123',
          'Registration Method': 'apple'
        }
      };

      airtableService.findByField.mockResolvedValue([mockRecord]);

      const result = await authService.findUserByAppleId('apple123');

      expect(airtableService.findByField).toHaveBeenCalledWith('Users', 'Apple ID', 'apple123');
      expect(result.appleId).toBe('apple123');
    });

    it('should return null if Apple user not found', async () => {
      airtableService.findByField.mockResolvedValue([]);

      const result = await authService.findUserByAppleId('notfound');

      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user with mapped fields', async () => {
      const updateData = {
        firstName: 'Updated',
        lastName: 'Name',
        emailVerified: true,
        status: 'active',
        lastLoginAt: '2023-01-01T00:00:00.000Z'
      };

      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'test@example.com',
          'First Name': 'Updated',
          'Last Name': 'Name',
          'Email Verified': true,
          'Status': 'active',
          'Last Login At': '2023-01-01T00:00:00.000Z'
        }
      };

      airtableService.update.mockResolvedValue(mockRecord);

      const result = await authService.updateUser('rec123', updateData);

      expect(airtableService.update).toHaveBeenCalledWith('Users', 'rec123', expect.objectContaining({
        'First Name': 'Updated',
        'Last Name': 'Name',
        'Email Verified': true,
        'Status': 'active',
        'Last Login At': '2023-01-01T00:00:00.000Z',
        'Updated At': expect.any(String)
      }));

      expect(result.firstName).toBe('Updated');
      expect(result.emailVerified).toBe(true);
    });

    it('should handle OAuth ID updates', async () => {
      const updateData = {
        'Google ID': 'google123',
        'Apple ID': 'apple456'
      };

      const mockRecord = {
        id: 'rec123',
        fields: {
          'Google ID': 'google123',
          'Apple ID': 'apple456'
        }
      };

      airtableService.update.mockResolvedValue(mockRecord);

      await authService.updateUser('rec123', updateData);

      expect(airtableService.update).toHaveBeenCalledWith('Users', 'rec123', expect.objectContaining({
        'Google ID': 'google123',
        'Apple ID': 'apple456'
      }));
    });
  });

  describe('verifyEmailToken', () => {
    it('should verify valid token successfully', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'test@example.com',
          'Email Verification Token': 'validtoken123',
          'Email Verification Expires': futureDate.toISOString(),
          'Email Verified': false,
          'Status': 'pending_verification'
        }
      };

      const updatedRecord = {
        id: 'rec123',
        fields: {
          ...mockRecord.fields,
          'Email Verified': true,
          'Email Verification Token': null,
          'Email Verification Expires': null,
          'Status': 'active'
        }
      };

      airtableService.findByField.mockResolvedValue([mockRecord]);
      airtableService.update.mockResolvedValue(updatedRecord);

      const result = await authService.verifyEmailToken('validtoken123');

      expect(result.emailVerified).toBe(true);
      expect(result.status).toBe('active');
      expect(airtableService.update).toHaveBeenCalledWith('Users', 'rec123', expect.objectContaining({
        'Email Verified': true,
        'Email Verification Token': null,
        'Email Verification Expires': null,
        'Status': 'active'
      }));
    });

    it('should return null for expired token', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email Verification Token': 'expiredtoken',
          'Email Verification Expires': pastDate.toISOString()
        }
      };

      airtableService.findByField.mockResolvedValue([mockRecord]);

      const result = await authService.verifyEmailToken('expiredtoken');

      expect(result).toBeNull();
    });

    it('should return null for non-existent token', async () => {
      airtableService.findByField.mockResolvedValue([]);

      const result = await authService.verifyEmailToken('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('generateToken', () => {
    it('should generate JWT token with basic payload', () => {
      const token = authService.generateToken('rec123', 'test@example.com');

      expect(typeof token).toBe('string');
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.userId).toBe('rec123');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should generate JWT token with extended user data', () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
        status: 'active',
        subscription_tier: 'premium',
        subscription_status: 'active'
      };

      const token = authService.generateToken('rec123', 'test@example.com', userData);

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      expect(decoded.firstName).toBe('John');
      expect(decoded.emailVerified).toBe(true);
      expect(decoded.subscription_tier).toBe('premium');
    });

    it('should handle token generation error', () => {
      // Temporarily break JWT_SECRET
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      expect(() => {
        authService.generateToken('rec123', 'test@example.com');
      }).toThrow('Failed to generate authentication token');

      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
    });
  });

  describe('formatUserRecord', () => {
    it('should format Airtable record correctly', () => {
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'test@example.com',
          'First Name': 'John',
          'Last Name': 'Doe',
          'Email Verified': true,
          'Status': 'active',
          'Google ID': 'google123',
          'subscription_tier': 'premium',
          'Terms Accepted': true,
          'Privacy Accepted': true
        }
      };

      const result = authService.formatUserRecord(mockRecord);

      expect(result).toEqual({
        id: 'rec123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
        emailVerified: true,
        status: 'active',
        googleId: 'google123',
        subscription_tier: 'premium',
        subscription_status: 'none',
        termsAccepted: true,
        privacyAccepted: true,
        welcomeEmailSent: false,
        password: undefined,
        emailVerificationToken: undefined,
        emailVerificationExpires: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        lastLoginAt: undefined,
        appleId: undefined,
        microsoftId: undefined,
        registrationMethod: undefined,
        welcomeEmailSentAt: undefined,
        stripe_customer_id: undefined
      });
    });

    it('should return null for invalid record', () => {
      expect(authService.formatUserRecord(null)).toBeNull();
      expect(authService.formatUserRecord({})).toBeNull();
      expect(authService.formatUserRecord({ id: 'test' })).toBeNull();
    });

    it('should handle missing optional fields', () => {
      const mockRecord = {
        id: 'rec123',
        fields: {
          'Email': 'minimal@example.com'
        }
      };

      const result = authService.formatUserRecord(mockRecord);

      expect(result.email).toBe('minimal@example.com');
      expect(result.firstName).toBeUndefined();
      expect(result.emailVerified).toBe(false);
      expect(result.status).toBe('pending');
      expect(result.subscription_tier).toBe('free');
    });
  });
});