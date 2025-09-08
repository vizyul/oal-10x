const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/auth.service');
const sessionService = require('../../src/services/session.service');
const emailService = require('../../src/services/email.service');

// Mock services - these are singleton instances, not classes
jest.mock('../../src/services/auth.service', () => ({
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  verifyPassword: jest.fn(),
  generateTokens: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  verifyEmailToken: jest.fn(),
  hashPassword: jest.fn()
}));

jest.mock('../../src/services/session.service', () => ({
  createSession: jest.fn(),
  getSession: jest.fn(),
  deleteSession: jest.fn(),
  updateSession: jest.fn()
}));

jest.mock('../../src/services/email.service', () => ({
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendEmail: jest.fn()
}));

jest.mock('../../src/utils', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Auth Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /auth/sign-up', () => {
    it('should render sign up page', async () => {
      const response = await request(app)
        .get('/auth/sign-up')
        .expect(200);

      expect(response.text).toContain('sign-up');
    });
  });

  describe('POST /auth/sign-up/send-code', () => {
    it('should send verification code for valid email', async () => {
      authService.findUserByEmail.mockResolvedValue(null);
      emailService.sendVerificationEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/auth/sign-up/send-code')
        .send({ email: 'test@example.com' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Verification code sent to your email'
      });

      expect(authService.findUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should reject existing user email', async () => {
      authService.findUserByEmail.mockResolvedValue({ 
        id: 'existing',
        email: 'existing@example.com'
      });

      const response = await request(app)
        .post('/auth/sign-up/send-code')
        .send({ email: 'existing@example.com' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'An account with this email already exists'
      });
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/auth/sign-up/send-code')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    it('should enforce rate limiting', async () => {
      authService.findUserByEmail.mockResolvedValue(null);
      emailService.sendVerificationEmail.mockResolvedValue(true);

      // Make multiple requests to trigger rate limit
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/auth/sign-up/send-code')
          .send({ email: `test${i}@example.com` });
      }

      // 4th request should be rate limited
      const response = await request(app)
        .post('/auth/sign-up/send-code')
        .send({ email: 'test4@example.com' })
        .expect(429);

      expect(response.body.error).toBe('CODE_RATE_LIMIT_EXCEEDED');
    });
  });

  describe('POST /auth/sign-up/verify-code', () => {
    it('should verify valid code and render step 2', async () => {
      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        code: '123456',
        expires: Date.now() + 600000
      });

      const response = await request(app)
        .post('/auth/sign-up/verify-code')
        .send({ 
          email: 'test@example.com',
          code: '123456'
        })
        .expect(200);

      expect(response.text).toContain('signup-step2');
      expect(sessionService.getVerificationData).toHaveBeenCalledWith('test@example.com');
    });

    it('should reject invalid verification code', async () => {
      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        code: '123456',
        expires: Date.now() + 600000
      });

      const response = await request(app)
        .post('/auth/sign-up/verify-code')
        .send({
          email: 'test@example.com', 
          code: 'wrong-code'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid verification code'
      });
    });

    it('should reject expired verification code', async () => {
      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        code: '123456',
        expires: Date.now() - 1000 // Expired
      });

      const response = await request(app)
        .post('/auth/sign-up/verify-code')
        .send({
          email: 'test@example.com',
          code: '123456'
        })
        .expect(400);

      expect(response.body.message).toBe('Verification code has expired');
    });
  });

  describe('POST /auth/sign-up/complete', () => {
    it('should complete signup with valid data', async () => {
      const mockUser = {
        id: 'rec123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        status: 'active'
      };

      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        verified: true
      });
      
      authService.createUser.mockResolvedValue(mockUser);
      authService.generateToken.mockReturnValue('jwt-token-123');

      const response = await request(app)
        .post('/auth/sign-up/complete')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!',
          termsAccepted: true,
          privacyAccepted: true
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Account created successfully',
        user: expect.objectContaining({
          id: 'rec123',
          email: 'test@example.com'
        })
      });

      expect(authService.createUser).toHaveBeenCalledWith(expect.objectContaining({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      }));
    });

    it('should validate password confirmation match', async () => {
      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        verified: true
      });

      const response = await request(app)
        .post('/auth/sign-up/complete')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecurePass123!',
          confirmPassword: 'DifferentPass123!',
          termsAccepted: true,
          privacyAccepted: true
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should require terms and privacy acceptance', async () => {
      sessionService.getVerificationData.mockResolvedValue({
        email: 'test@example.com',
        verified: true
      });

      const response = await request(app)
        .post('/auth/sign-up/complete')
        .send({
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!',
          termsAccepted: false,
          privacyAccepted: true
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /auth/sign-in', () => {
    it('should sign in with valid credentials', async () => {
      const mockUser = {
        id: 'rec123',
        email: 'test@example.com',
        password: 'hashedpassword',
        status: 'active',
        emailVerified: true
      };

      authService.findUserByEmail.mockResolvedValue(mockUser);
      authService.generateToken.mockReturnValue('jwt-token-123');
      
      // Mock bcrypt comparison
      const bcrypt = require('bcryptjs');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const response = await request(app)
        .post('/auth/sign-in')
        .send({
          email: 'test@example.com',
          password: 'correctpassword'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Sign in successful',
        user: expect.objectContaining({
          email: 'test@example.com'
        })
      });

      expect(authService.findUserByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should reject invalid credentials', async () => {
      authService.findUserByEmail.mockResolvedValue(null);

      const response = await request(app)
        .post('/auth/sign-in')
        .send({
          email: 'nonexistent@example.com',
          password: 'password'
        })
        .expect(401);

      expect(response.body).toEqual({
        success: false,
        message: 'Invalid email or password'
      });
    });

    it('should reject unverified user', async () => {
      const mockUser = {
        id: 'rec123',
        email: 'test@example.com',
        emailVerified: false,
        status: 'pending_verification'
      };

      authService.findUserByEmail.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/auth/sign-in')
        .send({
          email: 'test@example.com',
          password: 'password'
        })
        .expect(401);

      expect(response.body.message).toBe('Please verify your email address before signing in');
    });

    it('should enforce rate limiting on auth attempts', async () => {
      authService.findUserByEmail.mockResolvedValue(null);

      // Make multiple failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/auth/sign-in')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword'
          });
      }

      // 6th attempt should be rate limited
      const response = await request(app)
        .post('/auth/sign-in')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        })
        .expect(429);

      expect(response.body.error).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('OAuth Routes', () => {
    describe('GET /auth/google', () => {
      it('should redirect to Google OAuth', async () => {
        const response = await request(app)
          .get('/auth/google')
          .expect(302);

        expect(response.headers.location).toContain('accounts.google.com');
      });
    });

    describe('GET /auth/apple', () => {
      it('should redirect to Apple OAuth', async () => {
        const response = await request(app)
          .get('/auth/apple')
          .expect(302);

        expect(response.headers.location).toContain('appleid.apple.com');
      });
    });

    describe('GET /auth/microsoft', () => {
      it('should redirect to Microsoft OAuth', async () => {
        const response = await request(app)
          .get('/auth/microsoft')
          .expect(302);

        expect(response.headers.location).toContain('login.microsoftonline.com');
      });
    });
  });

  describe('POST /auth/sign-out', () => {
    it('should sign out user successfully', async () => {
      const response = await request(app)
        .post('/auth/sign-out')
        .set('Cookie', ['token=valid-jwt-token'])
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Signed out successfully'
      });

      // Should clear the token cookie
      expect(response.headers['set-cookie'][0]).toContain('token=;');
    });
  });

  describe('Email Verification', () => {
    describe('GET /auth/verify-email/:token', () => {
      it('should verify email with valid token', async () => {
        const mockUser = {
          id: 'rec123',
          email: 'test@example.com',
          emailVerified: true,
          status: 'active'
        };

        authService.verifyEmailToken.mockResolvedValue(mockUser);

        const response = await request(app)
          .get('/auth/verify-email/valid-token-123')
          .expect(302);

        expect(response.headers.location).toBe('/dashboard');
        expect(authService.verifyEmailToken).toHaveBeenCalledWith('valid-token-123');
      });

      it('should handle invalid token', async () => {
        authService.verifyEmailToken.mockResolvedValue(null);

        const response = await request(app)
          .get('/auth/verify-email/invalid-token')
          .expect(400);

        expect(response.text).toContain('Invalid or expired verification token');
      });
    });
  });
});