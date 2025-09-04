const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscription.controller');

console.log('📦 Webhook routes module loading...');

/**
 * @route   GET /webhook/test
 * @desc    Test webhook endpoint accessibility
 * @access  Public
 */
router.get('/test', (req, res) => {
  console.log('🧪 Test webhook endpoint hit!');
  res.json({ 
    success: true, 
    message: 'Webhook endpoint is accessible!',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   POST /webhook/stripe
 * @desc    Handle Stripe webhook events - COMPLETELY PUBLIC
 * @access  Public (verified via Stripe signature)
 */
router.post('/',
  (req, res, next) => {
    console.log('🔗 Webhook received!', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyLength: req.body ? req.body.length : 0,
      bodyType: typeof req.body
    });
    next();
  },
  subscriptionController.handleWebhook
);

console.log('✅ Webhook routes defined');
module.exports = router;