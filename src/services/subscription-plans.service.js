const database = require('./database.service');
const { logger } = require('../utils');

/**
 * Subscription Plans Service
 * Handles retrieval of subscription plan data from the database
 * This replaces the hardcoded stripe.config.js for plan limits and features
 */
class SubscriptionPlansService {
  /**
   * Get plan configuration from database by plan key
   * @param {string} planKey - Plan key (free, basic, premium, enterprise)
   * @returns {Object} Plan configuration with limits and features
   */
  async getPlanByKey(planKey) {
    try {
      if (!planKey) {
        logger.warn('getPlanByKey called without planKey');
        return null;
      }

      const result = await database.query(`
        SELECT
          id,
          plan_key,
          plan_name,
          description,
          features,
          video_limit,
          api_calls_limit,
          storage_limit,
          metadata,
          is_active
        FROM subscription_plans
        WHERE plan_key = $1 AND is_active = true
        LIMIT 1
      `, [planKey]);

      if (result.rows.length === 0) {
        logger.warn(`No active plan found for key: ${planKey}`);
        return null;
      }

      const plan = result.rows[0];

      // Use the video_limit column from database (not extracted from features)
      const videoLimit = plan.video_limit !== null ? plan.video_limit : 0;

      // Get price information
      const prices = await this.getPlanPrices(plan.id);

      return {
        id: plan.id,
        planKey: plan.plan_key,
        name: plan.plan_name,
        description: plan.description,
        features: plan.features || [],
        videoLimit: videoLimit,
        apiCallsLimit: plan.api_calls_limit !== null ? plan.api_calls_limit : 0,
        storageLimit: plan.storage_limit !== null ? plan.storage_limit : 0,
        prices: prices,
        metadata: plan.metadata || {}
      };
    } catch (error) {
      logger.error('Error getting plan by key:', error);
      throw error;
    }
  }

  /**
   * Extract video limit from features array
   * Looks for patterns like "4 videos/month" or "unlimited videos"
   * @param {Array} features - Array of feature strings
   * @returns {number} Video limit (-1 for unlimited, 0 if not found)
   */
  extractVideoLimit(features) {
    if (!features || !Array.isArray(features)) {
      return 0;
    }

    for (const feature of features) {
      const featureLower = feature.toLowerCase();

      // Check for unlimited
      if (featureLower.includes('unlimited') && featureLower.includes('video')) {
        return -1;
      }

      // Extract number from patterns like "4 videos/month" or "10 videos per month"
      const match = feature.match(/(\d+)\s*videos?\s*[\/per]*\s*month/i);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    return 0;
  }

  /**
   * Get all prices for a plan
   * @param {number} planId - Plan ID from subscription_plans table
   * @returns {Array} Array of price objects
   */
  async getPlanPrices(planId) {
    try {
      const result = await database.query(`
        SELECT
          id,
          stripe_price_id,
          currency,
          amount,
          billing_period,
          display_price,
          is_active,
          is_default
        FROM subscription_plan_prices
        WHERE subscription_plan_id = $1 AND is_active = true
        ORDER BY is_default DESC, amount ASC
      `, [planId]);

      return result.rows.map(price => ({
        id: price.id,
        stripePriceId: price.stripe_price_id,
        currency: price.currency,
        amount: price.amount,
        billingPeriod: price.billing_period,
        displayPrice: price.display_price,
        isDefault: price.is_default
      }));
    } catch (error) {
      logger.error('Error getting plan prices:', error);
      return [];
    }
  }

  /**
   * Get all active plans
   * @returns {Array} Array of plan objects
   */
  async getAllPlans() {
    try {
      const result = await database.query(`
        SELECT
          id,
          plan_key,
          plan_name,
          description,
          features,
          sort_order,
          is_visible
        FROM subscription_plans
        WHERE is_active = true AND is_visible = true
        ORDER BY sort_order ASC
      `);

      const plans = [];
      for (const row of result.rows) {
        const videoLimit = this.extractVideoLimit(row.features);
        const prices = await this.getPlanPrices(row.id);

        plans.push({
          id: row.id,
          planKey: row.plan_key,
          name: row.plan_name,
          description: row.description,
          features: row.features || [],
          videoLimit: videoLimit,
          prices: prices,
          sortOrder: row.sort_order
        });
      }

      return plans;
    } catch (error) {
      logger.error('Error getting all plans:', error);
      throw error;
    }
  }

  /**
   * Get plan by Stripe price ID
   * @param {string} stripePriceId - Stripe price ID
   * @returns {Object} Plan configuration
   */
  async getPlanByPriceId(stripePriceId) {
    try {
      const result = await database.query(`
        SELECT
          sp.id,
          sp.plan_key,
          sp.plan_name,
          sp.description,
          sp.features,
          sp.metadata
        FROM subscription_plans sp
        JOIN subscription_plan_prices spp ON sp.id = spp.subscription_plan_id
        WHERE spp.stripe_price_id = $1 AND sp.is_active = true
        LIMIT 1
      `, [stripePriceId]);

      if (result.rows.length === 0) {
        logger.warn(`No plan found for price ID: ${stripePriceId}`);
        return null;
      }

      const plan = result.rows[0];
      const videoLimit = this.extractVideoLimit(plan.features);
      const prices = await this.getPlanPrices(plan.id);

      return {
        id: plan.id,
        planKey: plan.plan_key,
        name: plan.plan_name,
        description: plan.description,
        features: plan.features || [],
        videoLimit: videoLimit,
        prices: prices,
        metadata: plan.metadata || {}
      };
    } catch (error) {
      logger.error('Error getting plan by price ID:', error);
      throw error;
    }
  }

  /**
   * Get feature flags for a plan (for backward compatibility with stripeConfig)
   * @param {string} planKey - Plan key
   * @returns {Object} Feature flags object
   */
  async getFeatureFlags(planKey) {
    try {
      const plan = await this.getPlanByKey(planKey);

      if (!plan) {
        return {
          analyticsAccess: false,
          apiAccess: false,
          prioritySupport: false,
          videoLimit: 0
        };
      }

      // Parse features to determine access flags
      const features = plan.features || [];
      const featuresLower = features.map(f => f.toLowerCase()).join(' ');

      return {
        analyticsAccess: featuresLower.includes('analytics'),
        apiAccess: featuresLower.includes('api access'),
        prioritySupport: featuresLower.includes('priority support') || featuresLower.includes('dedicated support'),
        videoLimit: plan.videoLimit
      };
    } catch (error) {
      logger.error('Error getting feature flags:', error);
      return {
        analyticsAccess: false,
        apiAccess: false,
        prioritySupport: false,
        videoLimit: 0
      };
    }
  }

  /**
   * Get tier (plan_key) from Stripe price ID
   * @param {string} stripePriceId - Stripe price ID
   * @returns {string|null} Plan key (free, basic, premium, creator, enterprise) or null
   */
  async getTierFromPrice(stripePriceId) {
    try {
      const result = await database.query(`
        SELECT sp.plan_key
        FROM subscription_plans sp
        JOIN subscription_plan_prices spp ON sp.id = spp.subscription_plan_id
        WHERE spp.stripe_price_id = $1 AND sp.is_active = true
        LIMIT 1
      `, [stripePriceId]);

      if (result.rows.length === 0) {
        logger.warn(`No tier found for Stripe price ID: ${stripePriceId}`);
        return null;
      }

      return result.rows[0].plan_key;
    } catch (error) {
      logger.error('Error getting tier from price ID:', error);
      return null;
    }
  }
}

module.exports = new SubscriptionPlansService();
