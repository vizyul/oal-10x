const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { authMiddleware, validationMiddleware } = require('../middleware');

// Apply authentication middleware to all subscription routes
router.use(authMiddleware);

// Validation rules
const subscriptionValidation = {
  createCheckoutSession: [
    body('priceId')
      .notEmpty()
      .withMessage('Price ID is required')
      .matches(/^price_[a-zA-Z0-9]+$/)
      .withMessage('Invalid Stripe price ID format')
  ]
};

/**
 * @route   POST /api/subscription/create-checkout-session
 * @desc    Create Stripe checkout session for subscription
 * @access  Private
 */
router.post('/create-checkout-session',
  subscriptionValidation.createCheckoutSession,
  validationMiddleware,
  subscriptionController.createCheckoutSession
);

/**
 * @route   POST /api/subscription/create-portal-session
 * @desc    Create Stripe customer portal session
 * @access  Private
 */
router.post('/create-portal-session',
  subscriptionController.createPortalSession
);

/**
 * @route   GET /api/subscription/status
 * @desc    Get current subscription status and usage
 * @access  Private
 */
router.get('/status',
  subscriptionController.getSubscriptionStatus
);

/**
 * @route   GET /api/subscription/usage
 * @desc    Get current billing period usage
 * @access  Private
 */
router.get('/usage',
  subscriptionController.getUsage
);

/**
 * @route   GET /api/subscription/receipt
 * @desc    Get receipt/subscription info after successful checkout
 * @access  Private
 */
router.get('/receipt',
  subscriptionController.getReceipt
);

module.exports = router;