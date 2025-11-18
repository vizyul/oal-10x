const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/admin.middleware');
const { subscriptionMiddleware } = require('../middleware');
const adminController = require('../controllers/admin.controller');
const webhooksController = require('../controllers/admin/webhooks.controller');
const database = require('../services/database.service');
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

module.exports = router;
