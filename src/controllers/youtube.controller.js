const { logger } = require('../utils');
const youtubeOAuth = require('../services/youtube-oauth.service');
const { validationResult } = require('express-validator');
const airtable = require('../services/airtable.service');
const databaseService = require('../services/database.service');

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

      const airtableUserId = req.user.id; // This is the Airtable record ID
      const { videoIds } = req.body;

      logger.info(`Importing ${videoIds.length} videos for user ${airtableUserId}`);

      // Get the PostgreSQL user ID for this Airtable user
      let postgresUserId = null;
      try {
        const userResult = await databaseService.findByField('users', 'airtable_id', airtableUserId);
        if (userResult && userResult.length > 0) {
          postgresUserId = userResult[0].fields.id;
          logger.info(`Found PostgreSQL user ID ${postgresUserId} for Airtable user ${airtableUserId}`);
        } else {
          logger.warn(`No PostgreSQL user found for Airtable user ${airtableUserId}`);
        }
      } catch (userLookupError) {
        logger.error('Error looking up PostgreSQL user:', {
          error: userLookupError.message,
          stack: userLookupError.stack,
          airtableUserId
        });
      }

      // Import video details directly using database services
      const importedVideos = [];
      const failedVideos = [];

      for (const videoId of videoIds) {
        try {
          const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
          
          logger.info(`Importing video ${videoId} for user ${airtableUserId}`);

          // Check if video already exists in Airtable for this user
          const existingVideos = await airtable.findByField('Videos', 'videoid', videoId);
          if (existingVideos && existingVideos.length > 0) {
            const userVideo = existingVideos.find(video => 
              video.fields.user_id && video.fields.user_id[0] === airtableUserId
            );
            
            if (userVideo) {
              logger.warn(`Video ${videoId} already exists for user ${airtableUserId}`);
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

          // Prepare video data for Airtable (capture maximum data available)
          const videoData = {
            // Basic video information
            youtube_url: youtubeUrl,
            videoid: videoId,
            video_title: metadata?.title || `Imported Video ${videoId}`,
            channel_name: metadata?.channelTitle || 'YouTube Channel',
            chanel_handle: metadata?.channelHandle || '',
            
            // Content and media
            description: metadata?.description || '',
            duration: metadata?.duration || 0,
            upload_date: metadata?.publishedAt ? new Date(metadata.publishedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], // YYYY-MM-DD format
            thumbnail: [{
              url: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, // 1280x720 resolution
              filename: `${videoId}_thumbnail_1280x720.jpg`
            }], // Airtable attachment format
            
            // Processing and categorization
            status: 'pending',
            category: 'Education',
            privacy_setting: 'public',
            
            // User association
            user_id: [airtableUserId] // Airtable link format
          };

          // === DUAL WRITE: Write to both databases ===
          let airtableRecord = null;
          let postgresRecord = null;
          let writeErrors = [];

          // 1. Write to Airtable
          try {
            logger.info(`Writing video ${videoId} to Airtable...`);
            airtableRecord = await airtable.create('Videos', videoData);
            logger.info(`✅ Video ${videoId} created in Airtable: ${airtableRecord.id}`);
          } catch (airtableError) {
            logger.error(`❌ Failed to create video ${videoId} in Airtable:`, airtableError);
            writeErrors.push(`Airtable: ${airtableError.message}`);
          }

          // 2. Write to PostgreSQL (only if we have a PostgreSQL user ID)
          if (postgresUserId) {
            try {
              logger.info(`Writing video ${videoId} to PostgreSQL...`);
              
              // Prepare PostgreSQL data (different field mappings)
              const postgresVideoData = {
                youtube_url: youtubeUrl,
                videoid: videoId,
                video_title: metadata?.title || `Imported Video ${videoId}`,
                channel_name: metadata?.channelTitle || 'YouTube Channel',
                chanel_handle: metadata?.channelHandle || '',
                description: metadata?.description || '',
                thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`, // 1280x720 resolution
                users_id: postgresUserId, // PostgreSQL integer user ID
                status: 'pending',
                created_at: new Date().toISOString(),
                airtable_id: airtableRecord?.id || null
              };

            // Add optional fields (these exist in PostgreSQL schema)
            if (metadata?.duration) postgresVideoData.duration = metadata.duration;
            if (metadata?.publishedAt) postgresVideoData.published_at = new Date(metadata.publishedAt).toISOString();
            postgresVideoData.category = 'Education'; // Default category
            postgresVideoData.privacy_setting = 'public'; // Default privacy setting
            
            postgresRecord = await databaseService.create('videos', postgresVideoData);
            logger.info(`✅ Video ${videoId} created in PostgreSQL: ID ${postgresRecord.id}`);
            
            } catch (postgresError) {
              logger.error(`❌ Failed to create video ${videoId} in PostgreSQL:`, {
                error: postgresError.message,
                postgresUserId,
                videoData: Object.keys(postgresVideoData)
              });
              writeErrors.push(`PostgreSQL: ${postgresError.message}`);
            }
          } else {
            logger.warn(`Skipping PostgreSQL write for video ${videoId} - no PostgreSQL user ID found (airtableUserId: ${airtableUserId})`);
            writeErrors.push(`PostgreSQL: No user mapping found`);
          }

          // 3. Initialize processing status and extract transcript
          if (airtableRecord || postgresRecord) {
            try {
              const transcriptService = require('../services/transcript.service');
              const processingStatusService = require('../services/processing-status.service');
              const recordId = airtableRecord?.id;
              const userId = req.user.id;
              
              if (recordId) {
                // Initialize processing status
                const contentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text'];
                processingStatusService.initializeVideoProcessing(
                  videoId, 
                  recordId, 
                  metadata?.title || 'Untitled Video',
                  userId,
                  contentTypes
                );
                
                logger.info(`Starting transcript extraction for video ${videoId}`);
                
                // Process transcript asynchronously - don't wait for completion
                transcriptService.processVideoTranscript(videoId, youtubeUrl, recordId, userId)
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

          // 4. Record results
          if (airtableRecord || postgresRecord) {
            // At least one database succeeded
            const video = airtableRecord ? 
              this.formatVideoResponse(airtableRecord) :
              this.formatPostgresVideoResponse(postgresRecord);
            
            importedVideos.push({
              ...video,
              warnings: writeErrors.length > 0 ? writeErrors : undefined
            });
          } else {
            // Both databases failed
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
    const video = {
      id: record.id,
      ...record.fields,
      created_at: record.createdTime || record.fields.created_at
    };

    // Format duration to human readable
    if (video.duration && typeof video.duration === 'number') {
      video.duration_formatted = this.formatDuration(video.duration);
    }

    return video;
  }

  /**
   * Format video response (matching videos controller)
   * @param {Object} record - Airtable record
   * @returns {Object} Formatted video object
   */
  formatVideoResponse(record) {
    try {
      if (!record || !record.fields) {
        return {
          id: record?.id || 'unknown',
          video_title: 'Unknown Video',
          status: 'error',
          created_at: new Date().toISOString()
        };
      }

      const video = {
        id: record.id,
        ...record.fields,
        created_at: record.createdTime
      };

      // Format duration to human readable
      if (video.duration && typeof video.duration === 'number') {
        video.duration_formatted = this.formatDuration(video.duration);
      }

      return video;
    } catch (error) {
      logger.error('Error in formatVideoResponse:', error);
      return {
        id: record?.id || 'unknown',
        video_title: record?.fields?.video_title || 'Unknown Video',
        status: 'error',
        created_at: record?.createdTime || new Date().toISOString()
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