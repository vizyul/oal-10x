/**
 * Email Service Unit Tests
 * Tests for src/services/email.service.js
 */

// Mock dependencies before requiring the service
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn(),
    verify: jest.fn()
  })),
  getTestMessageUrl: jest.fn(() => 'https://preview.url')
}));

jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => ({
    acquireTokenSilent: jest.fn(),
    acquireTokenByClientCredential: jest.fn()
  }))
}));

jest.mock('axios');

// Store original env
const originalEnv = process.env;

describe('EmailService', () => {
  let EmailService;
  let emailService;
  let nodemailer;
  let axios;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset environment variables
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AZURE_EMAIL_ADDRESS: 'test@example.com',
      AZURE_EMAIL_PASSWORD: 'testpassword',
      AZURE_CLIENT_ID: 'test-client-id',
      AZURE_CLIENT_SECRET: 'test-client-secret',
      AZURE_TENANT_ID: 'test-tenant-id',
      BASE_URL: 'https://app.example.com',
      STRIPE_CUSTOMER_PORTAL_URL: 'https://billing.stripe.com'
    };

    nodemailer = require('nodemailer');
    axios = require('axios');
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('EmailService Class Structure', () => {
    beforeEach(() => {
      // Clear module cache and reimport
      jest.resetModules();

      // Set up minimal environment for testing
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;

      EmailService = require('../../../src/services/email.service');
      emailService = EmailService;
    });

    it('should have correct initial properties', () => {
      expect(emailService).toHaveProperty('transporter');
      expect(emailService).toHaveProperty('initialized');
      expect(emailService).toHaveProperty('useGraphAPI');
    });
  });

  describe('generateVerificationEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with verification code', () => {
      const html = emailService.generateVerificationEmailHTML('123456');

      expect(html).toContain('123456');
      expect(html).toContain('AmplifyContent.ai');
      expect(html).toContain('Email Verification');
      expect(html).toContain('6-digit code');
    });

    it('should include expiration notice', () => {
      const html = emailService.generateVerificationEmailHTML('999999');

      expect(html).toContain('expire in 10 minutes');
    });

    it('should have proper HTML structure', () => {
      const html = emailService.generateVerificationEmailHTML('000000');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
    });
  });

  describe('generateVerificationEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with verification code', () => {
      const text = emailService.generateVerificationEmailText('123456');

      expect(text).toContain('123456');
      expect(text).toContain('AmplifyContent.ai');
    });

    it('should include expiration notice', () => {
      const text = emailService.generateVerificationEmailText('999999');

      expect(text).toContain('expire in 10 minutes');
    });
  });

  describe('generateWelcomeEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with user first name', () => {
      const html = emailService.generateWelcomeEmailHTML('John');

      expect(html).toContain('Hello John!');
      expect(html).toContain('Welcome to AmplifyContent.ai');
    });

    it('should include support email', () => {
      const html = emailService.generateWelcomeEmailHTML('Jane');

      expect(html).toContain('support@amplifycontent.ai');
    });
  });

  describe('generateWelcomeEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with user first name', () => {
      const text = emailService.generateWelcomeEmailText('John');

      expect(text).toContain('Hello John!');
      expect(text).toContain('Welcome to AmplifyContent.ai');
    });
  });

  describe('generatePaymentFailedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with payment amount', () => {
      const html = emailService.generatePaymentFailedEmailHTML({ amount: '$19.99' });

      expect(html).toContain('$19.99');
      expect(html).toContain('Payment Method Failed');
      expect(html).toContain('Update Payment Method');
    });

    it('should include bank/card explanation', () => {
      const html = emailService.generatePaymentFailedEmailHTML({ amount: '$9.99' });

      expect(html).toContain('card has expired');
      expect(html).toContain('declined by your bank');
    });
  });

  describe('generatePaymentFailedEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with payment amount', () => {
      const text = emailService.generatePaymentFailedEmailText({ amount: '$19.99' });

      expect(text).toContain('$19.99');
      expect(text).toContain('Payment Failed');
    });
  });

  describe('generateTrialEndedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML for active subscription after trial', () => {
      const html = emailService.generateTrialEndedEmailHTML({ isActive: true });

      expect(html).toContain('Your Trial Has Ended');
      expect(html).toContain('subscription is now active');
      expect(html).toContain('View Account');
    });

    it('should generate HTML for expired trial', () => {
      const html = emailService.generateTrialEndedEmailHTML({ isActive: false });

      expect(html).toContain('Your Trial Expired');
      expect(html).toContain('Upgrade Now');
    });
  });

  describe('generatePaymentActionRequiredEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with payment amount', () => {
      const html = emailService.generatePaymentActionRequiredEmailHTML({ amount: '$29.99' });

      expect(html).toContain('$29.99');
      expect(html).toContain('Verify Your Payment');
      expect(html).toContain('Authentication Required');
    });
  });

  describe('generateSubscriptionCanceledEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with user name and plan', () => {
      const html = emailService.generateSubscriptionCanceledEmailHTML({
        firstName: 'John',
        planName: 'Premium',
        endDate: 'January 31, 2025'
      });

      expect(html).toContain('Hello John');
      expect(html).toContain('Premium');
      expect(html).toContain('January 31, 2025');
      expect(html).toContain('Resubscribe');
    });

    it('should handle missing firstName', () => {
      const html = emailService.generateSubscriptionCanceledEmailHTML({
        planName: 'Basic'
      });

      expect(html).toContain('Hello there');
    });

    it('should handle missing endDate', () => {
      const html = emailService.generateSubscriptionCanceledEmailHTML({
        firstName: 'Jane'
      });

      expect(html).toContain('Your access has ended');
    });
  });

  describe('generateSubscriptionCanceledEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text version', () => {
      const text = emailService.generateSubscriptionCanceledEmailText({
        firstName: 'John',
        planName: 'Premium',
        endDate: 'January 31, 2025'
      });

      expect(text).toContain('Hello John');
      expect(text).toContain('Premium');
      expect(text).toContain('January 31, 2025');
    });
  });

  describe('generateSubscriptionPausedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML for paused subscription', () => {
      const html = emailService.generateSubscriptionPausedEmailHTML({
        firstName: 'John',
        planName: 'Premium'
      });

      expect(html).toContain('Hello John');
      expect(html).toContain('Premium');
      expect(html).toContain('has been paused');
      expect(html).toContain('Resume Subscription');
    });

    it('should mention data preservation', () => {
      const html = emailService.generateSubscriptionPausedEmailHTML({
        firstName: 'Jane'
      });

      expect(html).toContain('data and settings are safely preserved');
    });
  });

  describe('generateSubscriptionResumedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML for resumed subscription', () => {
      const html = emailService.generateSubscriptionResumedEmailHTML({
        firstName: 'John',
        planName: 'Premium'
      });

      expect(html).toContain('Welcome Back!');
      expect(html).toContain('Premium');
      expect(html).toContain('has been resumed');
      expect(html).toContain('Go to My Videos');
    });

    it('should mention premium features active', () => {
      const html = emailService.generateSubscriptionResumedEmailHTML({});

      expect(html).toContain('premium features are now active');
    });
  });

  describe('generateSubscriptionUpgradedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML for upgraded subscription', () => {
      const html = emailService.generateSubscriptionUpgradedEmailHTML({
        firstName: 'John',
        oldPlanName: 'Basic',
        newPlanName: 'Premium',
        newFeatures: ['More videos', 'Priority support']
      });

      expect(html).toContain('Congratulations!');
      expect(html).toContain('Basic');
      expect(html).toContain('Premium');
      expect(html).toContain('More videos');
      expect(html).toContain('Priority support');
    });

    it('should handle missing features list', () => {
      const html = emailService.generateSubscriptionUpgradedEmailHTML({
        firstName: 'Jane',
        oldPlanName: 'Free',
        newPlanName: 'Basic'
      });

      expect(html).toContain('Free');
      expect(html).toContain('Basic');
      expect(html).not.toContain('<ul');
    });

    it('should handle empty features array', () => {
      const html = emailService.generateSubscriptionUpgradedEmailHTML({
        newFeatures: []
      });

      expect(html).not.toContain('<ul');
    });
  });

  describe('generateSubscriptionUpgradedEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.BASE_URL = 'https://app.example.com';
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with features list', () => {
      const text = emailService.generateSubscriptionUpgradedEmailText({
        firstName: 'John',
        oldPlanName: 'Basic',
        newPlanName: 'Premium',
        newFeatures: ['More videos', 'Priority support']
      });

      expect(text).toContain('Basic');
      expect(text).toContain('Premium');
      expect(text).toContain('- More videos');
      expect(text).toContain('- Priority support');
    });
  });

  describe('Email Sending Methods (with mocked transporter)', () => {
    let mockTransporter;

    beforeEach(() => {
      jest.resetModules();

      // Create mock transporter
      mockTransporter = {
        sendMail: jest.fn().mockResolvedValue({
          messageId: 'test-message-id',
          response: '250 OK'
        }),
        verify: jest.fn().mockResolvedValue(true)
      };

      nodemailer.createTransport.mockReturnValue(mockTransporter);

      // Set up environment for SMTP
      process.env.AZURE_EMAIL_ADDRESS = 'test@example.com';
      process.env.AZURE_EMAIL_PASSWORD = 'testpassword';
      process.env.AZURE_CLIENT_ID = undefined;
      process.env.NODE_ENV = 'test';

      emailService = require('../../../src/services/email.service');
    });

    describe('sendVerificationCode', () => {
      it('should send verification email via SMTP when configured', async () => {
        // Wait for initialization
        await emailService.ensureInitialized();

        // Set transporter directly for testing
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;

        const result = await emailService.sendVerificationCode('user@example.com', '123456');

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: expect.stringContaining('Verify Your Email')
          })
        );
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId');
      });

      it('should return dev-mode response when no transporter', async () => {
        emailService.transporter = null;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendVerificationCode('user@example.com', '999999');

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId', 'dev-mode');
      });
    });

    describe('sendWelcomeEmail', () => {
      it('should send welcome email via SMTP', async () => {
        await emailService.ensureInitialized();
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;

        const result = await emailService.sendWelcomeEmail('user@example.com', 'John');

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'Welcome to AmplifyContent.ai!'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should return dev-mode when no transporter', async () => {
        emailService.transporter = null;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendWelcomeEmail('user@example.com', 'Jane');

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId', 'dev-mode');
      });
    });

    describe('sendEmail (generic)', () => {
      it('should send generic email via SMTP', async () => {
        await emailService.ensureInitialized();
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;

        const result = await emailService.sendEmail(
          'user@example.com',
          'Test Subject',
          '<p>Test HTML</p>',
          'Test text'
        );

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'Test Subject',
            html: '<p>Test HTML</p>'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should handle sendMail errors gracefully', async () => {
        mockTransporter.sendMail.mockRejectedValue(new Error('SMTP error'));
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendEmail('user@example.com', 'Subject', '<p>HTML</p>');

        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
      });
    });

    describe('sendPaymentFailed', () => {
      it('should send payment failed email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendPaymentFailed('user@example.com', { amount: '$19.99' });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Action Required: Payment Failed'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should not throw on error', async () => {
        mockTransporter.sendMail.mockRejectedValue(new Error('Error'));
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendPaymentFailed('user@example.com', { amount: '$9.99' });

        expect(result).toHaveProperty('success', false);
      });
    });

    describe('sendTrialEnded', () => {
      it('should send trial ended email for active subscription', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendTrialEnded('user@example.com', { isActive: true });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Free Trial Has Ended'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should send trial expired email for inactive', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendTrialEnded('user@example.com', { isActive: false });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Free Trial Has Expired'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendPaymentActionRequired', () => {
      it('should send payment action required email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendPaymentActionRequired('user@example.com', { amount: '$29.99' });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Action Required: Verify Your Payment'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionCanceled', () => {
      it('should send subscription canceled email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendSubscriptionCanceled('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Canceled'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionPaused', () => {
      it('should send subscription paused email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendSubscriptionPaused('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Paused'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionResumed', () => {
      it('should send subscription resumed email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendSubscriptionResumed('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Resumed'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionUpgraded', () => {
      it('should send subscription upgraded email', async () => {
        emailService.transporter = mockTransporter;
        emailService.useGraphAPI = false;
        emailService.initialized = true;

        const result = await emailService.sendSubscriptionUpgraded('user@example.com', {
          firstName: 'John',
          oldPlanName: 'Basic',
          newPlanName: 'Premium'
        });

        expect(mockTransporter.sendMail).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Upgraded!'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });
  });

  describe('verifyConnection', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should return true when transporter verifies', async () => {
      const mockTransporter = {
        verify: jest.fn().mockResolvedValue(true)
      };
      emailService.transporter = mockTransporter;

      const result = await emailService.verifyConnection();

      expect(result).toBe(true);
    });

    it('should return false when transporter is null', async () => {
      emailService.transporter = null;

      const result = await emailService.verifyConnection();

      expect(result).toBe(false);
    });

    it('should return false when verification fails', async () => {
      const mockTransporter = {
        verify: jest.fn().mockRejectedValue(new Error('Connection failed'))
      };
      emailService.transporter = mockTransporter;

      const result = await emailService.verifyConnection();

      expect(result).toBe(false);
    });
  });

  describe('ensureInitialized', () => {
    beforeEach(() => {
      jest.resetModules();
      process.env.AZURE_EMAIL_ADDRESS = undefined;
      process.env.AZURE_CLIENT_ID = undefined;
      emailService = require('../../../src/services/email.service');
    });

    it('should initialize if not already initialized', async () => {
      emailService.initialized = false;
      const initSpy = jest.spyOn(emailService, 'init').mockResolvedValue();

      await emailService.ensureInitialized();

      expect(initSpy).toHaveBeenCalled();
    });

    it('should skip initialization if already initialized', async () => {
      emailService.initialized = true;
      const initSpy = jest.spyOn(emailService, 'init');

      await emailService.ensureInitialized();

      expect(initSpy).not.toHaveBeenCalled();
    });
  });
});
