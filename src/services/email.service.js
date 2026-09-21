const { Resend } = require('resend');
const { logger } = require('../utils');

class EmailService {
  constructor() {
    this.resend = null;
    this.fromAddress = null;
    this.initialized = false;
    this.init();
  }

  async init() {
    try {
      if (process.env.RESEND_API_KEY) {
        this.resend = new Resend(process.env.RESEND_API_KEY);
        this.fromAddress = process.env.RESEND_FROM_EMAIL || 'support@amplifycontent.ai';
        logger.info('Email service initialized with Resend');
      } else {
        this.resend = null;
        logger.info('Email service initialized in development mode - emails will be logged to console');
        logger.warn('To enable email sending, configure RESEND_API_KEY');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize email service:', error);

      // Fall back to development mode if initialization fails
      this.resend = null;
      logger.warn('Falling back to development mode - emails will be logged to console');
      this.initialized = true; // Mark as initialized even on failure
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  // Single Resend transport used by every public send method. Never throws -
  // callers decide whether a failed send should throw or just be logged.
  async sendViaResend({ to, subject, html, text, replyTo = null, devModeMessage = null }) {
    if (!this.resend) {
      logger.warn(devModeMessage || `Email service in dev mode. Would send to ${to}: "${subject}"`);
      return {
        success: true,
        messageId: 'dev-mode',
        previewUrl: null
      };
    }

    try {
      const payload = {
        from: `AmplifyContent.ai <${this.fromAddress}>`,
        to,
        subject,
        html
      };

      if (text) {
        payload.text = text;
      }
      if (replyTo) {
        payload.replyTo = replyTo;
      }

      const { data, error } = await this.resend.emails.send(payload);

      if (error) {
        logger.error('Error sending email via Resend:', error);
        return {
          success: false,
          error: error.message || String(error)
        };
      }

      logger.info(`Email sent via Resend to ${to}`, { messageId: data?.id });

      return {
        success: true,
        messageId: data.id,
        previewUrl: null
      };
    } catch (err) {
      logger.error('Error sending email via Resend:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  async sendVerificationCode(email, verificationCode) {
    try {
      await this.ensureInitialized();

      const result = await this.sendViaResend({
        to: email,
        subject: 'Verify Your Email - AmplifyContent.ai',
        html: this.generateVerificationEmailHTML(verificationCode),
        text: this.generateVerificationEmailText(verificationCode),
        devModeMessage: `No email service configured. Verification code for ${email}: ${verificationCode}`
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendPayPalVerificationCode(email, code, firstName) {
    try {
      await this.ensureInitialized();

      const subject = 'Verify your PayPal payout email - AmplifyContent.ai';
      const html = this.generatePayPalVerificationEmailHTML(code, firstName);
      const text = this.generatePayPalVerificationEmailText(code, firstName);

      return await this.sendViaResend({
        to: email,
        subject,
        html,
        text,
        devModeMessage: `No email service configured. PayPal verification code for ${email}: ${code}`
      });
    } catch (error) {
      logger.error('Error sending PayPal verification email:', error);
      throw new Error('Failed to send PayPal verification email');
    }
  }

  generatePayPalVerificationEmailHTML(code, firstName) {
    const greetingName = firstName ? firstName : 'there';
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your PayPal Payout Email</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; }
            .header h2 { color: white; margin: 0; font-size: 20px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .verification-code { background-color: #10b981; color: #ffffff; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 8px; letter-spacing: 8px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1><span style="color: #ffffff;">AmplifyContent.</span><span style="color: #10b981;">ai</span></h1>
            <h2>Verify Your PayPal Payout Email</h2>
        </div>
        <div class="content">
            <p>Hi ${greetingName},</p>
            <p>You're setting this email address as the destination for your AmplifyContent.ai affiliate payouts. To confirm you control this inbox, enter the 6-digit code below on the affiliate settings page:</p>

            <div class="verification-code">${code}</div>

            <p>This code expires in 10 minutes. If you didn't request this, you can safely ignore this email - no changes will be made to your payout details.</p>

            <p><strong>Important:</strong> Make sure this email matches the address on your PayPal account. PayPal payouts sent to an unregistered email will be held as Unclaimed for 30 days and then returned.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </body>
    </html>`;
  }

  generatePayPalVerificationEmailText(code, firstName) {
    const greetingName = firstName ? firstName : 'there';
    return `
AmplifyContent.ai - Verify Your PayPal Payout Email

Hi ${greetingName},

You're setting this email address as the destination for your AmplifyContent.ai affiliate payouts. To confirm you control this inbox, enter the 6-digit code below on the affiliate settings page:

${code}

This code expires in 10 minutes. If you didn't request this, you can safely ignore this email - no changes will be made to your payout details.

Important: Make sure this email matches the address on your PayPal account. PayPal payouts sent to an unregistered email will be held as Unclaimed for 30 days and then returned.

(c) ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
This is an automated email, please do not reply.
    `;
  }

  async sendPasswordResetEmail(email, firstName, resetUrl) {
    try {
      await this.ensureInitialized();

      const result = await this.sendViaResend({
        to: email,
        subject: 'Reset Your Password - AmplifyContent.ai',
        html: this.generatePasswordResetEmailHTML(firstName, resetUrl),
        text: this.generatePasswordResetEmailText(firstName, resetUrl),
        devModeMessage: `No email service configured. Password reset link for ${email}: ${resetUrl}`
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      logger.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  generatePasswordResetEmailHTML(firstName, resetUrl) {
    const greetingName = firstName ? firstName : 'there';
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; }
            .header h2 { color: white; margin: 0; font-size: 20px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #10b981; color: #ffffff !important; padding: 14px 32px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; font-weight: bold; }
            .link-fallback { word-break: break-all; color: #10b981; font-size: 13px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1><span style="color: #ffffff;">AmplifyContent.</span><span style="color: #10b981;">ai</span></h1>
            <h2>Reset Your Password</h2>
        </div>
        <div class="content">
            <p>Hi ${greetingName},</p>
            <p>We received a request to reset the password on your AmplifyContent.ai account. Click the button below to choose a new password.</p>

            <p style="text-align: center;"><a class="button" href="${resetUrl}">Reset Password</a></p>

            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p class="link-fallback">${resetUrl}</p>

            <p>This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email — your password won't change.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </body>
    </html>`;
  }

  generatePasswordResetEmailText(firstName, resetUrl) {
    const greetingName = firstName ? firstName : 'there';
    return `
AmplifyContent.ai - Reset Your Password

Hi ${greetingName},

We received a request to reset the password on your AmplifyContent.ai account. Open the link below to choose a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email - your password won't change.

(c) ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
This is an automated email, please do not reply.
    `;
  }

  generateVerificationEmailHTML(code) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0 0 10px 0; font-size: 28px; }
            .brand-text { color: #000000; }
            .brand-ai { color: #10b981; }
            .header h2 { color: white; margin: 0; font-size: 20px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .verification-code { background-color: #10b981; color: #ffffff; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 8px; letter-spacing: 8px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
            .button { background-color: #000000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1><span style="color: #ffffff;">AmplifyContent.</span><span style="color: #10b981;">ai</span></h1>
            <h2>Email Verification</h2>
        </div>
        <div class="content">
            <p>Thank you for signing up! To complete your registration, please verify your email address by entering the following 6-digit code:</p>

            <div class="verification-code">${code}</div>

            <p>This code will expire in 10 minutes. If you didn't request this verification, you can safely ignore this email.</p>

            <p>Welcome to AmplifyContent.ai - where your content is amplified through AI!</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </body>
    </html>`;
  }

  generateVerificationEmailText(code) {
    return `
AmplifyContent.ai - Email Verification

Thank you for signing up! To complete your registration, please verify your email address by entering the following 6-digit code:

${code}

This code will expire in 10 minutes. If you didn't request this verification, you can safely ignore this email.

Welcome to AmplifyContent.ai - where your content is amplified through AI!

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
This is an automated email, please do not reply.
    `;
  }

  async sendWelcomeEmail(email, firstName) {
    try {
      await this.ensureInitialized();

      const result = await this.sendViaResend({
        to: email,
        subject: 'Welcome to AmplifyContent.ai!',
        html: this.generateWelcomeEmailHTML(firstName),
        text: this.generateWelcomeEmailText(firstName),
        devModeMessage: `No email service configured. Welcome email for ${email} (${firstName}) not sent.`
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      return result;
    } catch (error) {
      logger.error('Error sending welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  async sendPaymentFailed(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Action Required: Payment Failed';
      const html = this.generatePaymentFailedEmailHTML(data);
      const text = this.generatePaymentFailedEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending payment failed email:', error);
      // Don't throw, just log error so webhook doesn't fail
      return { success: false, error: error.message };
    }
  }

  async sendTrialEnded(email, data) {
    try {
      await this.ensureInitialized();
      const subject = data.isActive
        ? 'Your Free Trial Has Ended'
        : 'Your Free Trial Has Expired';
      const html = this.generateTrialEndedEmailHTML(data);
      const text = this.generateTrialEndedEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending trial ended email:', error);
      return { success: false, error: error.message };
    }
  }

  async sendPaymentActionRequired(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Action Required: Verify Your Payment';
      const html = this.generatePaymentActionRequiredEmailHTML(data);
      const text = this.generatePaymentActionRequiredEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending payment action required email:', error);
      return { success: false, error: error.message };
    }
  }

  generateWelcomeEmailHTML(firstName) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to AmplifyContent.ai</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1><span style="color: #ffffff;">Welcome to AmplifyContent.</span><span style="color: #10b981;">ai</span><span style="color: #ffffff;">!</span></h1>
        </div>
        <div class="content">
            <h2>Hello ${firstName}!</h2>
            <p>Welcome to AmplifyContent.ai! Your account has been successfully created and verified.</p>

            <p>You can now start using our platform to amplify your content through AI. Explore our features and begin your journey with us.</p>

            <p>If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:support@amplifycontent.ai" style="color: #10b981; text-decoration: none;">support@amplifycontent.ai</a>.</p>

            <p>God bless!</p>
            <p>The AmplifyContent.ai Team</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateWelcomeEmailText(firstName) {
    return `
Welcome to AmplifyContent.ai!

Hello ${firstName}!

Welcome to AmplifyContent.ai! Your account has been successfully created and verified.

You can now start using our platform to amplify your content through AI. Explore our features and begin your journey with us.

If you have any questions or need assistance, feel free to reach out to our support team at support@amplifycontent.ai.

God bless!
The AmplifyContent.ai Team

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendEmail(to, subject, htmlContent, textContent = null, replyTo = null) {
    try {
      await this.ensureInitialized();

      return await this.sendViaResend({
        to,
        subject,
        html: htmlContent,
        text: textContent,
        replyTo,
        devModeMessage: `No email service configured. Email to ${to} with subject "${subject}" not sent.`
      });
    } catch (error) {
      logger.error('Error sending email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  generatePaymentFailedEmailHTML(data) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Failed</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #ef4444; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #ef4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Payment Method Failed</h1>
        </div>
        <div class="content">
            <h2>Action Required</h2>
            <p>We were unable to process your subscription payment of <strong>${data.amount}</strong>.</p>
            <p>This normally happens if your card has expired or was declined by your bank.</p>
            <p>To avoid any interruption to your service, please update your payment method:</p>
            <div style="text-align: center;">
                <a href="${process.env.STRIPE_CUSTOMER_PORTAL_URL}" class="button">Update Payment Method</a>
            </div>
            <p>If you have already updated your payment information, please ignore this email.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generatePaymentFailedEmailText(data) {
    return `
Action Required: Payment Failed

We were unable to process your subscription payment of ${data.amount}.

This normally happens if your card has expired or was declined by your bank.

To avoid any interruption to your service, please update your payment method here:
${process.env.STRIPE_CUSTOMER_PORTAL_URL}

If you have already updated your payment information, please ignore this email.

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  generateTrialEndedEmailHTML(data) {
    const title = data.isActive ? 'Your Trial Has Ended' : 'Your Trial Expired';
    const message = data.isActive
      ? 'Your free trial has ended and your subscription is now active! We hope you are enjoying AmplifyContent.ai.'
      : 'Your free trial has ended. To continue using our premium features, please upgrade your subscription.';
    const buttonText = data.isActive ? 'View Account' : 'Upgrade Now';
    const buttonUrl = process.env.BASE_URL + (data.isActive ? '/dashboard' : '/subscription/upgrade');

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${title}</h1>
        </div>
        <div class="content">
            <p>${message}</p>
            <div style="text-align: center;">
                <a href="${buttonUrl}" class="button">${buttonText}</a>
            </div>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateTrialEndedEmailText(data) {
    const title = data.isActive ? 'Your Free Trial Has Ended' : 'Your Free Trial Has Expired';
    const message = data.isActive
      ? 'Your free trial has ended and your subscription is now active! We hope you are enjoying AmplifyContent.ai.'
      : 'Your free trial has ended. To continue using our premium features, please upgrade your subscription.';
    const url = process.env.BASE_URL + (data.isActive ? '/dashboard' : '/subscription/upgrade');

    return `
${title}

${message}

Manage your account here:
${url}

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  generatePaymentActionRequiredEmailHTML(data) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Verification Needed</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f59e0b; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Verify Your Payment</h1>
        </div>
        <div class="content">
            <h2>Authentication Required</h2>
            <p>Your bank requires you to verify your payment of <strong>${data.amount}</strong>.</p>
            <p>Please click the button below to manage your payment method:</p>
            <div style="text-align: center;">
                <a href="${process.env.STRIPE_CUSTOMER_PORTAL_URL}" class="button">Manage Payment</a>
            </div>
            <p>This link is safe and secure.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generatePaymentActionRequiredEmailText(data) {
    return `
Action Required: Verify Your Payment

Your bank requires you to verify your payment of ${data.amount}.

Please use the link below to manage your payment method:
${process.env.STRIPE_CUSTOMER_PORTAL_URL}

This link is safe and secure.

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendSubscriptionCanceled(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Your Subscription Has Been Canceled';
      const html = this.generateSubscriptionCanceledEmailHTML(data);
      const text = this.generateSubscriptionCanceledEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending subscription canceled email:', error);
      return { success: false, error: error.message };
    }
  }

  generateSubscriptionCanceledEmailHTML(data) {
    const endDateMessage = data.endDate
      ? `Your access will continue until <strong>${data.endDate}</strong>.`
      : 'Your access has ended.';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Canceled</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #64748b; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Subscription Canceled</h1>
        </div>
        <div class="content">
            <h2>Hello ${data.firstName || 'there'},</h2>
            <p>Your <strong>${data.planName || 'subscription'}</strong> has been canceled as requested.</p>
            <p>${endDateMessage}</p>
            <p>We're sorry to see you go! If you change your mind, you can resubscribe at any time:</p>
            <div style="text-align: center;">
                <a href="${process.env.BASE_URL}/subscription/upgrade" class="button">Resubscribe</a>
            </div>
            <p>If you have any feedback about your experience, we'd love to hear from you at <a href="mailto:support@amplifycontent.ai" style="color: #10b981;">support@amplifycontent.ai</a>.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateSubscriptionCanceledEmailText(data) {
    const endDateMessage = data.endDate
      ? `Your access will continue until ${data.endDate}.`
      : 'Your access has ended.';

    return `
Subscription Canceled

Hello ${data.firstName || 'there'},

Your ${data.planName || 'subscription'} has been canceled as requested.

${endDateMessage}

We're sorry to see you go! If you change your mind, you can resubscribe at any time:
${process.env.BASE_URL}/subscription/upgrade

If you have any feedback about your experience, we'd love to hear from you at support@amplifycontent.ai.

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendSubscriptionPaused(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Your Subscription Has Been Paused';
      const html = this.generateSubscriptionPausedEmailHTML(data);
      const text = this.generateSubscriptionPausedEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending subscription paused email:', error);
      return { success: false, error: error.message };
    }
  }

  generateSubscriptionPausedEmailHTML(data) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Paused</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f59e0b; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Subscription Paused</h1>
        </div>
        <div class="content">
            <h2>Hello ${data.firstName || 'there'},</h2>
            <p>Your <strong>${data.planName || 'subscription'}</strong> has been paused.</p>
            <p>While paused, you won't be charged, but your premium features will be limited.</p>
            <p>When you're ready to resume, simply click the button below:</p>
            <div style="text-align: center;">
                <a href="${process.env.STRIPE_CUSTOMER_PORTAL_URL}" class="button">Resume Subscription</a>
            </div>
            <p>Your data and settings are safely preserved and will be waiting for you when you return.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateSubscriptionPausedEmailText(data) {
    return `
Subscription Paused

Hello ${data.firstName || 'there'},

Your ${data.planName || 'subscription'} has been paused.

While paused, you won't be charged, but your premium features will be limited.

When you're ready to resume, visit:
${process.env.STRIPE_CUSTOMER_PORTAL_URL}

Your data and settings are safely preserved and will be waiting for you when you return.

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendSubscriptionResumed(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Your Subscription Has Been Resumed';
      const html = this.generateSubscriptionResumedEmailHTML(data);
      const text = this.generateSubscriptionResumedEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending subscription resumed email:', error);
      return { success: false, error: error.message };
    }
  }

  generateSubscriptionResumedEmailHTML(data) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Resumed</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { background-color: #000000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Welcome Back!</h1>
        </div>
        <div class="content">
            <h2>Hello ${data.firstName || 'there'},</h2>
            <p>Great news! Your <strong>${data.planName || 'subscription'}</strong> has been resumed.</p>
            <p>All your premium features are now active again, and you're ready to continue amplifying your content.</p>
            <div style="text-align: center;">
                <a href="${process.env.BASE_URL}/videos" class="button">Go to My Videos</a>
            </div>
            <p>Thank you for being part of the AmplifyContent.ai community!</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateSubscriptionResumedEmailText(data) {
    return `
Welcome Back! Your Subscription Has Been Resumed

Hello ${data.firstName || 'there'},

Great news! Your ${data.planName || 'subscription'} has been resumed.

All your premium features are now active again, and you're ready to continue amplifying your content.

Go to your videos:
${process.env.BASE_URL}/videos

Thank you for being part of the AmplifyContent.ai community!

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendSubscriptionUpgraded(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Your Subscription Has Been Upgraded!';
      const html = this.generateSubscriptionUpgradedEmailHTML(data);
      const text = this.generateSubscriptionUpgradedEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending subscription upgraded email:', error);
      return { success: false, error: error.message };
    }
  }

  generateSubscriptionUpgradedEmailHTML(data) {
    const featuresList = data.newFeatures && data.newFeatures.length > 0
      ? `<ul style="margin: 15px 0; padding-left: 20px;">${data.newFeatures.map(f => `<li style="margin: 8px 0;">${f}</li>`).join('')}</ul>`
      : '';

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Upgraded</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #10b981; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .upgrade-badge { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
            .button { background-color: #000000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Congratulations!</h1>
        </div>
        <div class="content">
            <h2>Hello ${data.firstName || 'there'},</h2>
            <p>Your subscription has been successfully upgraded!</p>
            <p style="text-align: center; font-size: 18px;">
                <span style="color: #64748b; font-weight: bold;">${data.oldPlanName || 'Previous Plan'}</span>
                <span style="margin: 0 15px; color: #333;">→</span>
                <span style="background-color: #10b981; color: white; display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold;">${data.newPlanName || 'New Plan'}</span>
            </p>
            ${featuresList ? `<p>Your new plan includes:</p>${featuresList}` : ''}
            <p>Your upgraded features are now active and ready to use!</p>
            <div style="text-align: center;">
                <a href="${process.env.BASE_URL}/videos" class="button">Start Creating</a>
            </div>
            <p>Thank you for your continued trust in AmplifyContent.ai!</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateSubscriptionUpgradedEmailText(data) {
    const featuresList = data.newFeatures && data.newFeatures.length > 0
      ? `\nYour new plan includes:\n${data.newFeatures.map(f => `- ${f}`).join('\n')}\n`
      : '';

    return `
Congratulations! Your Subscription Has Been Upgraded!

Hello ${data.firstName || 'there'},

Your subscription has been successfully upgraded!

${data.oldPlanName || 'Previous Plan'} → ${data.newPlanName || 'New Plan'}
${featuresList}
Your upgraded features are now active and ready to use!

Start creating:
${process.env.BASE_URL}/videos

Thank you for your continued trust in AmplifyContent.ai!

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }

  async sendSubscriptionCancellationScheduled(email, data) {
    try {
      await this.ensureInitialized();
      const subject = 'Your Subscription Cancellation is Scheduled';
      const html = this.generateSubscriptionCancellationScheduledEmailHTML(data);
      const text = this.generateSubscriptionCancellationScheduledEmailText(data);

      return await this.sendEmail(email, subject, html, text);
    } catch (error) {
      logger.error('Error sending subscription cancellation scheduled email:', error);
      return { success: false, error: error.message };
    }
  }

  generateSubscriptionCancellationScheduledEmailHTML(data) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Cancellation Scheduled</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f59e0b; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { margin: 0; font-size: 28px; color: white; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .highlight { background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .button { background-color: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Cancellation Scheduled</h1>
        </div>
        <div class="content">
            <h2>Hello ${data.firstName || 'there'},</h2>
            <p>We've received your request to cancel your <strong>${data.planName || 'subscription'}</strong>.</p>
            <div class="highlight">
                <strong>Your subscription will remain active until ${data.endDate}.</strong>
                <p style="margin: 10px 0 0 0;">You'll continue to have full access to all your premium features until then.</p>
            </div>
            <p>Changed your mind? You can reactivate your subscription anytime before ${data.endDate}:</p>
            <div style="text-align: center;">
                <a href="${process.env.STRIPE_CUSTOMER_PORTAL_URL || process.env.BASE_URL + '/subscription/dashboard'}" class="button">Manage Subscription</a>
            </div>
            <p>We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you at <a href="mailto:support@amplifycontent.ai">support@amplifycontent.ai</a>.</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateSubscriptionCancellationScheduledEmailText(data) {
    return `
Cancellation Scheduled

Hello ${data.firstName || 'there'},

We've received your request to cancel your ${data.planName || 'subscription'}.

Your subscription will remain active until ${data.endDate}.
You'll continue to have full access to all your premium features until then.

Changed your mind? You can reactivate your subscription anytime before ${data.endDate}:
${process.env.STRIPE_CUSTOMER_PORTAL_URL || process.env.BASE_URL + '/subscription/dashboard'}

We're sorry to see you go! If there's anything we could have done better, we'd love to hear from you at support@amplifycontent.ai.

© ${new Date().getFullYear()} AmplifyContent.ai. All rights reserved.
    `;
  }
}

module.exports = new EmailService();
