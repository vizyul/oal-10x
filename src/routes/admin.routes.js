const express = require('express');
const router = express.Router();
const { adminMiddleware } = require('../middleware/admin.middleware');
const { subscriptionMiddleware } = require('../middleware');
const adminController = require('../controllers/admin.controller');
const { body } = require('express-validator');

// Apply subscription middleware first to ensure admin pages have subscription data
router.use(subscriptionMiddleware.addSubscriptionInfo);

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Admin Dashboard
router.get('/', adminController.dashboard);

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