const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuthMiddleware, subscriptionMiddleware } = require('../middleware');
const stripeConfig = require('../config/stripe.config');
const { logger } = require('../utils');

logger.debug('Subscription web routes loaded');

// ============================================
// PUBLIC ROUTES (no authentication required)
// ============================================

/**
 * @route   GET /subscription/upgrade
 * @desc    Subscription upgrade/pricing page
 * @access  Public
 */
router.get('/upgrade', optionalAuthMiddleware, (req, res) => {
  try {
    const currentTier = req.user?.subscription_tier || 'free';

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
      title: 'Upgrade Subscription - AmplifyContent.ai',
      description: 'Choose the perfect plan for your needs',
      user: req.user || null,
      subscription: req.subscriptionInfo || null,
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

// ============================================
// PROTECTED ROUTES (authentication required)
// ============================================

// Apply authentication middleware to remaining subscription routes
router.use(authMiddleware);

// Add subscription info to all authenticated routes
router.use(subscriptionMiddleware.addSubscriptionInfo);

/**
 * @route   GET /subscription
 * @desc    Subscription dashboard/overview page
 * @access  Private
 */
router.get('/', (req, res) => {
  res.render('subscription/dashboard', {
    title: 'Subscription - AmplifyContent.ai',
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
 * @route   GET /subscription/manage
 * @desc    Redirect to subscription dashboard
 * @access  Private
 */
router.get('/manage', (req, res) => {
  res.redirect('/subscription');
});

/**
 * @route   GET /subscription/test-user
 * @desc    Test route to verify user data rendering
 * @access  Private
 */
router.get('/test-user', (req, res) => {
  logger.info('=== TEST USER ROUTE HIT ===', {
    userId: req.user?.id,
    firstName: req.user?.firstName,
    email: req.user?.email,
    fullUser: req.user
  });

  res.send(`
    <html>
      <body>
        <h1>User Data Test</h1>
        <p>User ID: ${req.user?.id}</p>
        <p>Email: ${req.user?.email}</p>
        <p>First Name: ${req.user?.firstName}</p>
        <p>Last Name: ${req.user?.lastName}</p>
        <p>Full Object: ${JSON.stringify(req.user, null, 2)}</p>
      </body>
    </html>
  `);
});

/**
 * @route   GET /subscription/success
 * @desc    Subscription success page after checkout
 * @access  Private
 */
router.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;

  logger.info('=== SUCCESS PAGE ROUTE HIT ===', {
    path: req.path,
    originalUrl: req.originalUrl,
    method: req.method,
    sessionId,
    userId: req.user?.id,
    userFirstName: req.user?.firstName,
    userEmail: req.user?.email
  });

  // If there's a session_id, fetch fresh subscription data
  if (sessionId) {
    try {
      const authService = require('../services/auth.service');
      const { forceTokenRefresh } = require('../middleware');
      const stripeService = require('../services/stripe.service');

      // First, ensure webhook has processed by manually syncing from Stripe
      // This handles the race condition where user arrives before webhook
      try {
        const stripeConfigModule = require('../config/stripe.config');
        const stripe = require('stripe')(stripeConfigModule.getSecretKey());
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);

          // Check if webhook has processed this subscription
          const UserSubscription = require('../models/UserSubscription');
          const userSubscription = new UserSubscription();
          const existingRecord = await userSubscription.getByStripeId(subscription.id);

          if (!existingRecord) {
            logger.info('Webhook not yet processed, manually syncing subscription', {
              sessionId,
              subscriptionId: subscription.id,
              userId: req.user.id
            });

            // Manually trigger subscription processing
            await stripeService.handleSubscriptionCreated(subscription);
          }
        }
      } catch (syncError) {
        logger.error('Error syncing subscription on success page:', {
          error: syncError.message,
          sessionId
        });
        // Continue anyway - we'll show whatever data we have
      }

      // Get fresh user data from database (should now have updated tier)
      const freshUser = await authService.findUserById(req.user.id);

      if (freshUser) {
        // Generate new token with updated subscription info
        const newToken = authService.generateToken(freshUser.id, freshUser.email, freshUser);

        // Set new token in cookie
        res.cookie('auth_token', newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        // Update req.user with fresh data
        req.user = {
          id: freshUser.id,
          email: freshUser.email,
          firstName: freshUser.firstName,
          lastName: freshUser.lastName,
          fullName: freshUser.fullName,
          emailVerified: freshUser.emailVerified,
          status: freshUser.status,
          role: freshUser.role,
          subscription_tier: freshUser.subscription_tier,
          subscription_status: freshUser.subscription_status,
          stripe_customer_id: freshUser.stripe_customer_id
        };

        // Also refresh subscriptionInfo middleware - get features from database
        const subscriptionPlansService = require('../services/subscription-plans.service');
        const planData = await subscriptionPlansService.getPlanByKey(freshUser.subscription_tier || 'free');
        const featureFlags = await subscriptionPlansService.getFeatureFlags(freshUser.subscription_tier || 'free');

        // Get price info from session for tracking
        let priceAmount = 0;
        let priceCurrency = 'USD';
        try {
          if (session.amount_total) {
            priceAmount = session.amount_total / 100; // Convert cents to dollars
            priceCurrency = (session.currency || 'usd').toUpperCase();
          }
        } catch (priceError) {
          logger.warn('Could not get price from session:', priceError.message);
        }

        req.subscriptionInfo = {
          tier: freshUser.subscription_tier || 'free',
          status: freshUser.subscription_status || 'none',
          features: planData ? planData.features : [], // Array of feature strings
          featureFlags: featureFlags || {}, // Object with boolean flags
          usage: { videos: 0, api_calls: 0, storage: 0 },
          limits: {
            videos: planData?.videoLimit || 0,
            api_calls: 0, // TODO: Add to subscription_plans
            storage: 0  // TODO: Add to subscription_plans
          },
          percentages: { videos: 0, api_calls: 0, storage: 0 },
          remainingVideos: planData?.videoLimit || 0,
          // Tracking info
          priceAmount: priceAmount,
          priceCurrency: priceCurrency
        };

        // Clear any pending refresh flags
        forceTokenRefresh(req.user.id);
      }
    } catch (error) {
      // Log error but continue - user will see old data until next page load
      logger.error('Error refreshing subscription on success page:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.id,
        sessionId
      });
      console.error('Success page refresh error:', error);
    }
  }

  // Debug logging
  logger.info('Rendering success page with user data:', {
    userId: req.user?.id,
    firstName: req.user?.firstName,
    email: req.user?.email,
    tier: req.subscriptionInfo?.tier,
    hasSessionId: !!sessionId
  });

  res.render('subscription/success', {
    title: 'Subscription Successful - AmplifyContent.ai',
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
    title: 'Subscription Canceled - AmplifyContent.ai',
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
    title: 'Usage Dashboard - AmplifyContent.ai',
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
