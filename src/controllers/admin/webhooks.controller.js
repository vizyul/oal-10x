const database = require('../../services/database.service');
const { logger } = require('../../utils');

/**
 * Webhook Monitoring Controller
 * Provides admin endpoints for webhook processing statistics and management
 */
const webhooksController = {
  /**
   * Get webhook processing statistics
   */
  async getWebhookStats(req, res) {
    try {
      const { days = 7 } = req.query;

      const stats = await database.query(`
        SELECT
          event_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE processed_successfully = true) as successful,
          COUNT(*) FILTER (WHERE processed_successfully = false) as failed,
          AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds
        FROM subscription_events
        WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
        GROUP BY event_type
        ORDER BY total DESC
      `);

      res.json({
        success: true,
        period_days: parseInt(days),
        data: stats.rows
      });
    } catch (error) {
      logger.error('Error fetching webhook stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook statistics'
      });
    }
  },

  /**
   * Get overall webhook health metrics
   */
  async getWebhookHealth(req, res) {
    try {
      const healthMetrics = await database.query(`
        SELECT
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE processed_successfully = true) as successful_events,
          COUNT(*) FILTER (WHERE processed_successfully = false) as failed_events,
          COUNT(*) FILTER (WHERE status = 'processing') as stuck_events,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as events_last_hour,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as events_last_24h,
          ROUND(
            (COUNT(*) FILTER (WHERE processed_successfully = true)::numeric /
             NULLIF(COUNT(*), 0) * 100),
            2
          ) as success_rate_percent
        FROM subscription_events
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `);

      res.json({
        success: true,
        health: healthMetrics.rows[0]
      });
    } catch (error) {
      logger.error('Error fetching webhook health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch webhook health metrics'
      });
    }
  },

  /**
   * Get failed webhooks for retry
   */
  async getFailedWebhooks(req, res) {
    try {
      const { limit = 50, maxRetries = 3 } = req.query;

      const failed = await database.query(`
        SELECT *
        FROM subscription_events
        WHERE processed_successfully = false
        AND retry_count < $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [parseInt(maxRetries), parseInt(limit)]);

      res.json({
        success: true,
        count: failed.rows.length,
        data: failed.rows
      });
    } catch (error) {
      logger.error('Error fetching failed webhooks:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch failed webhooks'
      });
    }
  },

  /**
   * Get recent webhook events
   */
  async getRecentEvents(req, res) {
    try {
      const { limit = 100, eventType = null } = req.query;

      let query = `
        SELECT
          id,
          stripe_event_id,
          event_type,
          status,
          processed_successfully,
          retry_count,
          created_at,
          processed_at,
          error_message
        FROM subscription_events
      `;

      const params = [];
      if (eventType) {
        query += ' WHERE event_type = $1';
        params.push(eventType);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
      params.push(parseInt(limit));

      const events = await database.query(query, params);

      res.json({
        success: true,
        count: events.rows.length,
        data: events.rows
      });
    } catch (error) {
      logger.error('Error fetching recent events:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch recent events'
      });
    }
  },

  /**
   * Get subscription migration analytics
   */
  async getSubscriptionMigrations(req, res) {
    try {
      const { days = 30 } = req.query;

      const migrations = await database.query(`
        SELECT
          migration_type,
          COUNT(*) as count,
          AVG(proration_amount) as avg_proration,
          fp.plan_name as from_plan,
          tp.plan_name as to_plan
        FROM subscription_plan_migrations spm
        LEFT JOIN subscription_plans fp ON spm.from_plan_id = fp.id
        LEFT JOIN subscription_plans tp ON spm.to_plan_id = tp.id
        WHERE spm.created_at >= NOW() - INTERVAL '${parseInt(days)} days'
        GROUP BY migration_type, fp.plan_name, tp.plan_name
        ORDER BY count DESC
      `);

      res.json({
        success: true,
        period_days: parseInt(days),
        data: migrations.rows
      });
    } catch (error) {
      logger.error('Error fetching migration analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch migration analytics'
      });
    }
  }
};

module.exports = webhooksController;
