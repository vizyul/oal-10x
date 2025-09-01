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
    } catch (error) {
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
          subject: 'Verify Your Email - Our AI Legacy',
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
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@ourailegacy.com',
        to: email,
        subject: 'Verify Your Email - Our AI Legacy',
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
            .header h1 { color: #c99b31; margin: 0 0 10px 0; font-size: 28px; }
            .header h2 { color: white; margin: 0; font-size: 20px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .verification-code { background-color: #c99b31; color: #000000; font-size: 36px; font-weight: bold; text-align: center; padding: 20px; margin: 20px 0; border-radius: 8px; letter-spacing: 8px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
            .button { background-color: #000000; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Our AI Legacy</h1>
            <h2>Email Verification</h2>
        </div>
        <div class="content">
            <p>Thank you for signing up! To complete your registration, please verify your email address by entering the following 6-digit code:</p>
            
            <div class="verification-code">${code}</div>
            
            <p>This code will expire in 10 minutes. If you didn't request this verification, you can safely ignore this email.</p>
            
            <p>Welcome to Our AI Legacy - where your ministry content comes to life through AI!</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Our AI Legacy. All rights reserved.</p>
            <p>This is an automated email, please do not reply.</p>
        </div>
    </body>
    </html>`;
  }

  generateVerificationEmailText(code) {
    return `
Our AI Legacy - Email Verification

Thank you for signing up! To complete your registration, please verify your email address by entering the following 6-digit code:

${code}

This code will expire in 10 minutes. If you didn't request this verification, you can safely ignore this email.

Welcome to Our AI Legacy - where your ministry content comes to life through AI!

© ${new Date().getFullYear()} Our AI Legacy. All rights reserved.
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

  async sendWelcomeEmailViaGraph(email, firstName) {
    try {
      const accessToken = await this.getAccessToken();
      
      const emailMessage = {
        message: {
          subject: 'Welcome to Our AI Legacy!',
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
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@ourailegacy.com',
        to: email,
        subject: 'Welcome to Our AI Legacy!',
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
        <title>Welcome to Our AI Legacy</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000000; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .header h1 { color: #c99b31; margin: 0; font-size: 28px; }
            .content { background-color: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px; }
            .footer { text-align: center; margin-top: 30px; font-size: 14px; color: #64748b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Welcome to Our AI Legacy!</h1>
        </div>
        <div class="content">
            <h2>Hello ${firstName}!</h2>
            <p>Welcome to Our AI Legacy! Your account has been successfully created and verified.</p>
            
            <p>You can now start using our platform to bring your ministry content to life through AI. Explore our features and begin your journey with us.</p>
            
            <p>If you have any questions or need assistance, feel free to reach out to our support team at <a href="mailto:support@ourailegacy.com" style="color: #c99b31; text-decoration: none;">support@ourailegacy.com</a>.</p>
            
            <p>God bless!</p>
            <p>The Our AI Legacy Team</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Our AI Legacy. All rights reserved.</p>
        </div>
    </body>
    </html>`;
  }

  generateWelcomeEmailText(firstName) {
    return `
Welcome to Our AI Legacy!

Hello ${firstName}!

Welcome to Our AI Legacy! Your account has been successfully created and verified.

You can now start using our platform to bring your ministry content to life through AI. Explore our features and begin your journey with us.

If you have any questions or need assistance, feel free to reach out to our support team at support@ourailegacy.com.

God bless!
The Our AI Legacy Team

© ${new Date().getFullYear()} Our AI Legacy. All rights reserved.
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
        from: process.env.AZURE_EMAIL_ADDRESS || 'noreply@ourailegacy.com',
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
}

module.exports = new EmailService();