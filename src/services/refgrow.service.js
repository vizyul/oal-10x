const axios = require('axios');
const { logger } = require('../utils');
const database = require('./database.service');

/**
 * RefGrow Affiliate Program Service
 * Handles integration with RefGrow API for affiliate tracking and management
 */
class RefGrowService {
  constructor() {
    this.apiKey = process.env.REFGROW_API_KEY;
    // RefGrow API base URL - the API key is tied to your project, no project ID needed in URL
    this.baseUrl = process.env.REFGROW_API_URL || 'https://refgrow.com/api/v1';
    this.trackingDomain = process.env.REFGROW_TRACKING_DOMAIN;
    this.commissionRate = parseFloat(process.env.REFGROW_COMMISSION_RATE || '20.00');
    this.minimumPayout = parseFloat(process.env.REFGROW_MINIMUM_PAYOUT || '50.00');

    if (!this.apiKey || this.apiKey === 'your_refgrow_api_key_here') {
      logger.warn('RefGrow API key not configured. Affiliate features will be disabled.');
    }
  }

  /**
   * Check if RefGrow is properly configured
   */
  isConfigured() {
    return this.apiKey && this.apiKey !== 'your_refgrow_api_key_here';
  }

  /**
   * Get API headers for RefGrow requests
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Check if affiliate already exists in RefGrow by email
   * @param {string} email - User email to check
   * @returns {Promise<Object|null>} Existing affiliate data or null if not found
   */
  async findAffiliateByEmail(email) {
    try {
      if (!this.isConfigured()) {
        return null;
      }

      // Try to find existing affiliate by email
      const response = await axios.get(
        `${this.baseUrl}/affiliates`,
        {
          headers: this.getHeaders(),
          params: { email }
        }
      );

      const data = response.data;

      // Check various response formats RefGrow might use
      if (data.success && data.data) {
        // Format: { success: true, data: { id, user_email, referral_code, ... } }
        if (data.data.id) {
          return data.data;
        }
        // Format: { success: true, data: [{ id, user_email, referral_code, ... }] }
        if (Array.isArray(data.data) && data.data.length > 0) {
          return data.data.find(a => a.user_email === email || a.email === email) || null;
        }
      }

      // Direct array response
      if (Array.isArray(data) && data.length > 0) {
        return data.find(a => a.user_email === email || a.email === email) || null;
      }

      return null;
    } catch (error) {
      // 404 means not found, which is expected
      if (error.response?.status === 404) {
        return null;
      }
      logger.warn('Error checking for existing RefGrow affiliate:', {
        email,
        error: error.message,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Create affiliate account in RefGrow when user opts in
   * @param {number} userId - Local PostgreSQL user ID
   * @param {string} email - User email
   * @param {string} name - User full name
   * @returns {Promise<Object>} RefGrow affiliate data
   */
  async createAffiliate(userId, email, name) {
    try {
      logger.info('Creating affiliate', { userId, email });

      // Generate a local affiliate code as fallback
      const crypto = require('crypto');
      const localAffiliateCode = `aff_${crypto.randomBytes(8).toString('hex')}`;

      let refgrowAffiliateId = null;
      let affiliateCode = localAffiliateCode;

      // Try RefGrow API if configured
      if (this.isConfigured()) {
        try {
          // First, check if affiliate already exists in RefGrow
          const existingAffiliate = await this.findAffiliateByEmail(email);

          if (existingAffiliate) {
            // Affiliate already exists in RefGrow - use existing data
            logger.info('Affiliate already exists in RefGrow, linking existing account', {
              userId,
              email,
              refgrowAffiliateId: existingAffiliate.id
            });

            refgrowAffiliateId = existingAffiliate.id;
            affiliateCode = existingAffiliate.referral_code || localAffiliateCode;
          } else {
            // Create new affiliate in RefGrow
            // RefGrow API: POST /api/v1/affiliates
            // Only email is required, referral_code is optional (auto-generated if omitted)
            const response = await axios.post(
              `${this.baseUrl}/affiliates`,
              {
                email,
                // Let RefGrow generate the referral code, or pass our own
                // referral_code: localAffiliateCode
              },
              { headers: this.getHeaders() }
            );

            const affiliateData = response.data;

            // Response format: { success: true, data: { id, user_email, referral_code, created_at, status } }
            if (affiliateData.success && affiliateData.data) {
              refgrowAffiliateId = affiliateData.data.id;
              affiliateCode = affiliateData.data.referral_code || localAffiliateCode;
            } else {
              refgrowAffiliateId = affiliateData.id;
              affiliateCode = affiliateData.referral_code || localAffiliateCode;
            }

            logger.info('RefGrow affiliate created successfully', {
              userId,
              refgrowAffiliateId,
              affiliateCode
            });
          }
        } catch (apiError) {
          logger.warn('RefGrow API call failed, creating local affiliate only:', {
            userId,
            email,
            error: apiError.message,
            status: apiError.response?.status,
            response: apiError.response?.data
          });
          // Continue with local-only affiliate creation
        }
      } else {
        logger.info('RefGrow not configured, creating local affiliate only', { userId });
      }

      // Update local user record (works regardless of RefGrow API success)
      await database.update('users', userId, {
        refgrow_affiliate_id: refgrowAffiliateId,
        affiliate_code: affiliateCode,
        is_affiliate: true,
        affiliate_status: 'active',
        affiliate_joined_at: new Date()
      });

      logger.info('Affiliate created successfully', {
        userId,
        affiliateCode,
        refgrowAffiliateId: refgrowAffiliateId || 'local-only'
      });

      return {
        id: refgrowAffiliateId || `local_${userId}`,
        affiliate_code: affiliateCode,
        email,
        name
      };
    } catch (error) {
      logger.error('Error creating affiliate:', {
        userId,
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Track referral click when user arrives via affiliate link
   * @param {string} referralCode - Affiliate referral code from URL
   * @param {Object} clickData - Click tracking data
   */
  async trackClick(referralCode, clickData = {}) {
    try {
      const {
        ipAddress,
        userAgent,
        referrerUrl,
        landingPage,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent
      } = clickData;

      // Store click in local database
      await database.create('affiliate_clicks', {
        referral_code: referralCode,
        ip_address: ipAddress,
        user_agent: userAgent,
        referrer_url: referrerUrl,
        landing_page: landingPage,
        utm_source: utmSource,
        utm_medium: utmMedium,
        utm_campaign: utmCampaign,
        utm_term: utmTerm,
        utm_content: utmContent,
        clicked_at: new Date()
      });

      logger.info('Affiliate click tracked', { referralCode });
    } catch (error) {
      logger.error('Error tracking affiliate click:', error);
      // Don't throw - click tracking shouldn't block user experience
    }
  }

  /**
   * Track conversion when user subscribes via referral
   * @param {string} referralCode - Affiliate referral code
   * @param {number} userId - User ID who subscribed
   * @param {number} subscriptionAmount - Subscription amount in dollars
   * @param {string} stripeSubscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Conversion tracking result
   */
  async trackConversion(referralCode, userId, subscriptionAmount, stripeSubscriptionId) {
    try {
      if (!this.isConfigured()) {
        logger.warn('RefGrow not configured, skipping conversion tracking');
        return null;
      }

      logger.info('Tracking RefGrow conversion', {
        referralCode,
        userId,
        amount: subscriptionAmount
      });

      // Calculate commission
      const commissionAmount = (subscriptionAmount * this.commissionRate) / 100;

      // Track conversion in RefGrow API
      const response = await axios.post(
        `${this.baseUrl}/conversions`,
        {
          referral_code: referralCode,
          customer_id: userId.toString(),
          amount: subscriptionAmount,
          currency: 'usd',
          commission_amount: commissionAmount,
          metadata: {
            stripe_subscription_id: stripeSubscriptionId,
            commission_rate: this.commissionRate
          }
        },
        { headers: this.getHeaders() }
      );

      const conversionData = response.data;

      // Create local referral record
      const referralRecord = await database.create('affiliate_referrals', {
        users_id: userId,
        refgrow_referral_id: conversionData.id || conversionData.referral_id,
        referral_code: referralCode,
        commission_amount: commissionAmount,
        commission_rate: this.commissionRate,
        commission_status: 'pending',
        stripe_subscription_id: stripeSubscriptionId,
        converted_at: new Date()
      });

      // Update click record if exists
      await database.query(
        'UPDATE affiliate_clicks SET converted = TRUE, users_id = $1 WHERE referral_code = $2 AND users_id IS NULL',
        [userId, referralCode]
      );

      logger.info('RefGrow conversion tracked successfully', {
        userId,
        referralCode,
        commissionAmount
      });

      return { referralRecord, conversionData };
    } catch (error) {
      logger.error('Error tracking RefGrow conversion:', {
        referralCode,
        userId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Get affiliate statistics
   * @param {string} refgrowAffiliateId - RefGrow affiliate ID
   * @returns {Promise<Object>} Affiliate stats
   */
  async getAffiliateStats(refgrowAffiliateId) {
    try {
      if (!this.isConfigured()) {
        throw new Error('RefGrow API not configured');
      }

      const response = await axios.get(
        `${this.baseUrl}/affiliates/${refgrowAffiliateId}/stats`,
        { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      logger.error('Error fetching affiliate stats:', {
        refgrowAffiliateId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Get local affiliate statistics from database
   * @param {number} userId - Local user ID
   * @returns {Promise<Object>} Local affiliate stats
   */
  async getLocalAffiliateStats(userId) {
    try {
      const user = await database.findById('users', userId);

      if (!user || !user.is_affiliate) {
        throw new Error('User is not an affiliate');
      }

      // Get referral stats
      const referralsResult = await database.query(`
        SELECT
          COUNT(*) as total_referrals,
          COUNT(CASE WHEN converted_at IS NOT NULL THEN 1 END) as conversions,
          SUM(CASE WHEN commission_status = 'pending' THEN commission_amount ELSE 0 END) as pending_commissions,
          SUM(CASE WHEN commission_status = 'paid' THEN commission_amount ELSE 0 END) as paid_commissions,
          SUM(commission_amount) as total_commissions
        FROM affiliate_referrals ar
        JOIN users u ON ar.referral_code = u.referred_by_code
        WHERE u.refgrow_affiliate_id = $1
      `, [user.refgrow_affiliate_id]);

      // Get click stats
      const clicksResult = await database.query(`
        SELECT
          COUNT(*) as total_clicks,
          COUNT(CASE WHEN converted = TRUE THEN 1 END) as converted_clicks
        FROM affiliate_clicks
        WHERE refgrow_affiliate_id = $1
      `, [user.refgrow_affiliate_id]);

      const stats = referralsResult.rows[0];
      const clicks = clicksResult.rows[0];

      return {
        totalReferrals: parseInt(stats.total_referrals || 0),
        conversions: parseInt(stats.conversions || 0),
        pendingCommissions: parseFloat(stats.pending_commissions || 0),
        paidCommissions: parseFloat(stats.paid_commissions || 0),
        totalCommissions: parseFloat(stats.total_commissions || 0),
        totalClicks: parseInt(clicks.total_clicks || 0),
        conversionRate: clicks.total_clicks > 0
          ? ((stats.conversions / clicks.total_clicks) * 100).toFixed(2)
          : 0
      };
    } catch (error) {
      logger.error('Error fetching local affiliate stats:', error);
      throw error;
    }
  }

  /**
   * Get user's referral code
   * @param {number} userId - Local user ID
   * @returns {Promise<string|null>} Referral code or null
   */
  async getReferralCode(userId) {
    try {
      const user = await database.findById('users', userId);

      if (!user || !user.is_affiliate || !user.refgrow_affiliate_id) {
        return null;
      }

      // In RefGrow, referral codes are typically generated server-side
      // You might need to fetch this from RefGrow API or generate it locally
      // For now, we'll use a simple format: firstname-userid
      const code = `${user.first_name?.toLowerCase() || 'user'}-${user.id}`;

      return code;
    } catch (error) {
      logger.error('Error getting referral code:', error);
      return null;
    }
  }

  /**
   * Update commission status
   * @param {number} referralId - Local referral ID
   * @param {string} status - New status (pending, approved, paid, failed, cancelled)
   * @param {Object} additionalData - Additional data to update
   */
  async updateCommissionStatus(referralId, status, additionalData = {}) {
    try {
      const updateData = {
        commission_status: status,
        ...additionalData
      };

      if (status === 'paid') {
        updateData.paid_at = new Date();
      }

      await database.update('affiliate_referrals', referralId, updateData);

      logger.info('Commission status updated', { referralId, status });
    } catch (error) {
      logger.error('Error updating commission status:', error);
      throw error;
    }
  }

  /**
   * Process webhook from RefGrow
   * @param {Object} webhookData - Webhook payload
   * @returns {Promise<boolean>} Success status
   */
  async processWebhook(webhookData) {
    try {
      const { event_type, data } = webhookData;

      logger.info('Processing RefGrow webhook', { event_type });

      switch (event_type) {
      case 'commission.paid':
        await this.handleCommissionPaid(data);
        break;

      case 'commission.approved':
        await this.handleCommissionApproved(data);
        break;

      case 'affiliate.created':
        await this.handleAffiliateCreated(data);
        break;

      case 'conversion.tracked':
        await this.handleConversionTracked(data);
        break;

      default:
        logger.warn('Unhandled RefGrow webhook event type', { event_type });
      }

      return true;
    } catch (error) {
      logger.error('Error processing RefGrow webhook:', error);
      throw error;
    }
  }

  /**
   * Handle commission paid webhook
   */
  async handleCommissionPaid(data) {
    const { referral_id, amount, transaction_id } = data;

    await database.query(
      `UPDATE affiliate_referrals
       SET commission_status = 'paid', paid_at = CURRENT_TIMESTAMP
       WHERE refgrow_referral_id = $1`,
      [referral_id]
    );

    logger.info('Commission marked as paid', { referral_id, amount });
  }

  /**
   * Handle commission approved webhook
   */
  async handleCommissionApproved(data) {
    const { referral_id } = data;

    await database.query(
      `UPDATE affiliate_referrals
       SET commission_status = 'approved'
       WHERE refgrow_referral_id = $1`,
      [referral_id]
    );

    logger.info('Commission approved', { referral_id });
  }

  /**
   * Handle affiliate created webhook
   */
  async handleAffiliateCreated(data) {
    logger.info('New affiliate created in RefGrow', data);
  }

  /**
   * Handle conversion tracked webhook
   */
  async handleConversionTracked(data) {
    logger.info('Conversion tracked in RefGrow', data);
  }

  /**
   * Verify webhook signature
   * @param {string} signature - Webhook signature from header
   * @param {string} payload - Raw request body
   * @returns {boolean} Whether signature is valid
   */
  verifyWebhookSignature(signature, payload) {
    const crypto = require('crypto');
    const secret = process.env.REFGROW_WEBHOOK_SECRET;

    if (!secret || secret === 'your_webhook_secret_here') {
      logger.warn('RefGrow webhook secret not configured');
      return false;
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(payload).digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }
}

module.exports = new RefGrowService();
