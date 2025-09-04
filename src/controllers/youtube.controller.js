const { logger } = require('../utils');
const youtubeOAuth = require('../services/youtube-oauth.service');
const { validationResult } = require('express-validator');

class YouTubeController {
  /**
   * Initiate YouTube OAuth flow
   * GET /api/youtube/auth
   */
  async initiateAuth(req, res) {
    try {
      const userId = req.user.id;
      const { redirect_uri } = req.query;

      logger.info(`Initiating YouTube OAuth for user ${userId}`);

      const { authUrl, state } = await youtubeOAuth.initiateOAuth(userId, redirect_uri);

      res.json({
        success: true,
        data: {
          authUrl,
          state
        }
      });
    } catch (error) {
      logger.error('Error initiating YouTube OAuth:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate YouTube authentication',
        error: error.message
      });
    }
  }

  /**
   * Handle YouTube OAuth callback
   * GET /api/youtube/auth/callback
   */
  async handleAuthCallback(req, res) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('OAuth error:', oauthError);
        return res.redirect('/videos/upload?error=oauth_denied');
      }

      if (!code || !state) {
        logger.error('Missing code or state in OAuth callback');
        return res.redirect('/videos/upload?error=oauth_invalid');
      }

      const result = await youtubeOAuth.handleOAuthCallback(code, state);

      if (result.success) {
        logger.info('YouTube OAuth completed successfully', { 
          channelName: result.channel.name 
        });
        return res.redirect('/videos/upload?success=connected');
      } else {
        return res.redirect('/videos/upload?error=oauth_failed');
      }
    } catch (error) {
      logger.error('Error handling OAuth callback:', error);
      return res.redirect('/videos/upload?error=oauth_error');
    }
  }

  /**
   * Disconnect YouTube account
   * POST /api/youtube/auth/disconnect
   */
  async disconnectAccount(req, res) {
    try {
      const userId = req.user.id;

      logger.info(`Disconnecting YouTube account for user ${userId}`);

      await youtubeOAuth.revokeAccess(userId);

      res.json({
        success: true,
        message: 'YouTube account disconnected successfully'
      });
    } catch (error) {
      logger.error('Error disconnecting YouTube account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect YouTube account',
        error: error.message
      });
    }
  }

  /**
   * Check YouTube connection status
   * GET /api/youtube/auth/status
   */
  async getAuthStatus(req, res) {
    try {
      const userId = req.user.id;

      const validation = await youtubeOAuth.validateTokens(userId);

      res.json({
        success: true,
        data: {
          connected: validation.valid,
          reason: validation.reason || null,
          refreshed: validation.refreshed || false
        }
      });
    } catch (error) {
      logger.error('Error checking auth status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check authentication status',
        error: error.message
      });
    }
  }

  /**
   * Get user's YouTube channels
   * GET /api/youtube/channels
   */
  async getChannels(req, res) {
    try {
      const userId = req.user.id;

      logger.info(`Fetching YouTube channels for user ${userId}`);

      const channels = await youtubeOAuth.getUserChannels(userId);

      res.json({
        success: true,
        data: { channels }
      });
    } catch (error) {
      logger.error('Error fetching channels:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch YouTube channels',
        error: error.message
      });
    }
  }

  /**
   * Get playlists for a channel
   * GET /api/youtube/channels/:channelId/playlists
   */
  async getChannelPlaylists(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { channelId } = req.params;

      logger.info(`Fetching playlists for channel ${channelId}`, { userId });

      const playlists = await youtubeOAuth.getChannelPlaylists(userId, channelId);

      res.json({
        success: true,
        data: { playlists }
      });
    } catch (error) {
      logger.error('Error fetching channel playlists:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch channel playlists',
        error: error.message
      });
    }
  }

  /**
   * Get videos from a playlist
   * GET /api/youtube/playlists/:playlistId/videos
   */
  async getPlaylistVideos(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { playlistId } = req.params;

      logger.info(`Fetching videos for playlist ${playlistId}`, { userId });

      const videos = await youtubeOAuth.getPlaylistVideos(userId, playlistId);

      res.json({
        success: true,
        data: { videos }
      });
    } catch (error) {
      logger.error('Error fetching playlist videos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch playlist videos',
        error: error.message
      });
    }
  }

  /**
   * Get uploaded videos for a channel
   * GET /api/youtube/channels/:channelId/videos
   */
  async getChannelVideos(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { channelId } = req.params;

      logger.info(`Fetching uploaded videos for channel ${channelId}`, { userId });

      const videos = await youtubeOAuth.getUserUploadedVideos(userId, channelId);

      res.json({
        success: true,
        data: { videos }
      });
    } catch (error) {
      logger.error('Error fetching channel videos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch channel videos',
        error: error.message
      });
    }
  }

  /**
   * Import selected videos for processing
   * POST /api/youtube/videos/import
   */
  async importVideos(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const userId = req.user.id;
      const { videoIds } = req.body;

      logger.info(`Importing ${videoIds.length} videos for user ${userId}`);

      // Get video details and create records in Videos table
      const importedVideos = [];
      const videosController = require('./videos.controller');

      for (const videoId of videoIds) {
        try {
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          // Create video record
          const mockRequest = {
            user: { id: userId },
            body: {
              youtube_url: youtubeUrl,
              video_title: `Imported Video ${videoId}`,
              channel_name: 'YouTube Channel'
            }
          };

          const mockResponse = {
            status: (code) => mockResponse,
            json: (data) => {
              if (data.success) {
                importedVideos.push(data.data.video);
              }
              return mockResponse;
            }
          };

          await videosController.createVideo(mockRequest, mockResponse);
        } catch (videoError) {
          logger.error(`Error importing video ${videoId}:`, videoError);
        }
      }

      res.json({
        success: true,
        message: `Successfully imported ${importedVideos.length} videos`,
        data: {
          imported: importedVideos.length,
          total: videoIds.length,
          videos: importedVideos
        }
      });
    } catch (error) {
      logger.error('Error importing videos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to import videos',
        error: error.message
      });
    }
  }

  /**
   * Sync channel data
   * PUT /api/youtube/channels/:channelId/sync
   */
  async syncChannelData(req, res) {
    try {
      const userId = req.user.id;
      const { channelId } = req.params;

      logger.info(`Syncing channel data for ${channelId}`, { userId });

      // Get fresh channel data from YouTube
      const channels = await youtubeOAuth.getUserChannels(userId);
      const channel = channels.find(ch => ch.id === channelId);

      if (!channel) {
        return res.status(404).json({
          success: false,
          message: 'Channel not found'
        });
      }

      // Update channel data in database would go here
      // For now, just return the fresh data

      res.json({
        success: true,
        message: 'Channel data synced successfully',
        data: { channel }
      });
    } catch (error) {
      logger.error('Error syncing channel data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync channel data',
        error: error.message
      });
    }
  }

  /**
   * Get channel analytics (placeholder)
   * GET /api/youtube/channels/:channelId/analytics
   */
  async getChannelAnalytics(req, res) {
    try {
      const { channelId } = req.params;

      // Placeholder for YouTube Analytics API integration
      const analytics = {
        channelId,
        views: 0,
        subscribers: 0,
        videos: 0,
        estimatedRevenue: 0,
        averageViewDuration: 0,
        topVideos: []
      };

      res.json({
        success: true,
        data: { analytics }
      });
    } catch (error) {
      logger.error('Error fetching channel analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch channel analytics',
        error: error.message
      });
    }
  }
}

module.exports = new YouTubeController();