const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/admin.middleware');
const { subscriptionMiddleware } = require('../middleware');
const adminController = require('../controllers/admin.controller');
const webhooksController = require('../controllers/admin/webhooks.controller');
const database = require('../services/database.service');
const subscriptionService = require('../services/subscription.service');
const { logger } = require('../utils');
const { body } = require('express-validator');

// Apply subscription middleware first to ensure admin pages have subscription data
router.use(subscriptionMiddleware.addSubscriptionInfo);

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Admin Dashboard
router.get('/', adminController.dashboard);

// Subscription Management
router.get('/subscriptions', async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT
        us.id,
        us.stripe_subscription_id,
        us.status,
        us.current_period_start,
        us.current_period_end,
        us.cancel_at_period_end,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name,
        COALESCE(sp.plan_name, us.plan_name) as plan_name,
        spp.billing_period,
        ROUND(spp.amount / 100.0, 2) as price
      FROM user_subscriptions us
      JOIN users u ON us.users_id = u.id
      LEFT JOIN subscription_plan_prices spp ON us.price_id = spp.stripe_price_id
      LEFT JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
    `;

    const params = [];
    if (status !== 'all') {
      query += ` WHERE us.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY us.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const subscriptions = await database.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM user_subscriptions';
    if (status !== 'all') {
      countQuery += ' WHERE status = $1';
    }
    const countResult = await database.query(countQuery, status !== 'all' ? [status] : []);
    const totalCount = parseInt(countResult.rows[0].count);

    res.render('admin/subscriptions', {
      layout: 'main',
      title: 'Subscription Management',
      user: req.user,
      subscriptions: subscriptions.rows,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / parseInt(limit))
    });
  } catch (error) {
    logger.error('Error rendering subscriptions page:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

// Webhook Monitoring
router.get('/webhooks', async (req, res) => {
  try {
    res.render('admin/webhooks', {
      layout: 'main',
      title: 'Webhook Monitoring',
      user: req.user
    });
  } catch (error) {
    logger.error('Error rendering webhooks page:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

// System Health
router.get('/health', async (req, res) => {
  try {
    res.render('admin/health', {
      layout: 'main',
      title: 'System Health',
      user: req.user
    });
  } catch (error) {
    logger.error('Error rendering health page:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

// API Endpoints for AJAX
router.get('/api/webhooks/stats', webhooksController.getWebhookStats);
router.get('/api/webhooks/health', webhooksController.getWebhookHealth);
router.get('/api/webhooks/failed', webhooksController.getFailedWebhooks);
router.get('/api/webhooks/recent', webhooksController.getRecentEvents);
router.get('/api/webhooks/migrations', webhooksController.getSubscriptionMigrations);

// Content Types Management
router.get('/content-types', adminController.contentTypesIndex);
router.get('/content-types/new', adminController.newContentType);
router.post('/content-types', [
  body('key').trim().isLength({ min: 1 }).withMessage('Key is required')
    .matches(/^[a-z0-9_]+$/).withMessage('Key must contain only lowercase letters, numbers, and underscores'),
  body('label').trim().isLength({ min: 1 }).withMessage('Label is required'),
  body('description').optional().trim(),
  body('icon').trim().isLength({ min: 1 }).withMessage('Icon is required'),
  body('display_order').isNumeric().withMessage('Display order must be a number'),
], adminController.createContentType);

router.get('/content-types/:id', adminController.showContentType);
router.get('/content-types/:id/edit', adminController.editContentType);
router.put('/content-types/:id', [
  body('label').trim().isLength({ min: 1 }).withMessage('Label is required'),
  body('description').optional().trim(),
  body('icon').trim().isLength({ min: 1 }).withMessage('Icon is required'),
  body('display_order').isNumeric().withMessage('Display order must be a number'),
], adminController.updateContentType);

// AI Prompts Management
router.get('/content-types/:id/prompts', adminController.managePrompts);
router.post('/content-types/:id/prompts', [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('description').optional().trim(),
  body('ai_provider').isIn(['openai', 'google', 'claude', 'gemini', 'chatgpt']).withMessage('Invalid AI provider'),
  body('prompt_text').trim().isLength({ min: 1 }).withMessage('Prompt text is required'),
  body('system_message').optional().trim(),
  body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('Temperature must be between 0 and 2'),
  body('max_tokens').optional().isInt({ min: 1, max: 100000 }).withMessage('Max tokens must be between 1 and 100000'),
], adminController.createPrompt);

router.put('/prompts/:promptId', [
  body('name').trim().isLength({ min: 1 }).withMessage('Name is required'),
  body('description').optional().trim(),
  body('prompt_text').trim().isLength({ min: 1 }).withMessage('Prompt text is required'),
  body('system_message').optional().trim(),
  body('temperature').optional().isFloat({ min: 0, max: 2 }).withMessage('Temperature must be between 0 and 2'),
  body('max_tokens').optional().isInt({ min: 1, max: 100000 }).withMessage('Max tokens must be between 1 and 100000'),
], adminController.updatePrompt);

router.delete('/prompts/:promptId', adminController.deletePrompt);

// AJAX API endpoints for unified management interface
router.get('/api/content-types/:id', adminController.getContentTypeData);
router.get('/api/prompts/:promptId', adminController.getPromptData);

// ===========================================
// SUBSCRIPTION GRANTS MANAGEMENT
// ===========================================

// Grants list page
router.get('/grants', async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 50 } = req.query;

    const grantsData = await subscriptionService.getAllGrants({
      status,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.render('admin/grants/index', {
      layout: 'main',
      title: 'Subscription Grants',
      user: req.user,
      subscription: req.subscriptionInfo,
      grants: grantsData.grants,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount: grantsData.total,
      totalPages: grantsData.totalPages
    });
  } catch (error) {
    logger.error('Error rendering grants page:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

// New grant form
router.get('/grants/new', async (req, res) => {
  try {
    const { userId } = req.query;
    let selectedUser = null;

    if (userId) {
      const result = await database.query(
        'SELECT id, email, first_name, last_name, subscription_tier FROM users WHERE id = $1',
        [userId]
      );
      selectedUser = result.rows[0] || null;
    }

    res.render('admin/grants/new', {
      layout: 'main',
      title: 'Create Subscription Grant',
      user: req.user,
      subscription: req.subscriptionInfo,
      selectedUser
    });
  } catch (error) {
    logger.error('Error rendering new grant form:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

// Search users API for grants
router.get('/api/grants/search-users', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const result = await database.query(`
      SELECT id, email, first_name, last_name, subscription_tier, free_video_used
      FROM users
      WHERE email ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
      ORDER BY email
      LIMIT 20
    `, [`%${q}%`]);

    res.json({ users: result.rows });
  } catch (error) {
    logger.error('Error searching users:', error);
    res.status(500).json({ error: 'Failed to search users' });
  }
});

// Get user details for grant form
router.get('/api/grants/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userResult = await database.query(`
      SELECT id, email, first_name, last_name, subscription_tier, subscription_status, free_video_used
      FROM users WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingGrant = await subscriptionService.getActiveGrant(userId);
    const grantHistory = await subscriptionService.getUserGrants(userId);

    res.json({
      user: userResult.rows[0],
      activeGrant: existingGrant,
      grantHistory
    });
  } catch (error) {
    logger.error('Error getting user details:', error);
    res.status(500).json({ error: 'Failed to get user details' });
  }
});

// Create grant
router.post('/grants', [
  body('userId').notEmpty().withMessage('User ID is required'),
  body('grantType').isIn(['full_access', 'video_limit_override', 'unlimited_videos', 'trial_extension']).withMessage('Invalid grant type'),
  body('reason').trim().isLength({ min: 1 }).withMessage('Reason is required')
], async (req, res) => {
  try {
    // Check validation results
    const { validationResult } = require('express-validator');
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(e => e.msg).join(', ');
      logger.warn('Grant validation failed:', errorMessages);

      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ error: errorMessages, validationErrors: errors.array() });
      }
      return res.redirect(`/admin/grants/new?error=${encodeURIComponent(errorMessages)}`);
    }

    const { userId, grantType, tierOverride, videoLimitOverride, reason, expiresAt } = req.body;

    logger.info('Creating grant:', { userId, grantType, tierOverride, videoLimitOverride, reason, expiresAt });

    const grant = await subscriptionService.createGrant({
      userId: parseInt(userId),
      grantedById: req.user.id,
      grantType,
      tierOverride: grantType === 'full_access' ? tierOverride : null,
      videoLimitOverride: grantType === 'video_limit_override' ? parseInt(videoLimitOverride) : null,
      reason,
      expiresAt: expiresAt || null
    });

    logger.info('Grant created successfully:', grant.id);

    // For API requests, return JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, grant });
    }

    // For form submissions, redirect
    res.redirect('/admin/grants?success=Grant created successfully');
  } catch (error) {
    logger.error('Error creating grant:', error);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to create grant: ' + error.message });
    }

    res.redirect('/admin/grants/new?error=' + encodeURIComponent('Failed to create grant: ' + error.message));
  }
});

// Revoke grant
router.post('/grants/:grantId/revoke', async (req, res) => {
  try {
    const { grantId } = req.params;

    await subscriptionService.revokeGrant(parseInt(grantId), req.user.id);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }

    res.redirect('/admin/grants?success=Grant revoked successfully');
  } catch (error) {
    logger.error('Error revoking grant:', error);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ error: 'Failed to revoke grant' });
    }

    res.redirect('/admin/grants?error=Failed to revoke grant');
  }
});

// View grant details
router.get('/grants/:grantId', async (req, res) => {
  try {
    const { grantId } = req.params;

    const result = await database.query(`
      SELECT
        g.*,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        u.subscription_tier as user_current_tier,
        admin.email as granted_by_email,
        admin.first_name as granted_by_first_name,
        admin.last_name as granted_by_last_name
      FROM admin_subscription_grants g
      JOIN users u ON g.user_id = u.id
      JOIN users admin ON g.granted_by_id = admin.id
      WHERE g.id = $1
    `, [grantId]);

    if (result.rows.length === 0) {
      return res.status(404).render('errors/404', {
        layout: 'main',
        title: 'Grant Not Found',
        user: req.user
      });
    }

    res.render('admin/grants/show', {
      layout: 'main',
      title: 'Grant Details',
      user: req.user,
      subscription: req.subscriptionInfo,
      grant: result.rows[0]
    });
  } catch (error) {
    logger.error('Error getting grant details:', error);
    res.status(500).render('errors/500', {
      layout: 'main',
      title: 'Server Error',
      user: req.user
    });
  }
});

module.exports = router;
