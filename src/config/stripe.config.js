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
    const requiredKeys = [
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
      features: ['Browse content', 'Basic AI summaries', 'Community support'],
      videoLimit: 0,
      analyticsAccess: false,
      apiAccess: false
    },
    basic: {
      name: 'Basic',
      monthly: {
        priceId: process.env.STRIPE_BASIC_PRICE_ID,
        price: 49,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_BASIC_YEARLY_PRICE_ID,
        price: 490,
        monthlyEquivalent: 40.83,
        originalMonthlyTotal: 588,
        savings: 98,
        period: 'year'
      },
      features: ['4 videos/month', 'Basic AI summaries', 'Email support'],
      videoLimit: 4,
      analyticsAccess: false,
      apiAccess: false
    },
    premium: {
      name: 'Premium',
      monthly: {
        priceId: process.env.STRIPE_PREMIUM_PRICE_ID,
        price: 149,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_PREMIUM_YEARLY_PRICE_ID,
        price: 1490,
        monthlyEquivalent: 124.17,
        originalMonthlyTotal: 1788,
        savings: 298,
        period: 'year'
      },
      features: ['8 videos/month', 'Advanced AI content', 'Analytics dashboard', 'Priority support'],
      videoLimit: 8,
      analyticsAccess: true,
      apiAccess: false
    },
    enterprise: {
      name: 'Enterprise',
      monthly: {
        priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID,
        price: 299,
        period: 'month'
      },
      yearly: {
        priceId: process.env.STRIPE_ENTERPRISE_YEARLY_PRICE_ID,
        price: 2990,
        monthlyEquivalent: 249.17,
        originalMonthlyTotal: 3588,
        savings: 598,
        period: 'year'
      },
      features: ['16 videos/month', 'Priority processing', 'API access', 'Dedicated support'],
      videoLimit: 16,
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
