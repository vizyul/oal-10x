const refgrowService = require('../services/refgrow.service');
const database = require('../services/database.service');
const subscriptionService = require('../services/subscription.service');
const { logger } = require('../utils');

// Video limits by tier (matches subscription service)
const TIER_VIDEO_LIMITS = {
  'free': 1,
  'basic': 4,
  'premium': 8,
  'creator': 16,
  'enterprise': 50
};

class AffiliateController {
  /**
   * Show affiliate signup page
   */
  async showSignupPage(req, res) {
    try {
      // Get fresh user data if logged in to check current affiliate status
      let user = req.user;
      if (user) {
        user = await database.findById('users', user.id);
        // If already an affiliate, redirect to dashboard
        if (user && user.is_affiliate) {
          return res.redirect('/affiliate/dashboard');
        }
      }

      // Format user data for template (convert snake_case to camelCase for header)
      const formattedUser = user ? {
        ...user,
        firstName: user.first_name,
        lastName: user.last_name,
        subscriptionTier: user.subscription_tier,
        isAffiliate: user.is_affiliate
      } : null;

      // Build subscription object for header display
      let subscription = null;
      if (user) {
        const tier = user.subscription_tier || 'free';
        const usage = await subscriptionService.getCurrentUsage(user.id);
        subscription = {
          tier,
          usage: { videos: usage.videos_processed || 0 },
          limits: { videos: TIER_VIDEO_LIMITS[tier] || 1 }
        };
      }

      res.render('affiliate-signup', {
        title: 'Join Our Affiliate Program - Earn 20% Commission',
        user: formattedUser,
        subscription,
        layout: 'main'
      });
    } catch (error) {
      logger.error('Error showing affiliate signup page:', error);
      res.status(500).render('errors/500', { error: 'Internal server error' });
    }
  }

