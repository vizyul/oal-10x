const stripeConfig = {
  // Determine environment
  isProduction: process.env.NODE_ENV === 'production',

  // Get appropriate keys based on environment
  getPublishableKey() {
    return this.isProduction
      ? process.env.STRIPE_LIVE_PUBLISHABLE_KEY
      : process.env.STRIPE_PUBLISHABLE_KEY;
  },

  getSecretKey() {
    return this.isProduction
      ? process.env.STRIPE_LIVE_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY;
  },

  getWebhookSecret() {
    return this.isProduction
      ? process.env.STRIPE_LIVE_WEBHOOK_SECRET
      : process.env.STRIPE_WEBHOOK_SECRET;
  },

  // URLs
  successUrl: process.env.STRIPE_SUCCESS_URL,
  cancelUrl: process.env.STRIPE_CANCEL_URL,
  customerPortalUrl: process.env.STRIPE_CUSTOMER_PORTAL_URL,

  // Validate configuration
  validate() {
    // eslint-disable-next-line no-unused-vars
    const _requiredKeys = [
      this.getPublishableKey() ? 'publishable_key' : null,
      this.getSecretKey() ? 'secret_key' : null,
      this.getWebhookSecret() ? 'webhook_secret' : null,
      this.successUrl ? 'success_url' : null,
      this.cancelUrl ? 'cancel_url' : null
    ].filter(Boolean);

    const missingKeys = [];

    if (!this.getPublishableKey()) missingKeys.push('STRIPE_PUBLISHABLE_KEY');
    if (!this.getSecretKey()) missingKeys.push('STRIPE_SECRET_KEY');
    if (!this.getWebhookSecret()) missingKeys.push('STRIPE_WEBHOOK_SECRET');
    if (!this.successUrl) missingKeys.push('STRIPE_SUCCESS_URL');
    if (!this.cancelUrl) missingKeys.push('STRIPE_CANCEL_URL');

    if (missingKeys.length > 0) {
      throw new Error(`Missing required Stripe configuration: ${missingKeys.join(', ')}`);
    }

    // Validate key formats
    const pubKey = this.getPublishableKey();
    const secretKey = this.getSecretKey();

    if (this.isProduction) {
      if (!pubKey.startsWith('pk_live_')) {
        throw new Error('Production environment requires live publishable key (pk_live_)');
      }
      if (!secretKey.startsWith('sk_live_')) {
        throw new Error('Production environment requires live secret key (sk_live_)');
      }
    } else {
      if (!pubKey.startsWith('pk_test_')) {
        throw new Error('Development environment should use test publishable key (pk_test_)');
      }
      if (!secretKey.startsWith('sk_test_')) {
        throw new Error('Development environment should use test secret key (sk_test_)');
      }
    }

    return true;
  },

  // Subscription tiers configuration
  subscriptionTiers: {
    free: {
      name: 'Free',
      priceId: null,
      features: ['1 free video', 'Basic AI summaries', 'Community support'],
      videoLimit: 1,
      analyticsAccess: false,
      apiAccess: false
    },
    basic: {
      name: 'Basic',
      monthly: {
        priceId: process.env.STRIPE_BASIC_PRICE_ID,
        price: 39,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_BASIC_YEARLY_PRICE_ID,
        price: 390,
        monthlyEquivalent: 32.50,
        originalMonthlyTotal: 468,
        savings: 78,
        period: 'year'
      },
      features: ['4 videos/month', 'Video Transcript', 'SEO Optimized Summary', 'Video Chapters', '20 Social Media Posts', 'Email Support'],
      videoLimit: 4,
      analyticsAccess: false,
      apiAccess: false
    },
    premium: {
      name: 'Premium',
      monthly: {
        priceId: process.env.STRIPE_PREMIUM_PRICE_ID,
        price: 79,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID,
        price: 790,
        monthlyEquivalent: 65.83,
        originalMonthlyTotal: 948,
        savings: 158,
        period: 'year'
      },
      features: ['8 videos/month', 'All BASIC Content Types', 'Auto-update YouTube Video with Summary & Chapters', 'Slide Deck', 'E-Book', 'LinkedIn Article', 'Marketing Funnel Playbook', 'Newsletter'],
      videoLimit: 8,
      analyticsAccess: true,
      apiAccess: false
    },
    creator: {
      name: 'Creator',
      monthly: {
        priceId: process.env.STRIPE_CREATOR_PRICE_ID,
        price: 159,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_CREATOR_YEARLY_PRICE_ID,
        price: 1590,
        monthlyEquivalent: 132.50,
        originalMonthlyTotal: 1908,
        savings: 318,
        period: 'year'
      },
      features: ['16 videos/month', 'All PREMIUM Content Types', 'Blog Post', 'Podcast Script', 'Study Guide', 'Discussion Guide', 'Quiz', 'Quotes', 'Social Carousel', 'Group Chat Guide'],
      videoLimit: 16,
      analyticsAccess: true,
      apiAccess: true
    },
    enterprise: {
      name: 'Enterprise',
      monthly: {
        priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
        price: 399,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
        price: 3990,
        monthlyEquivalent: 332.50,
        originalMonthlyTotal: 4788,
        savings: 798,
        period: 'year'
      },
      features: ['50 videos/month', 'All PREMIUM Content Types', 'Blog Post', 'Podcast Script', 'Study Guide', 'Discussion Guide', 'Quiz', 'Quotes', 'Social Carousel', 'Group Chat Guide'],
      videoLimit: 50,
      analyticsAccess: true,
      apiAccess: true
    }
  },

  // Get tier configuration
  getTierConfig(tierName) {
    return this.subscriptionTiers[tierName] || null;
  },

  // Get all available tiers
  getAllTiers() {
    return Object.keys(this.subscriptionTiers).map(key => ({
      key,
      ...this.subscriptionTiers[key]
    }));
  }
};

module.exports = stripeConfig;
