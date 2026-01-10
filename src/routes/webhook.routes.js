const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');
const { logger } = require('../utils');

/**
 * @route   GET /webhook/test
 * @desc    Test webhook endpoint accessibility
 * @access  Public
 */
router.get('/test', (req, res) => {
  logger.debug('Webhook test endpoint hit', null, req.requestId);
  res.json({
    success: true,
    message: 'Webhook endpoint is accessible!',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /webhook/stripe (via app.js direct mount)
 * @desc    Handle Stripe webhook events - COMPLETELY PUBLIC
 * @access  Public (verified via Stripe signature)
 */
router.post('/',
  (req, res, next) => {
    logger.debug('Stripe webhook received', { bodyLength: req.body ? req.body.length : 0 }, req.requestId);
    next();
  },
  subscriptionController.handleWebhook
);
module.exports = router;
