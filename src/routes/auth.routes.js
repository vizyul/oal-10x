const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');

const { authController } = require('../controllers');
const { validationMiddleware } = require('../middleware');
const authService = require('../services/auth.service');
const { logger } = require('../utils');

const router = express.Router();

// Rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// More restrictive rate limiting for code sending
const codeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // Limit each IP to 3 code requests per 5 minutes
  message: {
    success: false,
    message: 'Too many verification code requests. Please wait before trying again.',
    error: 'CODE_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// SIGNUP FLOW ROUTES (3-step process)

// Step 1: GET /auth/sign-up - Display email input form
router.get('/sign-up', authController.renderSignUp);

// Step 1: POST /auth/sign-up/send-code - Send verification code to email
router.post('/sign-up/send-code', 
  codeLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address')
  ],
  validationMiddleware,
  authController.sendVerificationCode
);

// Step 2: GET /auth/sign-up/verify - Display code verification form
router.get('/sign-up/verify', authController.renderVerifyCode);

// Step 2: POST /auth/sign-up/verify-code - Verify the 6-digit code
router.post('/sign-up/verify-code',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('code')
      .isLength({ min: 6, max: 6 })
      .isNumeric()
      .withMessage('Please enter a valid 6-digit code')
  ],
  validationMiddleware,
  authController.verifyCode
);

// Step 2: POST /auth/sign-up/resend-code - Resend verification code
router.post('/sign-up/resend-code',
  codeLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address')
  ],
  validationMiddleware,
  authController.resendVerificationCode
);

// Step 3: GET /auth/sign-up/complete - Display profile completion form
router.get('/sign-up/complete', authController.renderCompleteProfile);

// Step 3: POST /auth/sign-up/complete - Complete registration
router.post('/sign-up/complete',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('token')
      .notEmpty()
      .withMessage('Invalid verification session'),
    body('firstName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('First name must be between 2 and 50 characters')
      .matches(/^[A-Za-z\s'-]+$/)
      .withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
    body('lastName')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Last name must be between 2 and 50 characters')
      .matches(/^[A-Za-z\s'-]+$/)
      .withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('terms')
      .equals('true')
      .withMessage('You must agree to the Terms & Conditions'),
    body('privacy')
      .equals('true')
      .withMessage('You must agree to the Privacy Policy')
  ],
  validationMiddleware,
  authController.completeRegistration
);

// Legacy signup route (redirects to new flow)
router.post('/sign-up', authController.signUp);

// SIGNIN ROUTES

// GET /auth/sign-in - Display sign in form
router.get('/sign-in', authController.renderSignIn);

// POST /auth/sign-in - Process sign in
router.post('/sign-in',
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address'),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
  ],
  validationMiddleware,
  authController.signIn
);

// LOGOUT ROUTES

// GET /auth/logout - Logout user (browser navigation)
router.get('/logout', authController.logout);

// POST /auth/logout - Logout user (form/AJAX)
router.post('/logout', authController.logout);

// EMAIL VERIFICATION ROUTES (legacy)

// GET /auth/verify-email/:token - Email verification (legacy)
router.get('/verify-email/:token', authController.verifyEmail);

// PASSWORD RESET ROUTES

// GET /auth/forgot-password - Display forgot password form
router.get('/forgot-password', authController.renderForgotPassword);

// POST /auth/forgot-password - Process forgot password
router.post('/forgot-password', 
  authLimiter,
  [
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email address')
  ],
  validationMiddleware,
  authController.forgotPassword
);

// GET /auth/reset-password/:token - Display reset password form
router.get('/reset-password/:token', authController.renderResetPassword);

// POST /auth/reset-password/:token - Process reset password
router.post('/reset-password/:token',
  authLimiter,
  [
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('confirmPassword')
      .custom((value, { req }) => {
        if (value !== req.body.password) {
          throw new Error('Passwords do not match');
        }
        return true;
      })
  ],
  validationMiddleware,
  authController.resetPassword
);

// OAUTH ROUTES (Placeholder routes - to be implemented)

// OAuth Google
router.get('/google', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  oauthService.authenticateGoogle()(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  oauthService.handleGoogleCallback()(req, res, (err) => {
    if (err) {
      logger.error('Google OAuth callback error:', err);
      return res.redirect('/auth/sign-in?error=oauth_failed');
    }
    
    if (req.user && req.user.pendingVerification) {
      return res.redirect(`/auth/social-verify?email=${encodeURIComponent(req.user.email)}&provider=google`);
    }
    
    if (req.user) {
      // Set JWT token in cookie and redirect to dashboard
      const token = authService.generateToken(req.user.id, req.user.email);
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      return res.redirect('/dashboard');
    }
    
    res.redirect('/auth/sign-in?error=oauth_failed');
  });
});

// OAuth Apple
router.get('/apple', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  oauthService.authenticateApple()(req, res, next);
});

// Apple OAuth uses POST for callback, not GET
router.post('/apple/callback', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  logger.info('Apple OAuth callback route hit', {
    query: req.query,
    body: req.body,
    bodyKeys: Object.keys(req.body || {}),
    hasIdToken: !!req.body?.id_token,
    hasUser: !!req.body?.user,
    headers: {
      'user-agent': req.get('User-Agent'),
      'content-type': req.get('Content-Type')
    }
  });
  
  oauthService.handleAppleCallback()(req, res, (err) => {
    if (err) {
      logger.error('Apple OAuth callback error:', {
        error: err.message,
        stack: err.stack,
        query: req.query,
        body: req.body
      });
      return res.redirect('/auth/sign-in?error=oauth_failed');
    }
    
    logger.info('Apple OAuth callback success', {
      user: req.user ? 'User object present' : 'No user object',
      pendingVerification: req.user?.pendingVerification
    });
    
    if (req.user && req.user.pendingVerification) {
      logger.info(`Redirecting to Apple social verification for email: ${req.user.email}`);
      return res.redirect(`/auth/social-verify?email=${encodeURIComponent(req.user.email)}&provider=apple`);
    }
    
    if (req.user) {
      // Set JWT token in cookie and redirect to dashboard
      const token = authService.generateToken(req.user.id, req.user.email);
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      logger.info(`Apple OAuth user logged in successfully: ${req.user.email}`);
      return res.redirect('/dashboard');
    }
    
    logger.warn('Apple OAuth callback completed but no user found');
    res.redirect('/auth/sign-in?error=oauth_failed');
  });
});

// OAuth Microsoft
router.get('/microsoft', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  oauthService.authenticateMicrosoft()(req, res, next);
});

