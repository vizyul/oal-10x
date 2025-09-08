const express = require('express');
const router = express.Router();
const { authMiddleware, subscriptionMiddleware } = require('../middleware');
const stripeConfig = require('../config/stripe.config');

// Apply authentication middleware to all subscription web routes
router.use(authMiddleware);

// Add subscription info to all routes
router.use(subscriptionMiddleware.addSubscriptionInfo);

/**
 * @route   GET /subscription
 * @desc    Subscription dashboard/overview page
 * @access  Private
 */
router.get('/', (req, res) => {
  res.render('subscription/dashboard', {
    title: 'Subscription - Our AI Legacy',
    description: 'Manage your subscription and billing',
    user: req.user,
    subscription: req.subscriptionInfo,
    tiers: stripeConfig.getAllTiers(),
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/subscription.css'],
    additionalJS: ['/js/subscription.js']
  });
});

/**
 * @route   GET /subscription/upgrade
 * @desc    Subscription upgrade/pricing page
 * @access  Private
 */
router.get('/upgrade', (req, res) => {
  try {
    const currentTier = req.user.subscription_tier || 'free';

    // Handle case where Stripe isn't fully configured yet
    let tiers = [];
    let publishableKey = '';

    try {
      tiers = stripeConfig.getAllTiers().filter(tier => tier.key !== 'free');
      publishableKey = stripeConfig.getPublishableKey();
    } catch (stripeError) {
      console.warn('Stripe not fully configured:', stripeError.message);
      // Provide fallback tier data for development (excluding free tier)
      tiers = [
        { key: 'basic', name: 'Basic', priceId: '', features: ['4 videos/month', 'Basic AI summaries', 'Email support'] },
        { key: 'premium', name: 'Premium', priceId: '', features: ['8 videos/month', 'Advanced AI content', 'Analytics dashboard', 'Priority support'] },
        { key: 'enterprise', name: 'Enterprise', priceId: '', features: ['16 videos/month', 'Priority processing', 'API access', 'Dedicated support'] }
      ];
    }

    res.render('subscription/upgrade', {
      title: 'Upgrade Subscription - Our AI Legacy',
      description: 'Choose the perfect plan for your needs',
      user: req.user,
      subscription: req.subscriptionInfo,
      currentTier: currentTier,
      tiers: tiers,
      stripePublishableKey: publishableKey,
      showHeader: true,
      showFooter: true,
      showNav: true,
      additionalCSS: ['/css/subscription.css'],
      additionalJS: []
    });
  } catch (error) {
    console.error('Error in upgrade route:', error);
    // Render error page instead of JSON for web requests
    res.status(500).render('errors/500', {
      title: 'Server Error',
      message: 'Unable to load subscription page',
      error: process.env.NODE_ENV === 'development' ? error : {},
      showHeader: true,
      showFooter: true
    });
  }
});

/**
 * @route   GET /subscription/manage
 * @desc    Subscription management page (billing portal link)
 * @access  Private
 */
router.get('/manage', (req, res) => {
  if (!req.user.stripe_customer_id) {
    req.flash && req.flash('error', 'No billing information found. Please contact support.');
    return res.redirect('/subscription');
  }

  res.render('subscription/manage', {
    title: 'Manage Subscription - Our AI Legacy',
    description: 'Update your billing information and subscription',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/subscription.css'],
    additionalJS: ['/js/subscription.js']
  });
});

/**
 * @route   GET /subscription/success
 * @desc    Subscription success page after checkout
 * @access  Private
 */
router.get('/success', (req, res) => {
  const sessionId = req.query.session_id;

  res.render('subscription/success', {
    title: 'Subscription Successful - Our AI Legacy',
    description: 'Welcome to your new subscription!',
    user: req.user,
    subscription: req.subscriptionInfo,
    sessionId: sessionId,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/subscription.css'],
    additionalJS: ['/js/subscription.js']
  });
});

/**
 * @route   GET /subscription/cancel
 * @desc    Subscription canceled page when user cancels checkout
 * @access  Private
 */
router.get('/cancel', (req, res) => {
  res.render('subscription/cancel', {
    title: 'Subscription Canceled - Our AI Legacy',
    description: 'Your subscription was not completed',
    user: req.user,
    subscription: req.subscriptionInfo,
    tiers: stripeConfig.getAllTiers(),
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/subscription.css'],
    additionalJS: ['/js/subscription.js']
  });
});

/**
 * @route   GET /subscription/usage
 * @desc    Usage dashboard showing current limits and consumption
 * @access  Private
 */
router.get('/usage', (req, res) => {
  res.render('subscription/usage', {
    title: 'Usage Dashboard - Our AI Legacy',
    description: 'Track your current usage and limits',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/subscription.css', '/css/charts.css'],
    additionalJS: ['/js/subscription.js', '/js/usage-charts.js']
  });
});

module.exports = router;
