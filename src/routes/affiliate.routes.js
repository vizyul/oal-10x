const express = require('express');
const router = express.Router();
const affiliateController = require('../controllers/affiliate.controller');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware');

// ============================================================================
// Web Routes (require authentication)
// ============================================================================

/**
 * GET /affiliate/signup
 * Show affiliate signup page
 */
router.get('/signup', optionalAuthMiddleware, affiliateController.showSignupPage);

/**
 * GET /affiliate/dashboard
 * Show affiliate dashboard
 */
router.get('/dashboard', authMiddleware, affiliateController.showDashboard);

/**
 * GET /affiliate/terms
 * Show affiliate terms and conditions
 */
router.get('/terms', optionalAuthMiddleware, affiliateController.showTermsPage);

/**
 * GET /affiliate/settings
 * Show affiliate payout settings page (PayPal email)
 */
router.get('/settings', authMiddleware, affiliateController.showSettings);

/**
 * POST /affiliate/settings/paypal/send-code
 * Send a 6-digit verification code to a candidate PayPal email
 */
router.post('/settings/paypal/send-code', authMiddleware, affiliateController.sendPayPalVerificationCode);

/**
 * POST /affiliate/settings/paypal/resend-code
 * Resend the verification code to the currently-pending PayPal email
 */
router.post('/settings/paypal/resend-code', authMiddleware, affiliateController.resendPayPalCode);

/**
 * POST /affiliate/settings/paypal/verify-code
 * Confirm the 6-digit code, persist the verified email, push to RefGrow
 */
router.post('/settings/paypal/verify-code', authMiddleware, affiliateController.verifyPayPalEmail);

// ============================================================================
// API Routes (mounted under /affiliate, so paths are /affiliate/api/*)
// ============================================================================

/**
 * POST /affiliate/api/signup
 * Handle affiliate program signup
 */
router.post('/api/signup', authMiddleware, affiliateController.handleSignup);

/**
 * POST /affiliate/api/track-click
 * Track affiliate link click
 */
router.post('/api/track-click', affiliateController.trackClick);

/**
 * GET /affiliate/api/stats
 * Get affiliate statistics
 */
router.get('/api/stats', authMiddleware, affiliateController.getStats);

/**
 * POST /affiliate/api/webhook
 * Handle RefGrow webhooks
 */
router.post('/api/webhook', affiliateController.handleWebhook);

module.exports = router;
