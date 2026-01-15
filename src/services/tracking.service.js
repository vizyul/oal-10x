/**
 * Server-side Tracking Service
 * Sends conversion events to Meta Conversions API and TikTok Events API
 * Used by Stripe webhooks to track purchases server-side (more reliable than client-side)
 */

/* global fetch */
const crypto = require('crypto');
const { logger } = require('../utils');

class TrackingService {
  constructor() {
    // Meta Conversions API config
    this.metaPixelId = process.env.META_PIXEL_ID;
    this.metaAccessToken = process.env.META_CONVERSIONS_API_TOKEN;
    this.metaApiVersion = 'v18.0';

    // TikTok Events API config
    this.tiktokPixelId = process.env.TIKTOK_PIXEL_ID;
    this.tiktokAccessToken = process.env.TIKTOK_EVENTS_API_TOKEN;
  }

  /**
   * Hash data for Meta (SHA256)
   */
  hashData(data) {
    if (!data) return null;
    return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
  }

  /**
   * Track purchase event on both platforms
   * @param {Object} params - Purchase parameters
   * @param {string} params.email - User email
   * @param {string} params.userId - Internal user ID
   * @param {number} params.value - Purchase amount
   * @param {string} params.currency - Currency code (USD)
   * @param {string} params.planName - Subscription plan name
   * @param {string} params.subscriptionId - Stripe subscription ID
   * @param {string} params.eventSourceUrl - URL where event originated
   */
  async trackPurchase(params) {
    const { email, userId, value, currency, planName, subscriptionId, eventSourceUrl } = params;

    logger.info('Server-side tracking: Purchase event', {
      userId,
      planName,
      value,
      currency,
      hasMetaToken: !!this.metaAccessToken,
      hasTikTokToken: !!this.tiktokAccessToken
    });

    const results = {
      meta: null,
      tiktok: null
    };

    // Track on Meta Conversions API
    if (this.metaPixelId && this.metaAccessToken) {
      try {
        results.meta = await this.trackMetaPurchase({
          email,
          userId,
          value,
          currency,
          planName,
          subscriptionId,
          eventSourceUrl
        });
      } catch (error) {
        logger.error('Meta Conversions API error:', {
          error: error.message,
          userId,
          planName
        });
      }
    } else {
      logger.debug('Meta Conversions API not configured - skipping server-side tracking');
    }

    // Track on TikTok Events API
    if (this.tiktokPixelId && this.tiktokAccessToken) {
      try {
        results.tiktok = await this.trackTikTokPurchase({
          email,
          userId,
          value,
          currency,
          planName,
          subscriptionId,
          eventSourceUrl
        });
      } catch (error) {
        logger.error('TikTok Events API error:', {
          error: error.message,
          userId,
          planName
        });
      }
    } else {
      logger.debug('TikTok Events API not configured - skipping server-side tracking');
    }

    return results;
  }