router.get('/microsoft/callback', (req, res, next) => {
  const oauthService = require('../services/oauth.service');
  oauthService.handleMicrosoftCallback()(req, res, (err) => {
    if (err) {
      logger.error('Microsoft OAuth callback error:', err);
      return res.redirect('/auth/sign-in?error=oauth_failed');
    }
    
    if (req.user && req.user.pendingVerification) {
      return res.redirect(`/auth/social-verify?email=${encodeURIComponent(req.user.email)}&provider=microsoft`);
    }
    
    if (req.user) {
      // Set JWT token in cookie and redirect to dashboard
      const token = authService.generateToken(req.user.id, req.user.email);
      res.cookie('auth_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      return res.redirect('/dashboard');
    }
    
    res.redirect('/auth/sign-in?error=oauth_failed');
  });
});

// Social Login Verification Page
router.get('/social-verify', (req, res) => {
  const { email, provider } = req.query;
  
  if (!email || !provider) {
    return res.redirect('/auth/sign-in');
  }
  
  res.render('auth/social-verify', {
    title: 'Verify Your Email',
    email: email,
    provider: provider,
    layout: 'auth'
  });
});

// Social Login Verification Handler
router.post('/social-verify', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: 'Email and verification code are required'
      });
    }
    
    const oauthService = require('../services/oauth.service');
    const result = await oauthService.completeSocialVerification(email, code);
    
    if (result.success) {
      // Set JWT token in cookie
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      return res.json({
        success: true,
        message: 'Email verified successfully!',
        data: {
          redirectTo: '/dashboard'
        }
      });
    }
    
  } catch (error) {
    logger.error('Social verification error:', error);
    
    return res.status(400).json({
      success: false,
      message: error.message || 'Verification failed. Please try again.'
    });
  }
});

module.exports = router;