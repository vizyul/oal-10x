const express = require('express');
const router = express.Router();
const contentController = require('../controllers/content.controller');
const { authMiddleware } = require('../middleware');
const { body, param, query } = require('express-validator');

// Apply authentication individually to routes instead of using router.use

/**
 * GET /api/content/types
 * Get all available content types
 */
router.get('/types', authMiddleware, contentController.getContentTypes);

/**
 * GET /api/content/videos/:videoId
 * Get all content for a specific video
 */
router.get('/videos/:videoId',
  authMiddleware,
  param('videoId').isInt().withMessage('Video ID must be an integer'),
  query('includeMetadata').optional().isBoolean().withMessage('includeMetadata must be boolean'),
  query('publishedOnly').optional().isBoolean().withMessage('publishedOnly must be boolean'),
  contentController.getVideoContent
);

/**
 * GET /api/content/videos/:videoId/:contentType
 * Get specific content type for a video
 */
router.get('/videos/:videoId/:contentType',
  authMiddleware,
  param('videoId').isInt().withMessage('Video ID must be an integer'),
  param('contentType').isLength({ min: 1 }).withMessage('Content type is required'),
  query('version').optional().isInt({ min: 1 }).withMessage('Version must be positive integer'),
  contentController.getVideoContentByType
);

/**
 * POST /api/content/videos/:videoId
 * Create new content for a video
 */
router.post('/videos/:videoId',
  authMiddleware,
  param('videoId').isInt().withMessage('Video ID must be an integer'),
  body('contentTypeKey').isLength({ min: 1 }).withMessage('Content type key is required'),
  body('contentText').optional().isLength({ min: 1 }).withMessage('Content text cannot be empty if provided'),
  body('contentUrl').optional().isURL().withMessage('Content URL must be valid URL'),
  body('aiProvider').optional().isIn(['gemini', 'chatgpt', 'claude', 'none']).withMessage('Invalid AI provider'),
  body('generationStatus').optional().isIn(['pending', 'generating', 'completed', 'failed']).withMessage('Invalid generation status'),
  body('isPublished').optional().isBoolean().withMessage('isPublished must be boolean'),
  body('contentQualityScore').optional().isFloat({ min: 0, max: 5 }).withMessage('Quality score must be 0-5'),
  contentController.createVideoContent
);

/**
 * PUT /api/content/:contentId
 * Update existing content
 */
router.put('/:contentId',
  authMiddleware,
  param('contentId').isInt().withMessage('Content ID must be an integer'),
  body('contentText').optional().isLength({ min: 1 }).withMessage('Content text cannot be empty if provided'),
  body('contentUrl').optional().isURL().withMessage('Content URL must be valid URL'),
  body('generationStatus').optional().isIn(['pending', 'generating', 'completed', 'failed']).withMessage('Invalid generation status'),
  body('isPublished').optional().isBoolean().withMessage('isPublished must be boolean'),
  body('contentQualityScore').optional().isFloat({ min: 0, max: 5 }).withMessage('Quality score must be 0-5'),
  body('userRating').optional().isInt({ min: 1, max: 5 }).withMessage('User rating must be 1-5'),
  contentController.updateVideoContent
);

/**
 * DELETE /api/content/:contentId
 * Delete content
 */
router.delete('/:contentId',
  authMiddleware,
  param('contentId').isInt().withMessage('Content ID must be an integer'),
  contentController.deleteVideoContent
);

/**
 * GET /api/content/statistics
 * Get content generation statistics
 */
router.get('/statistics',
  authMiddleware,
  query('userId').optional().isInt().withMessage('User ID must be integer'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO date'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO date'),
  contentController.getContentStatistics
);

/**
 * POST /api/content/videos/:videoId/generate
 * Trigger AI content generation for specific content types
 */
router.post('/videos/:videoId/generate',
  param('videoId').isInt().withMessage('Video ID must be an integer'),
  body('contentTypes').isArray({ min: 1 }).withMessage('Content types array is required'),
  body('contentTypes.*').isLength({ min: 1 }).withMessage('Each content type must be non-empty string'),
  body('aiProvider').optional().isIn(['gemini', 'chatgpt', 'claude']).withMessage('Invalid AI provider'),
  contentController.generateVideoContent
);

/**
 * GET /api/content/videos/:videoId/legacy
 * Get video content in legacy format (backward compatibility)
 * This endpoint helps during migration by providing content in the old format
 */
router.get('/videos/:videoId/legacy',
  param('videoId').isInt().withMessage('Video ID must be an integer'),
  contentController.getVideoContentLegacy
);

module.exports = router;
