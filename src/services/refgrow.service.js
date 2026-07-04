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

      // RefGrow API: GET /api/v1/affiliates/:email
      // Returns { success: true, data: { id, user_email, referral_code, status, ... } }
      const response = await axios.get(
        `${this.baseUrl}/affiliates/${encodeURIComponent(email)}`,
        { headers: this.getHeaders() }
      );

      const data = response.data;

      if (data.success && data.data && data.data.id) {
        return data.data;
      }

      // Direct object response fallback
      if (data.id) {
        return data;
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
   * Get affiliate by referral code from local database
   * @param {string} referralCode - Affiliate referral code
   * @returns {Promise<Object|null>} Affiliate user record or null
   */
  async getAffiliateByReferralCode(referralCode) {
    try {
      const result = await database.query(
        'SELECT id, email, first_name, refgrow_affiliate_id, affiliate_code FROM users WHERE affiliate_code = $1 AND is_affiliate = TRUE',
        [referralCode]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error looking up affiliate by referral code:', {
        referralCode,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Record a conversion locally when a referred user subscribes.
   *
   * IMPORTANT: This does NOT post to RefGrow's /conversions API. RefGrow's own
   * Stripe integration credits the affiliate automatically from the
   * `referral_code` we pass in the Stripe Checkout session metadata (see
   * stripe.service.createCheckoutSession). Posting a conversion here as well
   * would double-count the commission. This method only writes the local
   * `affiliate_referrals` row that powers the in-app affiliate dashboard.
   *
   * @param {string} referralCode - Affiliate referral code
   * @param {number} userId - User ID who subscribed
   * @param {number} subscriptionAmount - Subscription amount in dollars
   * @param {string} stripeSubscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Local conversion record result
   */
  async trackConversion(referralCode, userId, subscriptionAmount, stripeSubscriptionId) {
    // Commission mirrored locally for the dashboard; RefGrow remains the source
    // of truth for what is actually paid out.
    const commissionAmount = (subscriptionAmount * this.commissionRate) / 100;

    // Create local referral record for in-app reporting.
    try {
      const referralRecord = await database.create('affiliate_referrals', {
        users_id: userId,
        refgrow_referral_id: null,
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

      logger.info('Affiliate conversion recorded locally (RefGrow credits via Stripe metadata)', {
        userId,
        referralCode,
        commissionAmount
      });

      return { referralRecord };
    } catch (dbError) {
      logger.error('Error creating local affiliate referral record:', {
        referralCode,
        userId,
        error: dbError.message
      });
      throw dbError;
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
   * Update an affiliate's PayPal payout email on RefGrow.
   * Calls PUT /api/v1/affiliates/:email with payout_method=paypal and the new
   * paypal_email so RefGrow uses it on the next PayPal Payouts batch.
   *
   * Returns { success: true } on success, { success: false, error } on failure.
   * Does NOT throw — callers (e.g. the verify endpoint) decide whether a
   * RefGrow sync failure should block local persistence.
   *
   * @param {string} userEmail - The affiliate's account email (RefGrow's lookup key)
   * @param {string} paypalEmail - The verified PayPal email to register for payouts
   * @returns {Promise<{success: boolean, data?: Object, error?: string}>}
   */
  async updateAffiliatePayPalEmail(userEmail, paypalEmail) {
    if (!this.isConfigured()) {
      return { success: false, error: 'RefGrow API not configured' };
    }

    try {
      const response = await axios.put(
        `${this.baseUrl}/affiliates/${encodeURIComponent(userEmail)}`,
        {
          payout_method: 'paypal',
          paypal_email: paypalEmail
        },
        { headers: this.getHeaders() }
      );

      logger.info('RefGrow affiliate PayPal email updated', {
        userEmail,
        paypalEmail
      });

      return { success: true, data: response.data };
    } catch (error) {
      logger.warn('Failed to update RefGrow affiliate PayPal email:', {
        userEmail,
        paypalEmail,
        status: error.response?.status,
        error: error.message,
        responseData: error.response?.data
      });

      return {
        success: false,
        error: error.response?.data?.message || error.message,
        status: error.response?.status
      };
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
    const { referral_id, amount } = data;

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
