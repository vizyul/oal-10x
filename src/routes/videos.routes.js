const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const videosController = require('../controllers/videos.controller');
const { authMiddleware, subscriptionMiddleware } = require('../middleware');

// Apply authentication middleware to all video routes
router.use(authMiddleware);

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
      .matches(/^rec[a-zA-Z0-9]{14}$/)
      .withMessage('Invalid record ID format')
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

module.exports = router;
