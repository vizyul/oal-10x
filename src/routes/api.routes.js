const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query } = require('express-validator');

const { authMiddleware, validationMiddleware } = require('../middleware');
const { authService, airtableService } = require('../services');
const { logger } = require('../utils');

const router = express.Router();

// API rate limiting (more restrictive than web routes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 requests per windowMs
  message: {
    success: false,
    message: 'Too many API requests. Please try again later.',
    error: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all API routes
router.use(apiLimiter);

// API health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// User authentication endpoints
router.post('/auth/signup', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  body('firstName').trim().isLength({ min: 2, max: 50 }).matches(/^[A-Za-z\s'-]+$/),
  body('lastName').trim().isLength({ min: 2, max: 50 }).matches(/^[A-Za-z\s'-]+$/),
  body('terms').equals('true'),
  body('privacy').equals('true')
], validationMiddleware, require('../controllers/auth.controller').signUp);

router.post('/auth/signin', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], validationMiddleware, require('../controllers/auth.controller').signIn);

router.post('/auth/logout', authMiddleware, require('../controllers/auth.controller').logout);

// Protected user endpoints
router.get('/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await authService.findUserById(req.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }
    
    // Remove sensitive information
    const { password, emailVerificationToken, ...safeUser } = user;
    
    res.json({
      success: true,
      data: {
        user: safeUser
      }
    });
  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

router.put('/user/profile', authMiddleware, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }).matches(/^[A-Za-z\s'-]+$/),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }).matches(/^[A-Za-z\s'-]+$/),
  body('email').optional().isEmail().normalizeEmail()
], validationMiddleware, async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const updateData = {};
    
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;
    
    // Check if email is already taken (if email is being updated)
    if (email) {
      const existingUser = await authService.findUserByEmail(email);
      if (existingUser && existingUser.id !== req.userId) {
        return res.status(400).json({
          success: false,
          message: 'Email address is already in use',
          error: 'EMAIL_ALREADY_EXISTS',
          field: 'email'
        });
      }
    }
    
    const updatedUser = await authService.updateUser(req.userId, updateData);
    
    // Remove sensitive information
    const { password, emailVerificationToken, ...safeUser } = updatedUser;
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: safeUser
      }
    });
  } catch (error) {
    logger.error('Update user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Change password endpoint
router.put('/user/password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('New password must meet security requirements')
], validationMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const bcrypt = require('bcryptjs');
    
    // Get current user
    const user = await authService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }
    
    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect',
        error: 'INVALID_PASSWORD',
        field: 'currentPassword'
      });
    }
    
    // Hash new password
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password
    await authService.updateUser(req.userId, {
      password: hashedNewPassword
    });
    
    logger.info(`Password changed for user: ${req.userId}`);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    logger.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Delete account endpoint
router.delete('/user/account', authMiddleware, [
  body('password').notEmpty().withMessage('Password is required to delete account'),
  body('confirmation').equals('DELETE').withMessage('You must type DELETE to confirm')
], validationMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    const bcrypt = require('bcryptjs');
    
    // Get current user
    const user = await authService.findUserById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error: 'USER_NOT_FOUND'
      });
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Password is incorrect',
        error: 'INVALID_PASSWORD',
        field: 'password'
      });
    }
    
    // Soft delete user
    await authService.deleteUser(req.userId);
    
    logger.info(`Account deleted for user: ${req.userId}`);
    
    // Clear auth cookie
    res.clearCookie('auth_token');
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Admin endpoints (future implementation)
router.get('/admin/users', authMiddleware, async (req, res) => {
  // TODO: Add admin role check middleware
  res.status(501).json({
    success: false,
    message: 'Admin functionality coming soon',
    error: 'NOT_IMPLEMENTED'
  });
});

router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin role check middleware
    const stats = await authService.getUserStats();
    
    res.json({
      success: true,
      data: {
        stats
      }
    });
  } catch (error) {
    logger.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get statistics',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Airtable test endpoint (development only)
if (process.env.NODE_ENV === 'development') {
  router.get('/test/airtable', authMiddleware, async (req, res) => {
    try {
      const connectionTest = await airtableService.testConnection();
      const baseInfo = airtableService.getBaseInfo();
      
      res.json({
        success: true,
        data: {
          connection: connectionTest,
          baseInfo
        }
      });
    } catch (error) {
      logger.error('Airtable test error:', error);
      res.status(500).json({
        success: false,
        message: 'Airtable test failed',
        error: error.message
      });
    }
  });
}

// Resend verification email
router.post('/auth/resend-verification', [
  body('email').isEmail().normalizeEmail()
], validationMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user
    const user = await authService.findUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If the email address exists, a verification email has been sent.'
      });
    }
    
    // Check if already verified
    if (user.emailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email address is already verified',
        error: 'ALREADY_VERIFIED'
      });
    }
    
    // TODO: Generate new verification token and send email
    // For now, just return success
    
    res.json({
      success: true,
      message: 'Verification email sent successfully'
    });
  } catch (error) {
    logger.error('Resend verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// Handle 404 for API routes
// User Preferences Routes
const PreferencesService = require('../services/preferences.service');
const preferencesService = new PreferencesService();

// Get user preferences
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    // Only get preferences, don't create them on GET requests
    const preferences = await preferencesService.getUserPreferences(req.user.email);
    
    res.json({
      success: true,
      data: preferences || null // Return null if no preferences exist
    });
  } catch (error) {
    logger.error('Error getting user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get preferences',
      error: error.message
    });
  }
});

// Update theme preference
router.post('/preferences/theme', [
  authMiddleware,
  body('themeMode')
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme mode must be light, dark, or system'),
  validationMiddleware
], async (req, res) => {
  try {
    const { themeMode } = req.body;
    
    const preferences = await preferencesService.updateUserPreferences(req.user.email, {
      themeMode
    });
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Error updating theme preference:', error);
    
    // Handle specific Airtable errors
    if (error.statusCode === 404) {
      return res.status(503).json({
        success: false,
        message: 'User preferences system is not set up yet. Please contact support.',
        error: 'User_Preferences table not found'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to update theme preference',
      error: error.message
    });
  }
});

// Update multiple preferences
router.put('/preferences', [
  authMiddleware,
  body('themeMode')
    .optional()
    .isIn(['light', 'dark', 'system'])
    .withMessage('Theme mode must be light, dark, or system'),
  body('emailNotifications')
    .optional()
    .isBoolean()
    .withMessage('Email notifications must be true or false'),
  body('marketingCommunications')
    .optional()
    .isBoolean()
    .withMessage('Marketing communications must be true or false'),
  body('weeklyDigest')
    .optional()
    .isBoolean()
    .withMessage('Weekly digest must be true or false'),
  validationMiddleware
], async (req, res) => {
  try {
    const updates = {};
    
    if (req.body.themeMode !== undefined) updates.themeMode = req.body.themeMode;
    if (req.body.emailNotifications !== undefined) updates.emailNotifications = req.body.emailNotifications;
    if (req.body.marketingCommunications !== undefined) updates.marketingCommunications = req.body.marketingCommunications;
    if (req.body.weeklyDigest !== undefined) updates.weeklyDigest = req.body.weeklyDigest;
    
    const preferences = await preferencesService.updateUserPreferences(req.user.email, updates);
    
    res.json({
      success: true,
      data: preferences
    });
  } catch (error) {
    logger.error('Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences',
      error: error.message
    });
  }
});

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    error: 'ENDPOINT_NOT_FOUND',
    path: req.originalUrl
  });
});

module.exports = router;