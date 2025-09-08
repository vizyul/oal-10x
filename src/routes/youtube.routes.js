const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();
const youtubeController = require('../controllers/youtube.controller');
const { authMiddleware } = require('../middleware');

// Apply authentication middleware to all YouTube routes
router.use(authMiddleware);

// Validation rules
const youtubeValidation = {
  channelId: [
    param('channelId')
      .matches(/^UC[a-zA-Z0-9_-]{22}$/)
      .withMessage('Invalid YouTube channel ID format')
  ],

  playlistId: [
    param('playlistId')
      .matches(/^[a-zA-Z0-9_-]+$/)
      .withMessage('Invalid YouTube playlist ID format')
  ],

  videoImport: [
    body('videoIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('Video IDs must be an array with 1-50 items'),
    body('videoIds.*')
      .matches(/^[a-zA-Z0-9_-]{11}$/)
      .withMessage('Invalid YouTube video ID format')
  ],

  redirectUri: [
    query('redirect_uri')
      .optional()
      .isURL()
      .withMessage('Redirect URI must be a valid URL')
  ]
};

// OAuth Routes

/**
 * @route   GET /api/youtube/auth
 * @desc    Initiate YouTube OAuth flow
 * @access  Private
 */
router.get('/auth',
  youtubeValidation.redirectUri,
  youtubeController.initiateAuth
);

/**
 * @route   GET /api/youtube/auth/callback
 * @desc    Handle YouTube OAuth callback
 * @access  Public (but validates state internally)
 */
router.get('/auth/callback',
  youtubeController.handleAuthCallback
);

/**
 * @route   POST /api/youtube/auth/disconnect
 * @desc    Disconnect YouTube account
 * @access  Private
 */
router.post('/auth/disconnect',
  youtubeController.disconnectAccount
);

/**
 * @route   GET /api/youtube/auth/status
 * @desc    Check YouTube connection status
 * @access  Private
 */
router.get('/auth/status',
  youtubeController.getAuthStatus
);

// Channel Management Routes

/**
 * @route   GET /api/youtube/channels
 * @desc    Get user's YouTube channels
 * @access  Private
 */
router.get('/channels',
  youtubeController.getChannels
);

/**
 * @route   GET /api/youtube/channels/:channelId/playlists
 * @desc    Get playlists for a channel
 * @access  Private
 */
router.get('/channels/:channelId/playlists',
  youtubeValidation.channelId,
  youtubeController.getChannelPlaylists
);

/**
 * @route   GET /api/youtube/channels/:channelId/videos
 * @desc    Get uploaded videos for a channel
 * @access  Private
 */
router.get('/channels/:channelId/videos',
  youtubeValidation.channelId,
  youtubeController.getChannelVideos
);

/**
 * @route   PUT /api/youtube/channels/:channelId/sync
 * @desc    Sync channel data
 * @access  Private
 */
router.put('/channels/:channelId/sync',
  youtubeValidation.channelId,
  youtubeController.syncChannelData
);

/**
 * @route   GET /api/youtube/channels/:channelId/analytics
 * @desc    Get channel analytics
 * @access  Private
 */
router.get('/channels/:channelId/analytics',
  youtubeValidation.channelId,
  youtubeController.getChannelAnalytics
);

// Playlist Routes

/**
 * @route   GET /api/youtube/playlists/:playlistId/videos
 * @desc    Get videos from a playlist
 * @access  Private
 */
router.get('/playlists/:playlistId/videos',
  youtubeValidation.playlistId,
  youtubeController.getPlaylistVideos
);

// Video Import Routes

/**
 * @route   POST /api/youtube/videos/import
 * @desc    Import selected videos for processing
 * @access  Private
 */
router.post('/videos/import',
  youtubeValidation.videoImport,
  youtubeController.importVideos
);

module.exports = router;