  /**
   * Handle affiliate signup
   */
  async handleSignup(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = req.user.id;
      const { why, website, audienceSize } = req.body;

      // Check if user is already an affiliate
      if (req.user.is_affiliate) {
        return res.status(400).json({ error: 'You are already an affiliate' });
      }

      // Note: No subscription requirement - anyone can become an affiliate
      // They earn commissions when their referrals subscribe to paid plans

      // Create affiliate in RefGrow
      const fullName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim();
      const affiliateData = await refgrowService.createAffiliate(
        userId,
        req.user.email,
        fullName || req.user.email
      );

      // Update user with application data
      await database.update('users', userId, {
        affiliate_status: 'active',
        metadata: {
          ...req.user.metadata,
          affiliate_application: {
            why,
            website,
            audienceSize,
            appliedAt: new Date()
          }
        }
      });

      logger.info('User joined affiliate program', { userId, email: req.user.email, subscriptionTier: req.user.subscription_tier || 'free' });

      res.json({
        success: true,
        message: 'Successfully joined affiliate program!',
        affiliateId: affiliateData.id,
        affiliateCode: affiliateData.affiliate_code
      });
    } catch (error) {
      logger.error('Error handling affiliate signup:', error);
      // Don't expose internal error details to frontend
      res.status(500).json({
        success: false,
        error: 'Failed to join affiliate program. Please try again or contact support.'
      });
    }
  }

  /**
   * Show affiliate dashboard
   */
  async showDashboard(req, res) {
    try {
      if (!req.user) {
        return res.redirect('/auth/signin?redirect=/affiliate/dashboard');
      }

      // Refresh user data from database to get latest affiliate status
      const freshUser = await database.findById('users', req.user.id);

      if (!freshUser || !freshUser.is_affiliate) {
        return res.redirect('/affiliate/signup');
      }

      // Get affiliate stats
      const stats = await refgrowService.getLocalAffiliateStats(freshUser.id);

      // Get referral link - use affiliate_code from user record
      const referralCode = freshUser.affiliate_code || await refgrowService.getReferralCode(freshUser.id);
      const baseUrl = process.env.CORS_ORIGIN || 'https://dev.amplifycontent.ai';
      const referralLink = `${baseUrl}/auth/signup?ref=${referralCode}`;

      // Get recent referrals
      const referralsResult = await database.query(`
        SELECT
          ar.*,
          u.email as referred_email,
          u.subscription_tier
        FROM affiliate_referrals ar
        LEFT JOIN users u ON ar.users_id = u.id
        WHERE ar.referral_code = (
          SELECT referred_by_code
          FROM users
          WHERE refgrow_affiliate_id = $1
          LIMIT 1
        )
        ORDER BY ar.created_at DESC
        LIMIT 10
      `, [freshUser.refgrow_affiliate_id]);

      const referrals = referralsResult.rows;

      // Get payment method (would come from user preferences)
      const paymentMethod = freshUser.metadata?.affiliate_payment_method || null;

      // Format user data for template (convert snake_case to camelCase for header)
      const formattedUser = {
        ...freshUser,
        firstName: freshUser.first_name,
        lastName: freshUser.last_name,
        subscriptionTier: freshUser.subscription_tier,
        isAffiliate: freshUser.is_affiliate
      };

      // Get subscription usage and limits for header display
      const tier = freshUser.subscription_tier || 'free';
      const usage = await subscriptionService.getCurrentUsage(freshUser.id);

      const subscription = {
        tier,
        usage: {
          videos: usage.videos_processed || 0
        },
        limits: {
          videos: TIER_VIDEO_LIMITS[tier] || 1
        }
      };

      res.render('affiliate-dashboard', {
        title: 'Affiliate Dashboard',
        user: formattedUser,
        subscription,
        stats,
        referralLink,
        referrals,
        paymentMethod,
        layout: 'main'
      });
    } catch (error) {
      logger.error('Error showing affiliate dashboard:', error);
      res.status(500).render('errors/500', { error: 'Internal server error' });
    }
  }

  /**
   * Track affiliate click
   */
  async trackClick(req, res) {
    try {
      const { referralCode, landingPage, referrerUrl } = req.body;

      if (!referralCode) {
        return res.status(400).json({ error: 'Referral code required' });
      }

      // Get UTM parameters from landing page URL
      let utmParams = {};
      try {
        const url = new globalThis.URL(landingPage);
        utmParams = {
          utmSource: url.searchParams.get('utm_source'),
          utmMedium: url.searchParams.get('utm_medium'),
          utmCampaign: url.searchParams.get('utm_campaign'),
          utmTerm: url.searchParams.get('utm_term'),
          utmContent: url.searchParams.get('utm_content')
        };
      } catch {
        // Invalid URL, continue without UTM params
      }

      // Track click
      await refgrowService.trackClick(referralCode, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        referrerUrl,
        landingPage,
        ...utmParams
      });

      res.json({ success: true });
    } catch (error) {
      logger.error('Error tracking affiliate click:', error);
      res.status(500).json({ error: 'Failed to track click' });
    }
  }

  /**
   * Handle RefGrow webhook
   */
  async handleWebhook(req, res) {
    try {
      const signature = req.headers['x-refgrow-signature'];
      const rawBody = JSON.stringify(req.body);

      // Verify signature
      if (!refgrowService.verifyWebhookSignature(signature, rawBody)) {
        logger.warn('Invalid RefGrow webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Process webhook
      await refgrowService.processWebhook(req.body);

      res.json({ received: true });
    } catch (error) {
      logger.error('Error handling RefGrow webhook:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  /**
   * Get affiliate stats API
   */
  async getStats(req, res) {
    try {
      if (!req.user || !req.user.is_affiliate) {
        return res.status(403).json({ error: 'Not an affiliate' });
      }

      const stats = await refgrowService.getLocalAffiliateStats(req.user.id);
      res.json({ success: true, stats });
    } catch (error) {
      logger.error('Error fetching affiliate stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  }

  /**
   * Show affiliate terms page
   */
  async showTermsPage(req, res) {
    try {
      // Format user data for header if logged in
      const formattedUser = req.user ? {
        ...req.user,
        firstName: req.user.first_name,
        lastName: req.user.last_name
      } : null;

      // Build subscription object for header display
      let subscription = null;
      if (req.user) {
        const tier = req.user.subscription_tier || 'free';
        const usage = await subscriptionService.getCurrentUsage(req.user.id);
        subscription = {
          tier,
          usage: { videos: usage.videos_processed || 0 },
          limits: { videos: TIER_VIDEO_LIMITS[tier] || 1 }
        };
      }

      res.render('affiliate-terms', {
        title: 'Affiliate Terms & Conditions',
        user: formattedUser,
        subscription,
        layout: 'main'
      });
    } catch (error) {
      logger.error('Error showing affiliate terms:', error);
      res.status(500).render('errors/500', { error: 'Internal server error' });
    }
  }
}

module.exports = new AffiliateController();
