const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const videosController = require('../controllers/videos.controller');
const { authMiddleware, subscriptionMiddleware } = require('../middleware');

// Helper function to get available content types for validation
let contentTypesCache = null;
let cacheExpiry = null;

async function getAvailableContentTypes() {
  const now = Date.now();
  if (contentTypesCache && cacheExpiry && now < cacheExpiry) {
    return contentTypesCache;
  }

  try {
    // Use the ContentType model as the single source of truth
    const { contentType } = require('../models');
    const availableTypes = await contentType.getActive();

    contentTypesCache = availableTypes.map(type => type.key);
    cacheExpiry = now + (5 * 60 * 1000); // Cache for 5 minutes
    return contentTypesCache;
  } catch (error) {
    console.error('Error loading content types from ContentType model:', error);
    // If ContentType model fails, try aiPrompts as fallback
    try {
      const { aiPrompts } = require('../models');
      const availableTypes = await aiPrompts.getAvailableContentTypes();
      contentTypesCache = availableTypes.map(type => type.type);
      cacheExpiry = now + (1 * 60 * 1000); // Short cache for fallback
      return contentTypesCache;
    } catch (fallbackError) {
      console.error('Error loading content types from aiPrompts fallback:', fallbackError);
      // Return empty array to prevent validation errors - let the application handle gracefully
      return [];
    }
  }
}

// Apply authentication middleware to all video routes
router.use(authMiddleware);

// Debug endpoint to check user authentication
router.get('/debug-user', videosController.debugUser.bind(videosController));

// Video validation rules
const videoValidation = {
  create: [
    body('youtube_url')
      .isURL()
      .withMessage('Valid YouTube URL is required')
      .matches(/(?:youtube\.com|youtu\.be)/)
      .withMessage('URL must be from YouTube'),
    body('video_title')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Video title must be between 1-200 characters'),
    body('channel_name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Channel name must be between 1-100 characters')
  ],

  update: [
    body('video_title')
      .optional()
      .isLength({ min: 1, max: 200 })
      .withMessage('Video title must be between 1-200 characters'),
    body('channel_name')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Channel name must be between 1-100 characters'),
    body('youtube_url')
      .optional()
      .isURL()
      .withMessage('Valid YouTube URL is required')
      .matches(/(?:youtube\.com|youtu\.be)/)
      .withMessage('URL must be from YouTube')
  ],

  params: [
    param('id')
      .custom((value) => {
        // Accept PostgreSQL integer IDs, Airtable record IDs, and YouTube video IDs
        if (/^\d+$/.test(value) || /^rec[a-zA-Z0-9]{14}$/.test(value) || /^[a-zA-Z0-9_-]{11}$/.test(value)) {
          return true;
        }
        throw new Error('Invalid ID format - must be integer, Airtable record ID, or YouTube video ID');
      })
  ],

  query: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1-100'),
    query('status')
      .optional()
      .isIn(['pending', 'processing', 'completed', 'error'])
      .withMessage('Invalid status value'),
    query('search')
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage('Search term must be between 1-100 characters')
  ]
};

// Routes

/**
 * @route   GET /api/videos
 * @desc    Get all videos for the authenticated user
 * @access  Private
 */
router.get('/',
  videoValidation.query,
  videosController.getVideos.bind(videosController)
);

/**
 * @route   GET /videos/content-types
 * @desc    Get available content types from ai_prompts table
 * @access  Private
 */
router.get('/content-types',
  videosController.getAvailableContentTypes.bind(videosController)
);

/**
 * @route   GET /api/videos/:id
 * @desc    Get a specific video by ID
 * @access  Private
 */
router.get('/:id',
  videoValidation.params,
  videosController.getVideo.bind(videosController)
);

/**
 * @route   POST /api/videos
 * @desc    Create a new video entry
 * @access  Private - Requires Basic subscription
 */
router.post('/',
  subscriptionMiddleware.requireSubscription('basic'),
  subscriptionMiddleware.checkUsageLimit('videos'),
  videoValidation.create,
  videosController.createVideo.bind(videosController),
  subscriptionMiddleware.incrementUsage
);

/**
 * @route   PUT /api/videos/:id
 * @desc    Update a video
 * @access  Private
 */
router.put('/:id',
  videoValidation.params,
  videoValidation.update,
  videosController.updateVideo.bind(videosController)
);

/**
 * @route   DELETE /api/videos/:id
 * @desc    Delete a video
 * @access  Private
 */
router.delete('/:id',
  videoValidation.params,
  videosController.deleteVideo.bind(videosController)
);

/**
 * @route   GET /api/videos/:id/status
 * @desc    Get video processing status
 * @access  Private
 */
router.get('/:id/status',
  videoValidation.params,
  videosController.getVideoStatus.bind(videosController)
);

/**
 * @route   POST /api/videos/:id/process
 * @desc    Trigger video processing
 * @access  Private - Requires Basic subscription
 */
router.post('/:id/process',
  subscriptionMiddleware.requireSubscription('basic'),
  videoValidation.params,
  videosController.processVideo.bind(videosController)
);

/**
 * @route   POST /api/videos/:id/retry
 * @desc    Retry failed video processing
 * @access  Private
 */
router.post('/:id/retry',
  videoValidation.params,
  videosController.retryProcessing.bind(videosController)
);

/**
 * @route   POST /api/videos/:id/cancel
 * @desc    Cancel video processing
 * @access  Private
 */
router.post('/:id/cancel',
  videoValidation.params,
  videosController.cancelProcessing.bind(videosController)
);

/**
 * @route   GET /api/videos/:id/content/:contentType
 * @desc    Get generated content for a video
 * @access  Private
 */
router.get('/:id/content/:contentType',
  videoValidation.params,
  param('contentType')
    .custom(async (value) => {
      const availableTypes = await getAvailableContentTypes();
      // Allow 'transcript' as an alias for 'transcript_text' for backward compatibility
      const isValidType = availableTypes.includes(value) ||
                         (value === 'transcript' && availableTypes.includes('transcript_text'));
      if (!isValidType) {
        throw new Error(`Invalid content type. Available types: ${availableTypes.join(', ')}, transcript`);
      }
      return true;
    }),
  videosController.getVideoContent.bind(videosController)
);

/**
 * @route   POST /api/videos/batch
 * @desc    Process multiple video URLs
 * @access  Private - Requires Basic subscription
 */
router.post('/batch',
  subscriptionMiddleware.requireSubscription('basic'),
  subscriptionMiddleware.checkUsageLimit('videos'),
  [
    body('urls')
      .isArray()
      .withMessage('URLs must be an array')
      .custom((urls) => {
        if (urls.length === 0) {
          throw new Error('At least one URL is required');
        }
        // Validate each URL
        for (const url of urls) {
          if (typeof url !== 'string' || !url.match(/(?:youtube\.com|youtu\.be)/)) {
            throw new Error('All URLs must be valid YouTube URLs');
          }
        }
        return true;
      }),
    body('contentTypes')
      .optional()
      .isArray()
      .withMessage('Content types must be an array')
      .custom(async (contentTypes) => {
        if (contentTypes && contentTypes.length > 0) {
          const validTypes = await getAvailableContentTypes();
          for (const type of contentTypes) {
            if (!validTypes.includes(type)) {
              throw new Error(`Invalid content type: ${type}. Available types: ${validTypes.join(', ')}`);
            }
          }
        }
        return true;
      })
  ],
  videosController.processBatch.bind(videosController),
  subscriptionMiddleware.incrementUsage
);

module.exports = router;
