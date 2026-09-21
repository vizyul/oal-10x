/**
 * Email Service Unit Tests
 * Tests for src/services/email.service.js
 */

// Mock dependencies before requiring the service
const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend }
  }))
}));

// Store original env
const originalEnv = process.env;

describe('EmailService', () => {
  let emailService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Reset environment variables
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      BASE_URL: 'https://app.example.com',
      STRIPE_CUSTOMER_PORTAL_URL: 'https://billing.stripe.com'
    };
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('EmailService Class Structure', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should have correct initial properties', () => {
      expect(emailService).toHaveProperty('resend');
      expect(emailService).toHaveProperty('fromAddress');
      expect(emailService).toHaveProperty('initialized');
    });
  });

  describe('generateVerificationEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
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
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with user first name', () => {
      const text = emailService.generateWelcomeEmailText('John');

      expect(text).toContain('Hello John!');
      expect(text).toContain('Welcome to AmplifyContent.ai');
    });
  });

  describe('generatePayPalVerificationEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with code and first name', () => {
      const html = emailService.generatePayPalVerificationEmailHTML('654321', 'John');

      expect(html).toContain('654321');
      expect(html).toContain('Hi John');
      expect(html).toContain('PayPal Payout Email');
    });

    it('should default greeting when firstName missing', () => {
      const html = emailService.generatePayPalVerificationEmailHTML('111111');

      expect(html).toContain('Hi there');
    });
  });

  describe('generatePayPalVerificationEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with code and first name', () => {
      const text = emailService.generatePayPalVerificationEmailText('654321', 'John');

      expect(text).toContain('654321');
      expect(text).toContain('Hi John');
    });
  });

  describe('generatePasswordResetEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with reset URL and first name', () => {
      const html = emailService.generatePasswordResetEmailHTML('John', 'https://app.example.com/reset?token=abc');

      expect(html).toContain('Hi John');
      expect(html).toContain('https://app.example.com/reset?token=abc');
      expect(html).toContain('Reset Password');
    });
  });

  describe('generatePasswordResetEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with reset URL', () => {
      const text = emailService.generatePasswordResetEmailText('John', 'https://app.example.com/reset?token=abc');

      expect(text).toContain('Hi John');
      expect(text).toContain('https://app.example.com/reset?token=abc');
    });
  });

  describe('generatePaymentFailedEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
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

  describe('generateSubscriptionCancellationScheduledEmailHTML', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate HTML with plan and end date', () => {
      const html = emailService.generateSubscriptionCancellationScheduledEmailHTML({
        firstName: 'John',
        planName: 'Premium',
        endDate: 'January 31, 2025'
      });

      expect(html).toContain('Hello John');
      expect(html).toContain('Premium');
      expect(html).toContain('January 31, 2025');
      expect(html).toContain('Manage Subscription');
    });
  });

  describe('generateSubscriptionCancellationScheduledEmailText', () => {
    beforeEach(() => {
      jest.resetModules();
      emailService = require('../../../src/services/email.service');
    });

    it('should generate plain text with plan and end date', () => {
      const text = emailService.generateSubscriptionCancellationScheduledEmailText({
        firstName: 'John',
        planName: 'Premium',
        endDate: 'January 31, 2025'
      });

      expect(text).toContain('Hello John');
      expect(text).toContain('Premium');
      expect(text).toContain('January 31, 2025');
    });
  });

  describe('Email Sending Methods (configured with Resend)', () => {
    beforeEach(() => {
      jest.resetModules();

      process.env.RESEND_API_KEY = 're_test_key';
      process.env.RESEND_FROM_EMAIL = 'support@amplifycontent.ai';

      mockSend.mockResolvedValue({ data: { id: 'test-message-id' }, error: null });

      emailService = require('../../../src/services/email.service');
    });

    describe('sendVerificationCode', () => {
      it('should send verification email via Resend when configured', async () => {
        const result = await emailService.sendVerificationCode('user@example.com', '123456');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            from: 'AmplifyContent.ai <support@amplifycontent.ai>',
            to: 'user@example.com',
            subject: expect.stringContaining('Verify Your Email')
          })
        );
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId', 'test-message-id');
      });

      it('should return dev-mode response when not configured', async () => {
        delete process.env.RESEND_API_KEY;
        jest.resetModules();
        emailService = require('../../../src/services/email.service');

        const result = await emailService.sendVerificationCode('user@example.com', '999999');

        expect(mockSend).not.toHaveBeenCalled();
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId', 'dev-mode');
      });

      it('should throw when Resend returns an error', async () => {
        mockSend.mockResolvedValue({ data: null, error: { message: 'invalid_from_address' } });

        await expect(
          emailService.sendVerificationCode('user@example.com', '123456')
        ).rejects.toThrow('Failed to send verification email');
      });
    });

    describe('sendWelcomeEmail', () => {
      it('should send welcome email via Resend', async () => {
        const result = await emailService.sendWelcomeEmail('user@example.com', 'John');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'Welcome to AmplifyContent.ai!'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should return dev-mode when not configured', async () => {
        delete process.env.RESEND_API_KEY;
        jest.resetModules();
        emailService = require('../../../src/services/email.service');

        const result = await emailService.sendWelcomeEmail('user@example.com', 'Jane');

        expect(mockSend).not.toHaveBeenCalled();
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('messageId', 'dev-mode');
      });
    });

    describe('sendPasswordResetEmail', () => {
      it('should send password reset email via Resend', async () => {
        const result = await emailService.sendPasswordResetEmail('user@example.com', 'John', 'https://app.example.com/reset');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: expect.stringContaining('Reset Your Password')
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendPayPalVerificationCode', () => {
      it('should send PayPal verification email via Resend', async () => {
        const result = await emailService.sendPayPalVerificationCode('user@example.com', '654321', 'John');

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: expect.stringContaining('PayPal payout email')
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendEmail (generic)', () => {
      it('should send generic email via Resend', async () => {
        const result = await emailService.sendEmail(
          'user@example.com',
          'Test Subject',
          '<p>Test HTML</p>',
          'Test text'
        );

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'user@example.com',
            subject: 'Test Subject',
            html: '<p>Test HTML</p>',
            text: 'Test text'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should pass replyTo through when provided', async () => {
        await emailService.sendEmail(
          'support@amplifycontent.ai',
          'Contact Form: Hello',
          '<p>Message</p>',
          null,
          'submitter@example.com'
        );

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            replyTo: 'submitter@example.com'
          })
        );
      });

      it('should handle Resend send errors gracefully', async () => {
        mockSend.mockRejectedValue(new Error('Resend error'));

        const result = await emailService.sendEmail('user@example.com', 'Subject', '<p>HTML</p>');

        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
      });

      it('should handle Resend-returned errors gracefully', async () => {
        mockSend.mockResolvedValue({ data: null, error: { message: 'rate_limit_exceeded' } });

        const result = await emailService.sendEmail('user@example.com', 'Subject', '<p>HTML</p>');

        expect(result).toEqual({ success: false, error: 'rate_limit_exceeded' });
      });
    });

    describe('sendPaymentFailed', () => {
      it('should send payment failed email', async () => {
        const result = await emailService.sendPaymentFailed('user@example.com', { amount: '$19.99' });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Action Required: Payment Failed'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should not throw on error', async () => {
        mockSend.mockRejectedValue(new Error('Error'));

        const result = await emailService.sendPaymentFailed('user@example.com', { amount: '$9.99' });

        expect(result).toHaveProperty('success', false);
      });
    });

    describe('sendTrialEnded', () => {
      it('should send trial ended email for active subscription', async () => {
        const result = await emailService.sendTrialEnded('user@example.com', { isActive: true });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Free Trial Has Ended'
          })
        );
        expect(result).toHaveProperty('success', true);
      });

      it('should send trial expired email for inactive', async () => {
        const result = await emailService.sendTrialEnded('user@example.com', { isActive: false });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Free Trial Has Expired'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendPaymentActionRequired', () => {
      it('should send payment action required email', async () => {
        const result = await emailService.sendPaymentActionRequired('user@example.com', { amount: '$29.99' });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Action Required: Verify Your Payment'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionCanceled', () => {
      it('should send subscription canceled email', async () => {
        const result = await emailService.sendSubscriptionCanceled('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Canceled'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionPaused', () => {
      it('should send subscription paused email', async () => {
        const result = await emailService.sendSubscriptionPaused('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Paused'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionResumed', () => {
      it('should send subscription resumed email', async () => {
        const result = await emailService.sendSubscriptionResumed('user@example.com', {
          firstName: 'John',
          planName: 'Premium'
        });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Resumed'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionUpgraded', () => {
      it('should send subscription upgraded email', async () => {
        const result = await emailService.sendSubscriptionUpgraded('user@example.com', {
          firstName: 'John',
          oldPlanName: 'Basic',
          newPlanName: 'Premium'
        });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Has Been Upgraded!'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });

    describe('sendSubscriptionCancellationScheduled', () => {
      it('should send subscription cancellation scheduled email', async () => {
        const result = await emailService.sendSubscriptionCancellationScheduled('user@example.com', {
          firstName: 'John',
          planName: 'Premium',
          endDate: 'January 31, 2025'
        });

        expect(mockSend).toHaveBeenCalledWith(
          expect.objectContaining({
            subject: 'Your Subscription Cancellation is Scheduled'
          })
        );
        expect(result).toHaveProperty('success', true);
      });
    });
  });

  describe('sendViaResend', () => {
    beforeEach(() => {
      jest.resetModules();
    });

    it('should return dev-mode response without calling Resend when unconfigured', async () => {
      emailService = require('../../../src/services/email.service');
      await emailService.ensureInitialized();

      const result = await emailService.sendViaResend({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(mockSend).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, messageId: 'dev-mode', previewUrl: null });
    });

    it('should return success with messageId when Resend succeeds', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      mockSend.mockResolvedValue({ data: { id: 'abc-123' }, error: null });
      emailService = require('../../../src/services/email.service');
      await emailService.ensureInitialized();

      const result = await emailService.sendViaResend({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result).toEqual({ success: true, messageId: 'abc-123', previewUrl: null });
    });

    it('should return failure when Resend returns an error object', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      mockSend.mockResolvedValue({ data: null, error: { message: 'invalid_api_key' } });
      emailService = require('../../../src/services/email.service');
      await emailService.ensureInitialized();

      const result = await emailService.sendViaResend({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result).toEqual({ success: false, error: 'invalid_api_key' });
    });

    it('should return failure when Resend throws', async () => {
      process.env.RESEND_API_KEY = 're_test_key';
      mockSend.mockRejectedValue(new Error('network error'));
      emailService = require('../../../src/services/email.service');
      await emailService.ensureInitialized();

      const result = await emailService.sendViaResend({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Test</p>'
      });

      expect(result).toEqual({ success: false, error: 'network error' });
    });
  });

  describe('ensureInitialized', () => {
    beforeEach(() => {
      jest.resetModules();
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
