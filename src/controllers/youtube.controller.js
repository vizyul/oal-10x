const { logger } = require('../utils');
const youtubeOAuth = require('../services/youtube-oauth.service');
const { validationResult } = require('express-validator');
const database = require('../services/database.service');
const subscriptionService = require('../services/subscription.service');

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
      logger.error('Error handling OAuth callback:', error.message);
      logger.error('Full error details:', error);
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

      let responseData = {
        connected: validation.valid,
        reason: validation.reason || null,
        refreshed: validation.refreshed || false
      };

      // If connected, also get channel information
      if (validation.valid) {
        try {
          const channels = await youtubeOAuth.getUserChannels(userId);
          responseData.channels = channels;
        } catch (channelError) {
          logger.warn('Could not load channels:', channelError.message);
          // Still return connected=true, but without channels
        }
      }

      res.json({
        success: true,
        data: responseData
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
      const { pageToken } = req.query; // Get pagination token from query params

      logger.info(`Fetching videos for playlist ${playlistId}`, { userId, pageToken });

      const result = await youtubeOAuth.getPlaylistVideos(userId, playlistId, pageToken);

      res.json({
        success: true,
        data: result // Now returns { videos, nextPageToken, totalResults }
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
      const { pageToken } = req.query; // Get pagination token from query params

      logger.info(`Fetching uploaded videos for channel ${channelId}`, { userId, pageToken });

      const result = await youtubeOAuth.getUserUploadedVideos(userId, channelId, pageToken);

      res.json({
        success: true,
        data: result // Now returns { videos, nextPageToken, totalResults }
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
      const { videoIds, contentTypes } = req.body;

      logger.info(`Importing ${videoIds.length} videos for user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
            actualUserId = user.id;
            logger.info(`Found PostgreSQL user ID ${actualUserId} for Airtable user ${userId}`);
          } else {
            logger.warn(`No PostgreSQL user found for Airtable user ${userId}`);
            // Continue with original ID, might be a direct PostgreSQL ID
          }
        } catch (userLookupError) {
          logger.error('Error looking up PostgreSQL user:', {
            error: userLookupError.message,
            stack: userLookupError.stack,
            userId
          });
          // Continue with original ID
        }
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Import video details directly using database services
      const importedVideos = [];
      const failedVideos = [];

      for (const videoId of videoIds) {
        try {
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

          logger.info(`Importing video ${videoId} for user ${actualUserId}`);

          // Check if video already exists for this user
          const existingVideos = await database.findByField('videos', 'videoid', videoId);
          if (existingVideos && existingVideos.length > 0) {
            const userVideo = existingVideos.find(video => {
              const videoData = video.fields || video;
              return videoData.users_id === actualUserId;
            });

            if (userVideo) {
              logger.warn(`Video ${videoId} already exists for user ${actualUserId}`);
              continue; // Skip this video
            }
          }

          // Try to get metadata from YouTube (if available)
          let metadata = null;
          try {
            const youtubeMetadata = require('../services/youtube-metadata.service');
            metadata = await youtubeMetadata.extractVideoMetadata(youtubeUrl);
          } catch (metadataError) {
            logger.warn(`Could not extract metadata for ${videoId}:`, metadataError.message);
          }

          // Prepare video data for PostgreSQL
          const videoData = {
            // Basic video information
            youtube_url: youtubeUrl,
            videoid: videoId,
            video_title: metadata?.title || `Imported Video ${videoId}`,
            channel_name: metadata?.channelTitle || 'YouTube Channel',
            channel_handle: metadata?.channelHandle || '',

            // Content and media
            description: metadata?.description || '',
            duration: metadata?.duration || 0,
            upload_date: metadata?.publishedAt ? new Date(metadata.publishedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, // Direct URL for PostgreSQL

            // Processing and categorization
            status: 'pending',
            category: 'Education',
            privacy_setting: 'public',

            // User association and timestamps
            users_id: actualUserId, // PostgreSQL integer foreign key
            created_at: new Date().toISOString()
          };

          // Write to PostgreSQL database
          let postgresRecord = null;
          let writeErrors = [];

          try {
            logger.info(`Writing video ${videoId} to PostgreSQL...`);
            postgresRecord = await database.create('videos', videoData);
            logger.info(`✅ Video ${videoId} created in PostgreSQL: ID ${postgresRecord.id}`);
          } catch (postgresError) {
            logger.error(`❌ Failed to create video ${videoId} in PostgreSQL:`, {
              error: postgresError.message,
              actualUserId,
              videoData: Object.keys(videoData)
            });
            writeErrors.push(`PostgreSQL: ${postgresError.message}`);
          }

          // Initialize processing status and extract transcript
          if (postgresRecord) {
            try {
              const transcriptService = require('../services/transcript.service');
              const processingStatusService = require('../services/processing-status.service');
              const recordId = postgresRecord.id;

              if (recordId) {
                // Initialize processing status with selected content types or get all types from database as fallback
                let selectedContentTypes = contentTypes && Array.isArray(contentTypes) && contentTypes.length > 0
                  ? contentTypes
                  : null;

                // If no content types selected, get all available from database
                if (!selectedContentTypes) {
                  try {
                    const database = require('../services/database.service');
                    const result = await database.query(`
                      SELECT DISTINCT content_type 
                      FROM ai_prompts 
                      WHERE is_active = true
                      ORDER BY content_type
                    `);
                    selectedContentTypes = result.rows.map(row => row.content_type);
                    logger.info(`Using all available content types from database: ${selectedContentTypes.length} types`);
                  } catch (dbError) {
                    logger.warn('Could not load content types from database, using fallback:', dbError.message);
                    selectedContentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text', 'ebook_text'];
                  }
                }

                logger.info(`Initializing processing for video ${videoId} with content types: ${selectedContentTypes.join(', ')}`);

                await processingStatusService.initializeVideoProcessingAsync(
                  videoId,
                  recordId,
                  videoData.video_title,
                  actualUserId,
                  selectedContentTypes
                );

                logger.info(`Starting transcript extraction for video ${videoId}`);

                // Process transcript asynchronously - don't wait for completion
                transcriptService.processVideoTranscript(videoId, youtubeUrl, recordId, actualUserId, selectedContentTypes)
                  .then(result => {
                    if (result.success) {
                      logger.info(`✅ Transcript successfully processed for video ${videoId}`);
                    } else {
                      logger.info(`ℹ️  Transcript not available for video ${videoId}: ${result.reason}`);
                    }
                  })
                  .catch(error => {
                    logger.warn(`⚠️  Transcript processing failed for video ${videoId}:`, error.message);
                  });
              }
            } catch (transcriptError) {
              logger.warn(`Error initiating transcript extraction for video ${videoId}:`, transcriptError.message);
            }
          }

          // Record results
          if (postgresRecord) {
            // Database write succeeded - increment subscription usage
            try {
              await subscriptionService.incrementUsage(actualUserId, 'videos', 1);
              logger.info(`✅ Incremented video usage for user ${actualUserId}`);
            } catch (usageError) {
              logger.warn(`⚠️  Failed to increment video usage for user ${actualUserId}:`, usageError.message);
            }

            const video = this.formatPostgresVideoResponse(postgresRecord);

            importedVideos.push({
              ...video,
              warnings: writeErrors.length > 0 ? writeErrors : undefined
            });
          } else {
            // Database write failed
            failedVideos.push({
              videoId,
              errors: writeErrors
            });
          }

        } catch (videoError) {
          logger.error(`Error importing video ${videoId}:`, videoError);
          failedVideos.push({
            videoId,
            errors: [videoError.message]
          });
        }
      }

      // Prepare response
      const response = {
        success: true,
        message: `Successfully imported ${importedVideos.length} of ${videoIds.length} videos`,
        data: {
          imported: importedVideos.length,
          failed: failedVideos.length,
          total: videoIds.length,
          videos: importedVideos
        }
      };

      if (failedVideos.length > 0) {
        response.warnings = `${failedVideos.length} videos failed to import`;
        response.failedVideos = failedVideos;
      }

      res.json(response);
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
   * Format PostgreSQL video record for API response
   * @param {Object} record - PostgreSQL record from database service
   * @returns {Object} Formatted video object
   */
  formatPostgresVideoResponse(record) {
    // Handle both database service formatted records and direct PostgreSQL rows
    const recordData = record.fields || record;
    const video = {
      id: recordData.id,
      ...recordData,
      created_at: record.createdTime || recordData.created_at
    };

    // Format duration to human readable
    if (video.duration && typeof video.duration === 'number') {
      video.duration_formatted = this.formatDuration(video.duration);
    }

    return video;
  }

  /**
   * Format video response for PostgreSQL records
   * @param {Object} record - PostgreSQL record from database service
   * @returns {Object} Formatted video object
   */
  formatVideoResponse(record) {
    try {
      // Handle both database service formatted records and direct PostgreSQL rows
      const recordData = record.fields || record;
      if (!recordData) {
        return {
          id: record?.id || 'unknown',
          video_title: 'Unknown Video',
          status: 'error',
          created_at: new Date().toISOString()
        };
      }

      const video = {
        id: recordData.id,
        ...recordData,
        created_at: record.createdTime || recordData.created_at
      };

      // Format duration to human readable
      if (video.duration && typeof video.duration === 'number') {
        video.duration_formatted = this.formatDuration(video.duration);
      }

      return video;
    } catch (error) {
      logger.error('Error in formatVideoResponse:', error);
      const recordData = record?.fields || record;
      return {
        id: recordData?.id || 'unknown',
        video_title: recordData?.video_title || 'Unknown Video',
        status: 'error',
        created_at: record?.createdTime || recordData?.created_at || new Date().toISOString()
      };
    }
  }

  /**
   * Format duration from seconds to human readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration (e.g., "4:13", "1:02:30")
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
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
