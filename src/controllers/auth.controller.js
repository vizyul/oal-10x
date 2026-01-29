const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const { authService, emailService } = require('../services');
const sessionService = require('../services/session.service');
const { logger } = require('../utils');
const { getPostAuthRedirectUrl } = require('../utils/redirect.utils');

class AuthController {
  // GET /auth/sign-up - Step 1: Email input
  async renderSignUp(req, res) {
    try {
      // Check if user is already authenticated
      if (req.user) {
        return res.redirect(getPostAuthRedirectUrl(req.user));
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

  // GET /auth/sign-up/affiliate - Affiliate signup (redirects to /affiliate/signup after completion)
  async renderAffiliateSignUp(req, res) {
    try {
      // Check if user is already authenticated
      if (req.user) {
        // If already logged in, redirect to affiliate signup page
        return res.redirect('/affiliate/signup');
      }

      res.render('auth/signup-step1', {
        title: 'Join Our Affiliate Program',
        subtitle: 'Create your free account to start earning 20% commission',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 1,
        affiliateSignup: true, // Flag to track affiliate signup flow
        csrfToken: req.csrfToken ? req.csrfToken() : null
      });
    } catch (error) {
      logger.error('Error rendering affiliate sign up page:', error);
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
      const existingUser = await authService.findUserByEmailForVerification(email);
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
      let _pendingUser;
      try {
        if (existingUser && !existingUser.emailVerified) {
          // Update existing pending user

          _pendingUser = await authService.updateUser(existingUser.id, {
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
            'Registration Method': 'email',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          // eslint-disable-next-line no-unused-vars
          _pendingUser = await authService.createUser(userData);
        }
      } catch (dbError) {
        logger.error('Database operation failed:', dbError.message);
        // For development/demo purposes, log temporary user creation
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
      const { email, affiliateSignup } = req.query;

      if (!email) {
        return res.redirect('/auth/sign-up');
      }

      res.render('auth/signup-step2', {
        title: affiliateSignup === 'true' ? 'Verify your email to join affiliates' : 'Verify your email',
        subtitle: `We sent a 6-digit code to ${email}`,
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 2,
        email,
        affiliateSignup: affiliateSignup === 'true',
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
      const user = await authService.findUserByEmailForVerification(email);
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

      // Check if this is affiliate signup flow
      const affiliateSignup = req.body.affiliateSignup === 'true';
      const completeUrl = `/auth/sign-up/complete?email=${encodeURIComponent(email)}&token=${tempToken}${affiliateSignup ? '&affiliateSignup=true' : ''}`;

      // For API requests
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(200).json({
          success: true,
          message: 'Email verified! Please complete your profile.',
          data: {
            email,
            tempToken,
            redirectTo: completeUrl
          }
        });
      }

      // Redirect to final step
      res.redirect(completeUrl);

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
      const { email, token, affiliateSignup } = req.query;

      if (!email || !token) {
        return res.redirect('/auth/sign-up');
      }

      // Verify temp token
      const user = await authService.findUserByEmailForVerification(email);
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

      const isAffiliateSignup = affiliateSignup === 'true';

      res.render('auth/signup-step3', {
        title: isAffiliateSignup ? 'Complete your profile to join affiliates' : 'Complete your profile',
        subtitle: isAffiliateSignup ? 'One more step to start earning commissions' : 'Just a few more details to get started',
        layout: 'auth',
        showHeader: false,
        showFooter: false,
        step: 3,
        email,
        token,
        affiliateSignup: isAffiliateSignup,
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
      const user = await authService.findUserByEmailForVerification(email);
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

      // Get referral code from request body (passed from frontend localStorage)
      const referralCode = req.body.referralCode || null;

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
        'Registration Method': 'email',
        subscription_tier: 'free',
        subscription_status: 'none',
        referred_by_code: referralCode, // Store referral code
        updatedAt: new Date().toISOString()
      });

      logger.info(`Registration completed for user: ${user.id}`);

      // Initialize free subscription (1 video limit)
      try {
        const subscriptionService = require('../services/subscription.service');
        await subscriptionService.initializeFreeUserSubscription(user.id);
        logger.info(`Initialized free subscription for user ${user.id}`);
      } catch (subError) {
        logger.error('Error initializing free subscription:', subError);
        // Don't fail registration if subscription setup fails
      }

      // Send welcome email and mark as sent
      try {
        await emailService.sendWelcomeEmail(email, firstName);

        // Mark that welcome email has been sent
        await authService.updateUser(user.id, {
          'Welcome Email Sent': true,
          'Welcome Email Sent At': new Date().toISOString()
        });

        logger.info(`Welcome email sent to ${email}`);
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // Don't fail the registration if welcome email fails
      }

      // Add user to BREVO CRM as trial user
      try {
        const brevoService = require('../services/brevo.service');
        await brevoService.addTrialUser({
          email,
          firstName,
          lastName,
          userId: user.id
        });
      } catch (brevoError) {
        logger.error('BREVO integration error during signup:', brevoError);
        // Don't fail registration if BREVO fails
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
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      };

      res.cookie('auth_token', jwtToken, cookieOptions);

      // Record signup session
      await sessionService.recordSignup(updatedUser, req, 'email');

      // Check if this is an affiliate signup flow
      const isAffiliateSignup = req.body.affiliateSignup === 'true';
      const redirectUrl = isAffiliateSignup
        ? '/affiliate/signup'
        : getPostAuthRedirectUrl({ id: user.id, email: user.email, firstName, lastName, subscription_tier: 'free' });

      // For API requests
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
        return res.status(201).json({
          success: true,
          message: isAffiliateSignup
            ? 'Account created! Now complete your affiliate registration.'
            : 'Account created successfully! Welcome to AmplifyContent.ai.',
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName,
              lastName
            },
            token: jwtToken,
            redirectTo: redirectUrl
          }
        });
      }

      // Redirect based on signup flow
      req.flash('success', isAffiliateSignup
        ? 'Account created! Complete your affiliate registration below.'
        : 'Welcome to AmplifyContent.ai! Your account has been created successfully.');
      res.redirect(redirectUrl);

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
      const user = await authService.findUserByEmailForVerification(email);
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
        return res.redirect(getPostAuthRedirectUrl(req.user));
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

      // Find user (with password for authentication)
      const user = await authService.findUserByEmailForAuth(email);
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

      // Check if user has a password
      if (!user.password) {
        // Check if this is a social login user or a data integrity issue
        const hasOauthProvider = user.oauthProvider && user.oauthId;
        const errorMessage = hasOauthProvider
          ? 'This account was created using social login. Please sign in with your social provider.'
          : 'This account appears to have no password set. Please contact support or try resetting your password.';

        return res.status(401).json({
          success: false,
          message: errorMessage,
          error: 'NO_PASSWORD_SET'
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
        sameSite: 'lax',
        maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000 // 30 days or 7 days
      };

      res.cookie('auth_token', token, cookieOptions);

      // Record login session
      await sessionService.recordLogin(user, req, 'email');

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
            redirectTo: getPostAuthRedirectUrl(user)
          }
        });
      }

      // For regular form submission
      res.redirect(getPostAuthRedirectUrl(user));

    } catch (error) {
      logger.error('Sign in error details:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        detail: error.detail,
        name: error.name
      });

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
      // End active sessions if user is authenticated
      if (req.user && req.user.id) {
        // End active sessions by updating them with Ended At timestamp
        await sessionService.endUserSessions(req.user.id);
        logger.info(`Active sessions ended for user: ${req.user.id}`);
      }

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
