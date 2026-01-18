const nodemailer = require('nodemailer');
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { logger } = require('../utils');

class EmailService {
  constructor() {
    this.transporter = null;
    this.msalInstance = null;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.initialized = false;
    this.useGraphAPI = false;
    this.init();
  }

  async init() {
    try {
      // Try Graph API first now that EWS is enabled
      if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
        logger.info('Initializing email service with Microsoft Graph API...');
        await this.initGraphAPI();
      }
      // Fallback to SMTP if Graph API not configured
      else if (process.env.AZURE_EMAIL_ADDRESS) {
        logger.info('Initializing email service with Azure SMTP...');
        await this.initSMTP();
      } else {
        // No email credentials provided
        this.transporter = null;
        this.useGraphAPI = false;
        logger.info('Email service initialized in development mode - emails will be logged to console');
        logger.warn('To enable email sending, configure either:');
        logger.warn('  Graph API: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, AZURE_EMAIL_ADDRESS');
        logger.warn('  Or SMTP: AZURE_EMAIL_ADDRESS, AZURE_EMAIL_PASSWORD');
      }

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize email service:', error);

      // Fall back to development mode if authentication fails
      this.transporter = null;
      this.useGraphAPI = false;
      logger.warn('Falling back to development mode - emails will be logged to console');
      this.initialized = true; // Mark as initialized even on failure
    }
  }

  async initGraphAPI() {
    try {
      const msalConfig = {
        auth: {
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
        }
      };

      this.msalInstance = new ConfidentialClientApplication(msalConfig);

      // Get initial access token
      await this.getAccessToken();

      this.useGraphAPI = true;
      logger.info('Email service initialized successfully with Microsoft Graph API');
    } catch (error) {
      logger.error('Failed to initialize Microsoft Graph API:', error);
      throw error;
    }
  }

  async initSMTPWithOAuth2() {
    try {
      // Initialize MSAL first
      const msalConfig = {
        auth: {
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
        }
      };

      this.msalInstance = new ConfidentialClientApplication(msalConfig);

      // Get access token for SMTP OAuth2
      const accessToken = await this.getAccessToken();

      this.transporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 25,
        secure: false,
        auth: {
          type: 'OAuth2',
          user: process.env.AZURE_EMAIL_ADDRESS,
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          accessToken: accessToken,
          method: 'XOAUTH2'
        },
        tls: {
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2'
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      this.useGraphAPI = false;
      logger.info('Email service initialized with OAuth2 SMTP');
    } catch (error) {
      logger.error('Failed to initialize OAuth2 SMTP:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      throw error;
    }
  }

  async initSMTP() {
    try {
      // Use OAuth2 for SMTP if we have Graph API credentials but no password
      if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && !process.env.AZURE_EMAIL_PASSWORD) {
        await this.initSMTPWithOAuth2();
      } else {
        // Traditional SMTP with password
        this.transporter = nodemailer.createTransport({
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          auth: {
            user: process.env.AZURE_EMAIL_ADDRESS,
            pass: process.env.AZURE_EMAIL_PASSWORD
          },
          tls: {
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2'
          },
          authMethod: 'PLAIN',
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000
        });
      }

      // Verify the connection (non-blocking)
      const verified = await this.verifyConnection();
      if (verified) {
        logger.info('Email service initialized and verified successfully with Azure SMTP');
      } else {
        logger.warn('Email service initialized but SMTP verification failed');
      }

      this.useGraphAPI = false;
    } catch (error) {
      logger.error('Failed to initialize SMTP:', error);
      throw error;
    }
  }

  async getAccessToken() {
    try {
      // Check if current token is still valid
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry - 60000) {
        return this.accessToken;
      }

      const clientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default'],
      };

      const response = await this.msalInstance.acquireTokenSilent(clientCredentialRequest);

      this.accessToken = response.accessToken;
      this.tokenExpiry = response.expiresOn.getTime();

      return this.accessToken;
    // eslint-disable-next-line no-unused-vars
    } catch (_error) {
      // If silent token acquisition fails, try to acquire token
      try {
        const response = await this.msalInstance.acquireTokenByClientCredential({
          scopes: ['https://graph.microsoft.com/.default']
        });

        this.accessToken = response.accessToken;
        this.tokenExpiry = response.expiresOn.getTime();

        return this.accessToken;
      } catch (clientError) {
        logger.error('Failed to acquire access token:', clientError);
        throw clientError;
      }
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    }
  }

  async verifyConnection() {
    try {
      if (this.transporter && typeof this.transporter.verify === 'function') {
        await this.transporter.verify();
        logger.info('Email transporter verified successfully');
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Email transporter verification failed:', error);
      return false;
    }
  }

  async sendVerificationCode(email, verificationCode) {
    try {
      await this.ensureInitialized();

      if (this.useGraphAPI) {
        return await this.sendEmailViaGraph(email, verificationCode);
      } else if (this.transporter) {
        return await this.sendEmailViaSMTP(email, verificationCode);
      } else {
        logger.warn(`No email service configured. Verification code for ${email}: ${verificationCode}`);
        return {
          success: true,
          messageId: 'dev-mode',
          previewUrl: null
        };
      }
    } catch (error) {
      logger.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendEmailViaGraph(email, verificationCode) {
    try {
      const accessToken = await this.getAccessToken();

      const emailMessage = {
        message: {
          subject: 'Verify Your Email - AmplifyContent.ai',
          body: {
            contentType: 'HTML',
            content: this.generateVerificationEmailHTML(verificationCode)
          },
          toRecipients: [
            {
              emailAddress: {
                address: email
              }
            }
          ],
          from: {
            emailAddress: {
              address: process.env.AZURE_EMAIL_ADDRESS
            }
          }
        },
        saveToSentItems: false
      };

      // Use user-specific endpoint directly (works with application permissions)
      const endpoint = `https://graph.microsoft.com/v1.0/users/${process.env.AZURE_EMAIL_ADDRESS}/sendMail`;

      const response = await axios.post(
        endpoint,
        emailMessage,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Verification email sent via Graph API to ${email}`, {
        status: response.status,
        statusText: response.statusText
      });

      return {
        success: true,
        messageId: `graph-${Date.now()}`,
        previewUrl: null
      };
    } catch (error) {
      logger.error('Error sending email via Graph API:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendEmailViaSMTP(email, verificationCode) {
    try {
      const mailOptions = {
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@amplifycontent.ai',
        to: email,
        subject: 'Verify Your Email - AmplifyContent.ai',
        html: this.generateVerificationEmailHTML(verificationCode),
        text: this.generateVerificationEmailText(verificationCode)
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV !== 'production') {
        logger.info('Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      logger.info(`Verification email sent via SMTP to ${email}`, {
        messageId: info.messageId,
        response: info.response
      });

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
      };
    } catch (error) {
      logger.error('Error sending email via SMTP:', error);
      throw error;
    }
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

      if (this.useGraphAPI) {
        return await this.sendWelcomeEmailViaGraph(email, firstName);
      } else if (this.transporter) {
        return await this.sendWelcomeEmailViaSMTP(email, firstName);
      } else {
        logger.warn(`No email service configured. Welcome email for ${email} (${firstName}) not sent.`);
        return {
          success: true,
          messageId: 'dev-mode'
        };
      }
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

  async sendWelcomeEmailViaGraph(email, firstName) {
    try {
      const accessToken = await this.getAccessToken();

      const emailMessage = {
        message: {
          subject: 'Welcome to AmplifyContent.ai!',
          body: {
            contentType: 'HTML',
            content: this.generateWelcomeEmailHTML(firstName)
          },
          toRecipients: [
            {
              emailAddress: {
                address: email
              }
            }
          ],
          from: {
            emailAddress: {
              address: process.env.AZURE_EMAIL_ADDRESS
            }
          }
        },
        saveToSentItems: false
      };

      // Use user-specific endpoint directly (works with application permissions)
      const endpoint = `https://graph.microsoft.com/v1.0/users/${process.env.AZURE_EMAIL_ADDRESS}/sendMail`;

      const response = await axios.post(
        endpoint,
        emailMessage,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Welcome email sent via Graph API to ${email}`, {
        status: response.status,
        statusText: response.statusText
      });

      return {
        success: true,
        messageId: `graph-welcome-${Date.now()}`
      };
    } catch (error) {
      logger.error('Error sending welcome email via Graph API:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendWelcomeEmailViaSMTP(email, firstName) {
    try {
      const mailOptions = {
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@amplifycontent.ai',
        to: email,
        subject: 'Welcome to AmplifyContent.ai!',
        html: this.generateWelcomeEmailHTML(firstName),
        text: this.generateWelcomeEmailText(firstName)
      };

      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV !== 'production') {
        logger.info('Welcome email preview URL:', nodemailer.getTestMessageUrl(info));
      }

      logger.info(`Welcome email sent via SMTP to ${email}`, {
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      logger.error('Error sending welcome email via SMTP:', error);
      throw error;
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

  async sendEmail(to, subject, htmlContent, textContent = null) {
    try {
      await this.ensureInitialized();

      if (this.useGraphAPI) {
        return await this.sendEmailViaGraphGeneric(to, subject, htmlContent);
      } else if (this.transporter) {
        return await this.sendEmailViaSMTPGeneric(to, subject, htmlContent, textContent);
      } else {
        logger.warn(`No email service configured. Email to ${to} with subject "${subject}" not sent.`);
        return {
          success: true,
          messageId: 'dev-mode',
          previewUrl: null
        };
      }
    } catch (error) {
      logger.error('Error sending email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendEmailViaGraphGeneric(to, subject, htmlContent) {
    try {
      const accessToken = await this.getAccessToken();

      const emailMessage = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: htmlContent
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ],
          from: {
            emailAddress: {
              address: process.env.AZURE_EMAIL_ADDRESS
            }
          }
        },
        saveToSentItems: false
      };

      // Use user-specific endpoint directly (works with application permissions)
      const endpoint = `https://graph.microsoft.com/v1.0/users/${process.env.AZURE_EMAIL_ADDRESS}/sendMail`;

      const response = await axios.post(
        endpoint,
        emailMessage,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Email sent via Graph API to ${to}`, {
        status: response.status,
        statusText: response.statusText
      });

      return {
        success: true,
        messageId: `graph-${Date.now()}`,
        previewUrl: null
      };
    } catch (error) {
      logger.error('Error sending email via Graph API:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendEmailViaSMTPGeneric(to, subject, htmlContent, textContent) {
    try {
      const mailOptions = {
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@amplifycontent.ai',
        to: to,
        subject: subject,
        html: htmlContent
      };

      if (textContent) {
        mailOptions.text = textContent;
      }

      const info = await this.transporter.sendMail(mailOptions);

      if (process.env.NODE_ENV !== 'production') {
        logger.info('Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      logger.info(`Email sent via SMTP to ${to}`, {
        messageId: info.messageId,
        response: info.response
      });

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: process.env.NODE_ENV !== 'production' ? nodemailer.getTestMessageUrl(info) : null
      };
    } catch (error) {
      logger.error('Error sending email via SMTP:', error);
      throw error;
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