  /**
   * Track purchase on Meta Conversions API
   */
  async trackMetaPurchase(params) {
    const { email, userId, value, currency, planName, subscriptionId, eventSourceUrl } = params;

    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `purchase_${subscriptionId}_${eventTime}`;

    const payload = {
      data: [{
        event_name: 'Purchase',
        event_time: eventTime,
        event_id: eventId,
        event_source_url: eventSourceUrl || process.env.BASE_URL || 'https://amplifycontent.ai',
        action_source: 'website',
        user_data: {
          em: email ? [this.hashData(email)] : [],
          external_id: userId ? [this.hashData(String(userId))] : []
        },
        custom_data: {
          value: value || 0,
          currency: currency || 'USD',
          content_name: planName,
          content_type: 'subscription',
          content_ids: [planName?.toLowerCase() || 'subscription'],
          order_id: subscriptionId
        }
      }]
    };

    const url = `https://graph.facebook.com/${this.metaApiVersion}/${this.metaPixelId}/events?access_token=${this.metaAccessToken}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Meta API error: ${JSON.stringify(result)}`);
    }

    logger.info('Meta Conversions API: Purchase tracked', {
      eventId,
      eventsReceived: result.events_received,
      planName,
      value
    });

    return result;
  }

  /**
   * Track purchase on TikTok Events API
   */
  async trackTikTokPurchase(params) {
    const { email, userId, value, currency, planName, subscriptionId, eventSourceUrl } = params;

    const eventTime = new Date().toISOString();
    const eventId = `purchase_${subscriptionId}_${Date.now()}`;

    const payload = {
      pixel_code: this.tiktokPixelId,
      event: 'CompletePayment',
      event_id: eventId,
      timestamp: eventTime,
      context: {
        page: {
          url: eventSourceUrl || process.env.BASE_URL || 'https://amplifycontent.ai'
        },
        user: {
          email: email ? this.hashData(email) : undefined,
          external_id: userId ? this.hashData(String(userId)) : undefined
        }
      },
      properties: {
        value: value || 0,
        currency: currency || 'USD',
        content_name: planName,
        content_type: 'subscription',
        content_id: planName?.toLowerCase() || 'subscription',
        order_id: subscriptionId
      }
    };

    const url = 'https://business-api.tiktok.com/open_api/v1.3/pixel/track/';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': this.tiktokAccessToken
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.code !== 0) {
      throw new Error(`TikTok API error: ${JSON.stringify(result)}`);
    }

    logger.info('TikTok Events API: Purchase tracked', {
      eventId,
      planName,
      value,
      code: result.code
    });

    // Also fire Subscribe event for subscription-specific tracking
    try {
      const subscribePayload = {
        ...payload,
        event: 'Subscribe',
        event_id: `subscribe_${subscriptionId}_${Date.now()}`
      };

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Access-Token': this.tiktokAccessToken
        },
        body: JSON.stringify(subscribePayload)
      });

      logger.info('TikTok Events API: Subscribe event tracked', { subscriptionId });
    } catch (subscribeError) {
      logger.warn('TikTok Subscribe event failed:', subscribeError.message);
    }

    return result;
  }

  /**
   * Track registration completion event
   */
  async trackRegistration(params) {
    const { email, userId, eventSourceUrl } = params;

    logger.info('Server-side tracking: Registration event', {
      userId,
      hasMetaToken: !!this.metaAccessToken,
      hasTikTokToken: !!this.tiktokAccessToken
    });

    const results = {
      meta: null,
      tiktok: null
    };

    // Track on Meta
    if (this.metaPixelId && this.metaAccessToken) {
      try {
        const eventTime = Math.floor(Date.now() / 1000);
        const eventId = `registration_${userId}_${eventTime}`;

        const payload = {
          data: [{
            event_name: 'CompleteRegistration',
            event_time: eventTime,
            event_id: eventId,
            event_source_url: eventSourceUrl || process.env.BASE_URL,
            action_source: 'website',
            user_data: {
              em: email ? [this.hashData(email)] : [],
              external_id: userId ? [this.hashData(String(userId))] : []
            },
            custom_data: {
              content_name: 'User Signup',
              status: 'complete'
            }
          }]
        };

        const url = `https://graph.facebook.com/${this.metaApiVersion}/${this.metaPixelId}/events?access_token=${this.metaAccessToken}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        results.meta = await response.json();
        logger.info('Meta Conversions API: Registration tracked', { eventId, userId });
      } catch (error) {
        logger.error('Meta registration tracking error:', error.message);
      }
    }

    // Track on TikTok
    if (this.tiktokPixelId && this.tiktokAccessToken) {
      try {
        const eventId = `registration_${userId}_${Date.now()}`;

        const payload = {
          pixel_code: this.tiktokPixelId,
          event: 'CompleteRegistration',
          event_id: eventId,
          timestamp: new Date().toISOString(),
          context: {
            page: { url: eventSourceUrl || process.env.BASE_URL },
            user: {
              email: email ? this.hashData(email) : undefined,
              external_id: userId ? this.hashData(String(userId)) : undefined
            }
          },
          properties: {
            content_name: 'User Signup'
          }
        };

        const url = 'https://business-api.tiktok.com/open_api/v1.3/pixel/track/';

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': this.tiktokAccessToken
          },
          body: JSON.stringify(payload)
        });

        results.tiktok = await response.json();
        logger.info('TikTok Events API: Registration tracked', { eventId, userId });
      } catch (error) {
        logger.error('TikTok registration tracking error:', error.message);
      }
    }

    return results;
  }
}

module.exports = new TrackingService();
