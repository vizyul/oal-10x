const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { authService, airtableService, emailService } = require('../services');
const { logger } = require('../utils');

class AuthController {
  // GET /auth/sign-up - Step 1: Email input
  async renderSignUp(req, res) {
    try {
      // Check if user is already authenticated
      if (req.user) {
        return res.redirect('/dashboard');
      }

      res.render('auth/signup-step1', {
        title: 'Start your FREE trial',
        subtitle: 'You\'re two minutes away from saving hours every week.',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 1,
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (error) {
      logger.error('Error rendering sign up page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the sign up page. Please try again later.'
      });
    }
  }

  // POST /auth/sign-up/send-code - Step 1: Send verification code
  async sendVerificationCode(req, res) {
    try {
      const { email } = req.body;

      logger.info(`Sending verification code to: ${email}`);

      // Check if user already exists (only if Airtable is configured)
      const existingUser = await authService.findUserByEmail(email);
      if (existingUser && existingUser.emailVerified) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email address already exists.',
          error: 'USER_EXISTS',
          field: 'email'
        });
      }

      // Generate 6-digit verification code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Create or update pending user record (if Airtable is configured)
      let pendingUser;
      try {
        if (existingUser && !existingUser.emailVerified) {
          // Update existing pending user
          pendingUser = await authService.updateUser(existingUser.id, {
            emailVerificationToken: verificationCode,
            emailVerificationExpires: codeExpires.toISOString(),
            updatedAt: new Date().toISOString()
          });
        } else {
          // Create new pending user record
          const userData = {
            email,
            emailVerified: false,
            emailVerificationToken: verificationCode,
            emailVerificationExpires: codeExpires.toISOString(),
            status: 'pending_verification',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          pendingUser = await authService.createUser(userData);
        }
      } catch (dbError) {
        logger.error('Database operation failed:', dbError.message);
        // For development/demo purposes, create a temporary user object
        pendingUser = {
          id: 'temp_' + Date.now(),
          email,
          emailVerificationToken: verificationCode,
          emailVerificationExpires: codeExpires.toISOString()
        };
        logger.warn('Created temporary user record for demonstration purposes');
      }

      // Send verification code email
      try {
        await emailService.sendVerificationCode(email, verificationCode);
        logger.info(`Verification code sent to ${email}`);
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        // Continue with the flow even if email fails (for development)
        logger.warn(`Verification code for ${email}: ${verificationCode}`);
      }

      // For API requests (AJAX)
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(200).json({
          success: true,
          message: 'Verification code sent! Please check your email.',
          data: {
            email,
            codeExpires: codeExpires.toISOString()
          }
        });
      }

      // Redirect to verification step
      res.redirect(`/auth/sign-up/verify?email=${encodeURIComponent(email)}`);

    } catch (error) {
      logger.error('Send verification code error:', error);

      const errorMessage = 'Unable to send verification code. Please try again.';

      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: 'INTERNAL_SERVER_ERROR'
        });
      }

      req.flash('error', errorMessage);
      res.redirect('/auth/sign-up');
    }
  }

  // GET /auth/sign-up/verify - Step 2: Code verification
  async renderVerifyCode(req, res) {
    try {
      const { email } = req.query;

      if (!email) {
        return res.redirect('/auth/sign-up');
      }

      res.render('auth/signup-step2', {
        title: 'Verify your email',
        subtitle: `We sent a 6-digit code to ${email}`,
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 2,
        email,
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (error) {
      logger.error('Error rendering verify code page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the verification page. Please try again later.'
      });
    }
  }

  // POST /auth/sign-up/verify-code - Step 2: Verify the 6-digit code
  async verifyCode(req, res) {
    try {
      const { email, code } = req.body;

      logger.info(`Verifying code for email: ${email}`);

      // Find pending user
      const user = await authService.findUserByEmail(email);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification request.',
          error: 'USER_NOT_FOUND'
        });
      }

      // Check if code matches and hasn't expired
      if (user.emailVerificationToken !== code) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification code.',
          error: 'INVALID_CODE',
          field: 'code'
        });
      }

      const now = new Date();
      const expiryDate = new Date(user.emailVerificationExpires);
      
      if (now > expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'Verification code has expired. Please request a new one.',
          error: 'CODE_EXPIRED',
          field: 'code'
        });
      }

      // Code is valid, generate temporary session token for final step
      const tempToken = crypto.randomBytes(32).toString('hex');
      const tempTokenExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Update user with temp token
      await authService.updateUser(user.id, {
        emailVerificationToken: tempToken,
        emailVerificationExpires: tempTokenExpires.toISOString(),
        updatedAt: new Date().toISOString()
      });

      logger.info(`Code verified for user: ${user.id}`);

      // For API requests
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(200).json({
          success: true,
          message: 'Email verified! Please complete your profile.',
          data: {
            email,
            tempToken,
            redirectTo: `/auth/sign-up/complete?email=${encodeURIComponent(email)}&token=${tempToken}`
          }
        });
      }

      // Redirect to final step
      res.redirect(`/auth/sign-up/complete?email=${encodeURIComponent(email)}&token=${tempToken}`);

    } catch (error) {
      logger.error('Verify code error:', error);

      const errorMessage = 'Unable to verify code. Please try again.';

      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: 'INTERNAL_SERVER_ERROR'
        });
      }

      req.flash('error', errorMessage);
      res.redirect('/auth/sign-up');
    }
  }

  // GET /auth/sign-up/complete - Step 3: Complete profile
  async renderCompleteProfile(req, res) {
    try {
      const { email, token } = req.query;

      if (!email || !token) {
        return res.redirect('/auth/sign-up');
      }

      // Verify temp token
      const user = await authService.findUserByEmail(email);
      if (!user || user.emailVerificationToken !== token) {
        req.flash('error', 'Invalid or expired verification link.');
        return res.redirect('/auth/sign-up');
      }

      // Check token expiry
      const now = new Date();
      const expiryDate = new Date(user.emailVerificationExpires);
      
      if (now > expiryDate) {
        req.flash('error', 'Verification session has expired. Please start over.');
        return res.redirect('/auth/sign-up');
      }

      res.render('auth/signup-step3', {
        title: 'Complete your profile',
        subtitle: 'Just a few more details to get started',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 3,
        email,
        token,
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (error) {
      logger.error('Error rendering complete profile page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the page. Please try again later.'
      });
    }
  }

  // POST /auth/sign-up/complete - Step 3: Complete registration
  async completeRegistration(req, res) {
    try {
      const { email, token, firstName, lastName, password, terms, privacy } = req.body;

      logger.info(`Completing registration for email: ${email}`);

      // Find and verify user
      const user = await authService.findUserByEmail(email);
      if (!user || user.emailVerificationToken !== token) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification session.',
          error: 'INVALID_SESSION'
        });
      }

      // Check token expiry
      const now = new Date();
      const expiryDate = new Date(user.emailVerificationExpires);
      
      if (now > expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'Verification session has expired. Please start over.',
          error: 'SESSION_EXPIRED'
        });
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Complete user registration
      const updatedUser = await authService.updateUser(user.id, {
        firstName,
        lastName,
        password: hashedPassword,
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        termsAccepted: terms === 'true',
        privacyAccepted: privacy === 'true',
        status: 'active',
        updatedAt: new Date().toISOString()
      });

      logger.info(`Registration completed for user: ${user.id}`);

      // Send welcome email
      try {
        await emailService.sendWelcomeEmail(email, firstName);
        logger.info(`Welcome email sent to ${email}`);
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // Don't fail the registration if welcome email fails
      }

      // Generate JWT token for immediate login
      const jwtToken = jwt.sign(
        { 
          userId: user.id,
          email: email  // Use email from request
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      // Set auth cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      };

      res.cookie('auth_token', jwtToken, cookieOptions);

      // For API requests
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(201).json({
          success: true,
          message: 'Account created successfully! Welcome to Our AI Legacy.',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName,
              lastName
            },
            token: jwtToken,
            redirectTo: '/dashboard'
          }
        });
      }

      // Redirect to dashboard
      req.flash('success', 'Welcome to Our AI Legacy! Your account has been created successfully.');
      res.redirect('/dashboard');

    } catch (error) {
      logger.error('Complete registration error:', error);

      const errorMessage = 'Unable to complete registration. Please try again.';

      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: 'INTERNAL_SERVER_ERROR'
        });
      }

      req.flash('error', errorMessage);
      res.redirect('/auth/sign-up');
    }
  }

  // POST /auth/sign-up/resend-code - Resend verification code
  async resendVerificationCode(req, res) {
    try {
      const { email } = req.body;

      logger.info(`Resending verification code to: ${email}`);

      // Find user
      const user = await authService.findUserByEmail(email);
      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'User not found.',
          error: 'USER_NOT_FOUND'
        });
      }

      // Generate new 6-digit code
      const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Update user with new code
      await authService.updateUser(user.id, {
        emailVerificationToken: verificationCode,
        emailVerificationExpires: codeExpires.toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Send verification code email
      try {
        await emailService.sendVerificationCode(email, verificationCode);
        logger.info(`New verification code sent to ${email}`);
      } catch (emailError) {
        logger.error('Failed to send verification email:', emailError);
        // Continue with the flow even if email fails (for development)
        logger.warn(`New verification code for ${email}: ${verificationCode}`);
      }

      res.status(200).json({
        success: true,
        message: 'New verification code sent!',
        data: {
          codeExpires: codeExpires.toISOString()
        }
      });

    } catch (error) {
      logger.error('Resend verification code error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to resend verification code. Please try again.',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  // Legacy signup method (redirect to new flow)
  async signUp(req, res) {
    // Redirect old signup requests to new flow
    res.redirect('/auth/sign-up');
  }

  // GET /auth/sign-in
  async renderSignIn(req, res) {
    try {
      // Check if user is already authenticated
      if (req.user) {
        return res.redirect('/dashboard');
      }

      const { verified } = req.query;
      let message = '';

      if (verified === 'pending') {
        message = 'Please check your email and click the verification link to activate your account.';
      }

      res.render('auth/signin', {
        title: 'Sign In',
        subtitle: 'Welcome back! Please sign in to your account.',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        message,
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (error) {
      logger.error('Error rendering sign in page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the sign in page. Please try again later.'
      });
    }
  }

  // POST /auth/sign-in
  async signIn(req, res) {
    try {
      const { email, password, remember } = req.body;

      logger.info(`Sign in attempt for email: ${email}`);

      // Find user
      const user = await authService.findUserByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return res.status(401).json({
          success: false,
          message: 'Please verify your email address before signing in.',
          error: 'EMAIL_NOT_VERIFIED'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
          error: 'INVALID_CREDENTIALS'
        });
      }

      // Generate JWT token with user data to reduce database calls
      const tokenExpiry = remember ? '30d' : process.env.JWT_EXPIRES_IN || '7d';
      const token = jwt.sign(
        { 
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          emailVerified: user.emailVerified,
          status: user.status,
          iat: Math.floor(Date.now() / 1000) // issued at timestamp
        },
        process.env.JWT_SECRET,
        { expiresIn: tokenExpiry }
      );

      // Update last login asynchronously (don't block the response)
      authService.updateUser(user.id, {
        lastLoginAt: new Date().toISOString()
      }).catch(error => {
        logger.error('Failed to update last login time:', error);
      });

      // Set cookie
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000 // 30 days or 7 days
      };

      res.cookie('auth_token', token, cookieOptions);

      logger.info(`User signed in successfully: ${user.id}`);

      // For API requests
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(200).json({
          success: true,
          message: 'Signed in successfully!',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName
            },
            token,
            redirectTo: '/dashboard'
          }
        });
      }

      // For regular form submission
      res.redirect('/dashboard');

    } catch (error) {
      logger.error('Sign in error:', error);

      const errorMessage = 'Unable to sign in. Please try again.';

      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: 'INTERNAL_SERVER_ERROR'
        });
      }

      req.flash('error', errorMessage);
      res.redirect('/auth/sign-in');
    }
  }

  // GET/POST /auth/logout
  async logout(req, res) {
    try {
      res.clearCookie('auth_token');
      
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(200).json({
          success: true,
          message: 'Logged out successfully'
        });
      }

      // Set flash message if flash is available
      if (req.flash) {
        req.flash('success', 'You have been logged out successfully.');
      }
      
      res.redirect('/auth/sign-in');
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Error during logout',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  // GET /auth/verify-email/:token (legacy method)
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;

      const user = await authService.verifyEmailToken(token);
      if (!user) {
        return res.render('auth/verification-failed', {
          title: 'Email Verification Failed',
          message: 'Invalid or expired verification link.',
          layout: 'auth'
        });
      }

      logger.info(`Email verified for user: ${user.id}`);

      res.render('auth/verification-success', {
        title: 'Email Verified Successfully',
        message: 'Your email has been verified! You can now sign in to your account.',
        layout: 'auth',
        signInUrl: '/auth/sign-in'
      });

    } catch (error) {
      logger.error('Email verification error:', error);
      res.render('auth/verification-failed', {
        title: 'Email Verification Failed',
        message: 'An error occurred during email verification.',
        layout: 'auth'
      });
    }
  }

  // GET /auth/forgot-password
  async renderForgotPassword(req, res) {
    try {
      res.render('auth/forgot-password', {
        title: 'Forgot Password',
        subtitle: 'Enter your email to reset your password',
        layout: 'auth',
        showHeader: false,
        showFooter: false
      });
    } catch (error) {
      logger.error('Error rendering forgot password page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the page. Please try again later.'
      });
    }
  }

  // POST /auth/forgot-password
  async forgotPassword(req, res) {
    try {
      // Implementation for password reset
      res.status(501).json({
        success: false,
        message: 'Password reset feature coming soon'
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to process password reset request',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }

  // GET /auth/reset-password/:token
  async renderResetPassword(req, res) {
    try {
      const { token } = req.params;
      
      res.render('auth/reset-password', {
        title: 'Reset Password',
        subtitle: 'Enter your new password',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        token
      });
    } catch (error) {
      logger.error('Error rendering reset password page:', error);
      res.status(500).render('errors/500', {
        title: 'Server Error',
        message: 'Unable to load the page. Please try again later.'
      });
    }
  }

  // POST /auth/reset-password/:token
  async resetPassword(req, res) {
    try {
      // Implementation for password reset
      res.status(501).json({
        success: false,
        message: 'Password reset feature coming soon'
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Unable to reset password',
        error: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
}

module.exports = new AuthController();