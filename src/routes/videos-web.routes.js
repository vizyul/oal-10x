const express = require('express');
const router = express.Router();
const { authMiddleware, subscriptionMiddleware } = require('../middleware');

// Apply authentication middleware to all video web routes
router.use(authMiddleware);

// Add subscription info to all video routes for frontend use
router.use(subscriptionMiddleware.addSubscriptionInfo);

/**
 * @route   GET /videos
 * @desc    Video dashboard page
 * @access  Private
 */
router.get('/', (req, res) => {
  res.render('videos/dashboard', {
    title: 'Video Dashboard - AmplifyContent.ai',
    description: 'Manage your video content and AI-generated insights',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/videos.css', '/css/thumbnail-studio.css'],
    additionalJS: ['/js/videos.js']
  });
});

/**
 * @route   GET /videos/socket-token
 * @desc    Get temporary token for Socket.IO connection
 * @access  Private
 */
router.get('/socket-token', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Return the existing token from httpOnly cookie
  const token = req.cookies?.auth_token;
  if (!token) {
    return res.status(401).json({ error: 'No auth token found' });
  }

  res.json({ token });
});

/**
 * @route   GET /videos/upload
 * @desc    Video upload page
 * @access  Private - Requires Basic subscription and available video slots
 */
router.get('/upload',
  subscriptionMiddleware.requireSubscription('free'),
  (req, res) => {
    // Check if user has remaining video capacity
    if (req.subscriptionInfo && req.subscriptionInfo.remainingVideos <= 0) {
      // Redirect to upgrade page with specific message for exhausted limits
      const tierMessage = req.subscriptionInfo.tier === 'free'
        ? 'You have used your free video limit'
        : 'You have reached your video import limit';
      return res.redirect(`/subscription/upgrade?reason=video_limit&message=${encodeURIComponent(tierMessage)}`);
    }

    res.render('videos/upload', {
      title: 'Upload Video - AmplifyContent.ai',
      description: 'Add videos by URL or connect your YouTube account',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      additionalCSS: ['/css/videos.css'],
      additionalJS: ['/js/videos.js'],
      // Pass URL parameters for success/error messages
      success: req.query.success,
      error: req.query.error
    });
  }
);


/**
 * @route   GET /videos/browse
 * @desc    YouTube video browser page
 * @access  Private
 */
router.get('/browse', (req, res) => {
  res.render('videos/browse', {
    title: 'Browse YouTube Videos - AmplifyContent.ai',
    description: 'Browse and import videos from your YouTube channels',
    user: req.user,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/videos.css'],
    additionalJS: ['/js/videos.js']
  });
});

/**
 * @route   GET /videos/channels
 * @desc    YouTube channel management page
 * @access  Private
 */
router.get('/channels', (req, res) => {
  res.render('videos/channels', {
    title: 'YouTube Channels - AmplifyContent.ai',
    description: 'Manage your connected YouTube channels',
    user: req.user,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/videos.css'],
    additionalJS: ['/js/videos.js']
  });
});

/**
 * @route   GET /videos/analytics
 * @desc    Video analytics dashboard
 * @access  Private - Requires Premium subscription
 */
router.get('/analytics',
  subscriptionMiddleware.requireFeature('analytics'),
  (req, res) => {
    res.render('videos/analytics', {
      title: 'Video Analytics - AmplifyContent.ai',
      description: 'View insights and performance metrics for your videos',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      additionalCSS: ['/css/videos.css', '/css/charts.css'],
      additionalJS: ['/js/videos.js', '/js/charts.js']
    });
  }
);

/**
 * @route   GET /videos/content-types
 * @desc    Get available content types from ai_prompts table (API endpoint accessible from web routes)
 * @access  Private
 */
router.get('/content-types', async (req, res) => {
  try {
    const videosController = require('../controllers/videos.controller');
    // Call the controller method directly
    await videosController.getAvailableContentTypes(req, res);
  } catch (error) {
    console.error('Content types error:', error);
    res.status(500).json({ error: 'Failed to fetch content types' });
  }
});

/**
 * @route   GET /videos/:id
 * @desc    Individual video details page
 * @access  Private
 */
router.get('/:id', (req, res) => {
  const videoId = req.params.id;

  res.render('videos/details', {
    title: 'Video Details - AmplifyContent.ai',
    description: 'View and edit video details and AI-generated content',
    user: req.user,
    videoId: videoId,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/videos.css'],
    additionalJS: ['/js/videos.js', '/js/video-player.js']
  });
});

/**
 * @route   GET /videos/:id/edit
 * @desc    Edit video page
 * @access  Private
 */
router.get('/:id/edit', (req, res) => {
  const videoId = req.params.id;

  res.render('videos/edit', {
    title: 'Edit Video - AmplifyContent.ai',
    description: 'Edit video information and AI-generated content',
    user: req.user,
    videoId: videoId,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/videos.css', '/css/forms.css'],
    additionalJS: ['/js/videos.js', '/js/video-editor.js']
  });
});

module.exports = router;
