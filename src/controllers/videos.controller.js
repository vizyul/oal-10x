const { logger } = require('../utils');
const { video, user: userModel, aiPrompts } = require('../models');
const { validationResult } = require('express-validator');
const database = require('../services/database.service');

class VideosController {
  /**
   * Resolve user ID (handle both PostgreSQL and Airtable IDs)
   * @param {string|number} userId - User ID from request
   * @returns {Promise<number>} PostgreSQL user ID
   */
  async resolveUserId(userId) {
    // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
    let actualUserId = userId;
    if (typeof userId === 'string' && userId.startsWith('rec')) {
      // This is an Airtable record ID, try to find the PostgreSQL user
      try {
        const user = await userModel.findByAirtableId(userId);
        if (user) {
          actualUserId = user.id;
          logger.info(`Found PostgreSQL user ID ${actualUserId} for Airtable user ${userId}`);
        } else {
          logger.warn(`No PostgreSQL user found for Airtable user ${userId}`);
        }
      } catch (userLookupError) {
        logger.error('Error looking up PostgreSQL user:', userLookupError);
      }
    } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
      // This is already a PostgreSQL integer ID
      actualUserId = parseInt(userId);
    }
    return actualUserId;
  }

  /**
   * Get all videos for the authenticated user
   * GET /api/videos
   */
  async getVideos(req, res) {
    try {
      logger.info('=== Starting getVideos method ===');
      const { page = 1, limit = 10, status, search, category } = req.query;
      const userId = req.user.id;

      logger.info(`Fetching videos for user ${userId}`, { page, limit, status, search, category });

      const actualUserId = await this.resolveUserId(userId);

      // Use Video model for paginated results with content
      const result = await video.getVideosByUser(actualUserId, {
        page,
        limit,
        status,
        search,
        category,
        includeContent: true  // Include content from video_content table
      });

      logger.info(`Found ${result.videos.length} videos for user ${actualUserId}`);

      // Format videos for API response
      const formattedVideos = result.videos.map((videoRecord) => {
        try {
          return video.formatVideoResponse(videoRecord);
        } catch (formatError) {
          logger.error(`Error formatting video record ${videoRecord.id}:`, formatError.message);

          // Return basic video object if formatting fails
          return {
            id: videoRecord.id,
            video_title: videoRecord.video_title || 'Untitled Video',
            channel_name: videoRecord.channel_name || 'Unknown Channel',
            status: videoRecord.status || 'completed',
            created_at: videoRecord.created_at || new Date().toISOString(),
            ...videoRecord
          };
        }
      });

      logger.info(`Successfully formatted ${formattedVideos.length} videos for response`);

      res.json({
        success: true,
        data: {
          videos: formattedVideos,
          pagination: result.pagination
        }
      });

    } catch (error) {
      logger.error('=== ERROR in getVideos method ===');
      logger.error('Error fetching videos:', error);
      logger.error('Error stack:', error.stack);

      // More detailed error information
      const errorResponse = {
        success: false,
        message: 'Failed to fetch videos',
        error: error.message || 'Unknown error'
      };

      try {
        res.status(500).json(errorResponse);
      } catch (responseError) {
        logger.error('Failed to send error response:', responseError);
      }
    }
  }

  /**
   * Get a specific video by ID
   * GET /api/videos/:id
   */
  async getVideo(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Fetching video ${id} for user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Use Video model to get video with user ownership validation
      const record = await video.getVideoByIdAndUser(id, actualUserId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const formattedVideo = video.formatVideoResponse(record);

      res.json({
        success: true,
        data: { video: formattedVideo }
      });

    } catch (error) {
      logger.error('Error fetching video:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch video',
        error: error.message
      });
    }
  }

  /**
   * Create a new video entry
   * POST /api/videos
   */
  async createVideo(req, res) {
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
      const {
        youtube_url,
        video_title,
        channel_name,
        description,
        category,
        tags,
        privacy_setting
      } = req.body;

      logger.info(`Creating new video for user ${userId}`, { youtube_url, video_title });

      // Extract video ID from YouTube URL
      const videoId = this.extractVideoId(youtube_url);
      if (!videoId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid YouTube URL'
        });
      }

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Check if video already exists for this user
      const existingVideos = await video.findAllByVideoId(videoId);
      if (existingVideos && existingVideos.length > 0) {
        // Check if any belong to current user
        const userVideo = existingVideos.find(videoRecord => {
          return videoRecord.users_id === actualUserId;
        });

        if (userVideo) {
          return res.status(409).json({
            success: false,
            message: 'Video already exists in your library',
            data: { video: video.formatVideoResponse(userVideo) }
          });
        }
      }

      // Try to get metadata from YouTube (if available)
      let metadata = null;
      try {
        const youtubeMetadata = require('../services/youtube-metadata.service');
        metadata = await youtubeMetadata.extractVideoMetadata(youtube_url);
      } catch (metadataError) {
        logger.warn('Could not extract metadata:', metadataError.message);
      }

      // Prepare video data for PostgreSQL
      const videoData = {
        // Basic video info
        youtube_url,
        videoid: videoId,
        video_title: video_title || metadata?.title || 'Untitled Video',
        channel_name: channel_name || metadata?.channelTitle || 'Unknown Channel',
        channel_handle: metadata?.channelHandle || '', // Now matches corrected column name

        // Enhanced fields
        description: description || metadata?.description || '',
        duration: metadata?.duration || 0,
        upload_date: metadata?.publishedAt ? new Date(metadata.publishedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        thumbnail: metadata?.highResThumbnail || metadata?.thumbnails?.[0]?.url || '', // High-res thumbnail URL

        // Processing status
        status: 'pending',

        // Categorization
        category: category || 'Education',
        privacy_setting: privacy_setting || 'public',

        // User association
        users_id: actualUserId, // PostgreSQL uses users_id column name
        created_at: new Date().toISOString()
      };

      // Handle tags (convert array to comma-separated string if needed)
      if (tags && Array.isArray(tags)) {
        videoData.tags = tags.join(',');
      } else if (metadata?.tags) {
        videoData.tags = metadata.tags.slice(0, 10).join(','); // Limit to 10 tags
      }

      // Create video using Video model
      let postgresRecord = null;

      try {
        logger.info('Creating video using Video model...');
        postgresRecord = await video.createVideo(videoData);
        logger.info(`✅ Video created in PostgreSQL: ID ${postgresRecord.id}`);

      } catch (postgresError) {
        logger.error('❌ Failed to create video in PostgreSQL:', postgresError);
        return res.status(500).json({
          success: false,
          message: 'Failed to create video',
          error: postgresError.message
        });
      }

      // Format response using PostgreSQL data
      const videoResponse = video.formatVideoResponse(postgresRecord);

      // Trigger processing if we have metadata and PostgreSQL record
      if (metadata && postgresRecord) {
        try {
          const recordData = postgresRecord;
          await this.triggerVideoProcessing(recordData.id, metadata);
        } catch (processingError) {
          logger.warn('Could not trigger processing:', processingError.message);
        }
      }

      // Success response
      const response = {
        success: true,
        message: 'Video created successfully',
        data: { video: videoResponse }
      };

      res.status(201).json(response);

    } catch (error) {
      logger.error('Error creating video:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create video',
        error: error.message
      });
    }
  }

  /**
   * Update a video
   * PUT /api/videos/:id
   */
  async updateVideo(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const userId = req.user.id;
      const updateData = req.body;

      logger.info(`Updating video ${id} for user ${userId}`, updateData);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Check if video exists and belongs to user using Video model
      const existingRecord = await video.getVideoByIdAndUser(id, actualUserId);
      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Prepare update data
      const safeUpdateData = { ...updateData };

      // Remove sensitive fields that shouldn't be updated directly
      delete safeUpdateData.id;
      delete safeUpdateData.videoid;
      delete safeUpdateData.youtube_url; // Prevent URL changes
      delete safeUpdateData.users_id; // Prevent ownership changes
      delete safeUpdateData.created_at;

      // Handle processing log updates (if applicable)
      if (safeUpdateData.processing_log) {
        try {
          // Merge with existing log if it exists
          const existingLog = existingRecord.processing_log
            ? (typeof existingRecord.processing_log === 'string'
              ? JSON.parse(existingRecord.processing_log)
              : existingRecord.processing_log)
            : { steps: [] };

          const newLog = typeof safeUpdateData.processing_log === 'string'
            ? JSON.parse(safeUpdateData.processing_log)
            : safeUpdateData.processing_log;

          const mergedLog = {
            ...existingLog,
            ...newLog,
            updated: new Date().toISOString(),
            steps: [...(existingLog.steps || []), ...(newLog.steps || [])]
          };

          safeUpdateData.processing_log = JSON.stringify(mergedLog);
        } catch (logError) {
          logger.warn('Error merging processing log:', logError.message);
        }
      }

      // Handle tags conversion if needed (array to comma-separated string)
      if (safeUpdateData.tags && Array.isArray(safeUpdateData.tags)) {
        safeUpdateData.tags = safeUpdateData.tags.join(',');
      }

      const record = await video.updateVideo(id, safeUpdateData);
      const videoResponse = video.formatVideoResponse(record);

      res.json({
        success: true,
        message: 'Video updated successfully',
        data: { video: videoResponse }
      });

    } catch (error) {
      logger.error('Error updating video:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update video',
        error: error.message
      });
    }
  }

  /**
   * Delete a video
   * DELETE /api/videos/:id
   */
  async deleteVideo(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Deleting video ${id} for user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Delete video with ownership validation using Video model
      await video.deleteVideoByUser(id, actualUserId);

      res.json({
        success: true,
        message: 'Video deleted successfully'
      });

    } catch (error) {
      logger.error('Error deleting video:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete video',
        error: error.message
      });
    }
  }

  /**
   * Get video processing status
   * GET /api/videos/:id/status
   */
  async getVideoStatus(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Fetching status for video ${id}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      const record = await video.getVideoByIdAndUser(id, actualUserId);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const status = {
        video_id: id,
        status: record.status || 'pending',
        processing_log: record.processing_log || null,
        last_updated: record.updated_at || record.created_at
      };

      res.json({
        success: true,
        data: { status }
      });

    } catch (error) {
      logger.error('Error fetching video status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch video status',
        error: error.message
      });
    }
  }

  /**
   * Format video record for API response (PostgreSQL)
   * @param {Object} record - Database record (either database service formatted or direct PostgreSQL row)
   * @returns {Object} Formatted video object
   */
  formatVideoResponse(record) {

    try {
      // Handle both database service formatted records and direct PostgreSQL rows
      const recordData = record;
      if (!recordData) {
        logger.warn('Invalid record format:', record);
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

      // Parse JSON fields safely (PostgreSQL stores JSON as strings)
      try {
        if (video.processing_log && typeof video.processing_log === 'string') {
          video.processing_log = JSON.parse(video.processing_log);
        }
      } catch {
        logger.warn('Could not parse processing_log JSON');
      }

      try {
        if (video.ai_title_suggestions && typeof video.ai_title_suggestions === 'string') {
          video.ai_title_suggestions = JSON.parse(video.ai_title_suggestions);
        }
      } catch {
        logger.warn('Could not parse ai_title_suggestions JSON');
      }

      try {
        if (video.ai_thumbnail_suggestions && typeof video.ai_thumbnail_suggestions === 'string') {
          video.ai_thumbnail_suggestions = JSON.parse(video.ai_thumbnail_suggestions);
        }
      } catch {
        logger.warn('Could not parse ai_thumbnail_suggestions JSON');
      }

      // Format duration to human readable
      if (video.duration && typeof video.duration === 'number') {
        try {
          video.duration_formatted = this.formatDuration(video.duration);
        } catch (_e) {
          logger.warn('Error formatting duration:', _e);
          video.duration_formatted = '0:00';
        }
      }

      // Ensure tags is an array (PostgreSQL stores as comma-separated string)
      if (video.tags && typeof video.tags === 'string') {
        try {
          video.tags = video.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        } catch (_e) {
          logger.warn('Error parsing tags:', _e);
          video.tags = [];
        }
      } else if (!video.tags) {
        video.tags = [];
      }

      return video;
    } catch (error) {
      logger.error(`Error formatting record ${record?.id}:`, {
        errorMessage: error?.message || 'No error message',
        errorName: error?.name || 'Unknown error type',
        errorStack: error?.stack || 'No stack trace',
        recordId: record?.id || 'No record ID',
        recordStructure: record ? Object.keys(record) : 'No record',
        fieldsStructure: record ? Object.keys(record) : 'No record',
        hasVideo: !!record?.video_title,
        hasDuration: !!record?.duration,
        fullError: JSON.stringify(error, null, 2)
      });
      const recordData = record;
      return {
        id: recordData?.id || 'unknown',
        video_title: recordData?.video_title || 'Unknown Video',
        status: 'error',
        created_at: record?.createdTime || recordData?.created_at || new Date().toISOString()
      };
    }
  }

  /**
   * Legacy method - now just calls formatVideoResponse
   * @param {Object} record - PostgreSQL record (from database service)
   * @returns {Object} Formatted video object
   */
  formatPostgresVideoResponse(record) {
    return video.formatVideoResponse(record);
  }

  /**
   * Get current table fields (to handle missing fields gracefully)
   * @param {string} tableName - Name of the table
   * @returns {Array} Array of field names
   */
  async getCurrentTableFields(tableName) {
    try {
      await database.getTableSchema(tableName);
      return [];
    } catch (error) {
      logger.warn(`Could not get table schema for ${tableName}:`, error.message);
      // Return common fields as fallback
      return ['id', 'youtube_url', 'videoid', 'video_title', 'channel_name', 'created_at', 'updated_at'];
    }
  }

  /**
   * Trigger video processing
   * @param {string} videoId - Video record ID
   * @param {Object} metadata - Video metadata
   */
  async triggerVideoProcessing(videoId, metadata) {
    try {
      const processingQueue = require('../services/processing-queue.service');

      logger.info(`Video processing triggered for ${videoId}`, {
        hasMetadata: !!metadata,
        hasTranscript: !!metadata?.transcript
      });

      // Update video status to pending using Video model
      await video.updateStatus(videoId, 'pending', {
        processing_log: JSON.stringify({
          triggered: new Date().toISOString(),
          steps: [{
            step: 'processing_queued',
            status: 'pending',
            timestamp: new Date().toISOString()
          }]
        })
      });

      // Add processing tasks to queue
      const processingTasks = [
        { task_type: 'generate_summary', priority: 3 },
        { task_type: 'generate_titles', priority: 2 },
        { task_type: 'generate_thumbnails', priority: 1 }
      ];

      for (const task of processingTasks) {
        try {
          await processingQueue.addToQueue(videoId, task.task_type, task.priority);
        } catch (queueError) {
          logger.warn(`Could not add ${task.task_type} to queue:`, queueError.message);
        }
      }

    } catch (error) {
      logger.error('Error triggering video processing:', error);
    }
  }

  /**
   * Trigger processing for a video
   * POST /api/videos/:id/process
   */
  async processVideo(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Manual processing triggered for video ${id} by user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Check if video exists and belongs to user
      const record = await video.getVideoByIdAndUser(id, actualUserId);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Trigger processing
      const videoProcessing = require('../services/video-processing.service');

      // Process in background
      videoProcessing.processVideo(id)
        .then(result => {
          logger.info(`Background processing completed for ${id}`, result);
        })
        .catch(error => {
          logger.error(`Background processing failed for ${id}:`, error);
        });

      res.json({
        success: true,
        message: 'Video processing started',
        data: {
          videoId: id,
          status: 'processing'
        }
      });

    } catch (error) {
      logger.error('Error starting video processing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start video processing',
        error: error.message
      });
    }
  }

  /**
   * Retry failed processing
   * POST /api/videos/:id/retry
   */
  async retryProcessing(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Processing retry requested for video ${id} by user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const actualUserId = await this.resolveUserId(userId);
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Check if video exists and belongs to user
      const record = await video.getVideoByIdAndUser(id, actualUserId);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Reset status and trigger processing
      await video.updateStatus(id, 'pending', {
        processing_log: JSON.stringify({
          retried: new Date().toISOString(),
          steps: []
        })
      });

      await this.triggerVideoProcessing(id, null);

      res.json({
        success: true,
        message: 'Video processing retry started',
        data: {
          videoId: id,
          status: 'pending'
        }
      });

    } catch (error) {
      logger.error('Error retrying video processing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retry video processing',
        error: error.message
      });
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
   * Extract video ID from YouTube URL
   * @param {string} url - YouTube URL
   * @returns {string|null} - Video ID or null if invalid
   */
  extractVideoId(url) {
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Cancel video processing
   * POST /api/videos/:id/cancel
   */
  async cancelProcessing(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      logger.info(`Canceling processing for video ${id} by user ${userId}`);

      // Validate video ID
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'Video ID is required'
        });
      }

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0];
            actualUserId = user.id;
            logger.info(`Found PostgreSQL user ID ${actualUserId} for Airtable user ${userId}`);
          } else {
            logger.warn(`No PostgreSQL user found for Airtable user ${userId}`);
          }
        } catch (userLookupError) {
          logger.error('Error looking up PostgreSQL user:', userLookupError);
        }
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        actualUserId = parseInt(userId);
      }

      // Get the video to verify ownership and get data before deletion
      const videoRecord = await video.getVideoByIdAndUser(id, actualUserId);
      if (!videoRecord) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Delete the video using Video model
      await video.deleteVideoByUser(id, actualUserId);

      // Cancel processing status using the service method
      const processingStatusService = require('../services/processing-status.service');
      const youtubeVideoId = videoRecord.videoid || videoRecord.youtube_video_id;

      // Use the dedicated cancel method
      const cancelled = processingStatusService.cancelVideoProcessing(youtubeVideoId);

      if (!cancelled) {
        logger.warn(`No active processing found for video ${youtubeVideoId}, but database status updated`);
      }

      // Decrement the videos_processed count in subscription usage
      try {
        const subscriptionService = require('../services/subscription.service');
        await subscriptionService.decrementVideoProcessedCount(userId);
        logger.info(`Decremented videos_processed count for user ${userId} due to cancellation`);
      } catch (usageError) {
        logger.error('Error decrementing videos_processed count:', usageError);
        // Don't fail the cancellation if usage update fails
      }

      logger.info(`Successfully cancelled processing for video ${id}`);

      res.json({
        success: true,
        message: 'Video processing cancelled successfully',
        data: {
          id: videoRecord.id,
          videoId: videoRecord.videoid || videoRecord.youtube_video_id,
          status: 'cancelled'
        }
      });

    } catch (error) {
      logger.error('Error canceling video processing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel video processing',
        error: error.message
      });
    }
  }

  /**
   * Get generated content for a video
   * GET /api/videos/:id/content/:contentType
   */
  async getVideoContent(req, res) {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id, contentType } = req.params;
      const userId = req.user.id;

      logger.info(`Fetching ${contentType} content for video ${id} by user ${userId}`);

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0];
            actualUserId = user.id;
            logger.info(`Found PostgreSQL user ID ${actualUserId} for Airtable user ${userId}`);
          } else {
            logger.warn(`No PostgreSQL user found for Airtable user ${userId}`);
          }
        } catch (userLookupError) {
          logger.error('Error looking up PostgreSQL user:', userLookupError);
        }
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        actualUserId = parseInt(userId);
      }

      // Handle video ID - could be videoId or database record ID
      let videoRecord;

      logger.info(`Searching for video with ID: ${id} for user: ${actualUserId}`);

      // First try to find by videoid (YouTube video ID)
      videoRecord = await video.findByVideoId(id);
      if (videoRecord && videoRecord.users_id === actualUserId) {
        logger.info(`Found video by videoid: ${videoRecord.video_title} (users_id: ${videoRecord.users_id})`);
      } else if (videoRecord && videoRecord.users_id !== actualUserId) {
        // Video exists but doesn't belong to user
        videoRecord = null;
        logger.info(`Video with videoid ${id} exists but belongs to different user`);
      } else {
        // If not found by videoid, try by database record ID
        videoRecord = await video.getVideoByIdAndUser(id, actualUserId);
        if (videoRecord) {
          logger.info(`Found video by record ID: ${videoRecord.video_title}`);
        }
      }

      if (!videoRecord) {
        logger.warn(`Video not found for ID ${id} by user ${actualUserId}`);
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      logger.info(`Found video ${id} for user ${actualUserId}, checking content type ${contentType}`);

      // Use the new video_content table architecture instead of columns in videos table
      // First, find the content type in the content_types table
      const contentTypeQuery = `
        SELECT id, key, label 
        FROM content_types 
        WHERE key = $1 AND is_active = true
      `;
      
      const contentTypeResult = await database.query(contentTypeQuery, [contentType]);
      
      if (contentTypeResult.rows.length === 0) {
        logger.error(`Content type '${contentType}' not found in content_types table`);
        return res.status(400).json({
          success: false,
          message: 'Invalid content type'
        });
      }
      
      const contentTypeRecord = contentTypeResult.rows[0];
      logger.info(`Found content type: ${contentTypeRecord.label} (ID: ${contentTypeRecord.id})`);
      
      // Handle transcript specially since it's stored in videos table, not video_content table
      let content = null;
      let contentUrl = null;
      let generationStatus = null;
      let lastUpdated = null;
      
      if (contentType === 'transcript' || contentType === 'transcript_text') {
        // Transcripts are stored in the videos table
        content = videoRecord.transcript_text;
        generationStatus = content && content.trim() ? 'completed' : 'pending';
        lastUpdated = videoRecord.updated_at;
        logger.info(`Found transcript in videos table: length=${content?.length || 0}`);
      } else {
        // All other content types are in the video_content table
        const videoContentQuery = `
          SELECT content_text, content_url, generation_status, updated_at
          FROM video_content 
          WHERE video_id = $1 AND content_type_id = $2
          ORDER BY created_at DESC
          LIMIT 1
        `;
        
        const videoContentResult = await database.query(videoContentQuery, [videoRecord.id, contentTypeRecord.id]);
        
        if (videoContentResult.rows.length > 0) {
          const contentRecord = videoContentResult.rows[0];
          content = contentRecord.content_text;
          contentUrl = contentRecord.content_url;
          generationStatus = contentRecord.generation_status;
          lastUpdated = contentRecord.updated_at;
          logger.info(`Found content in video_content table: status=${generationStatus}, length=${content?.length || 0}`);
        } else {
          logger.info(`No content found in video_content table for video ${videoRecord.id} and content type ${contentTypeRecord.id}`);
        }
      }

      // Detailed content debugging
      logger.info(`Content check for video ${videoRecord.videoid} content type ${contentType}:`);
      logger.info(`  - Content exists: ${!!content}`);
      logger.info(`  - Content type: ${typeof content}`);
      logger.info(`  - Content length: ${content ? content.length : 0}`);
      logger.info(`  - Content preview: ${content ? content.substring(0, 100) + '...' : 'null'}`);
      logger.info(`  - Generation status: ${generationStatus}`);
      logger.info(`  - Content URL: ${contentUrl || 'none'}`);

      if (!content || content.trim() === '') {
        logger.warn(`Content not found or empty for video ${videoRecord.videoid} content type ${contentType}`);
        return res.status(404).json({
          success: false,
          message: `${contentTypeRecord.label} content not found or not yet generated`
        });
      }

      res.json({
        success: true,
        data: {
          contentType,
          content,
          contentUrl,
          generationStatus,
          videoId: videoRecord.videoid,
          videoTitle: videoRecord.video_title,
          lastUpdated: lastUpdated || videoRecord.updated_at,
          contentTypeLabel: contentTypeRecord.label
        }
      });

    } catch (error) {
      logger.error('Error fetching video content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch video content',
        error: error.message
      });
    }
  }

  /**
   * Process multiple video URLs (batch processing)
   * POST /api/videos/batch
   */
  async processBatch(req, res) {
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
      const { urls, contentTypes = [] } = req.body;

      logger.info(`Batch processing ${urls?.length || 0} videos for user ${userId} with content types:`, contentTypes);

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'URLs array is required and cannot be empty'
        });
      }

      // Handle user ID conversion if needed (Airtable record IDs start with 'rec')
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0];
            actualUserId = user.id;
            logger.info(`Found PostgreSQL user ID ${actualUserId} for Airtable user ${userId}`);
          } else {
            logger.warn(`No PostgreSQL user found for Airtable user ${userId}`);
          }
        } catch (userLookupError) {
          logger.error('Error looking up PostgreSQL user:', userLookupError);
        }
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        actualUserId = parseInt(userId);
      }

      const processedVideos = [];
      const failedVideos = [];

      for (const url of urls) {
        try {
          // Extract video ID from URL
          const videoId = this.extractVideoId(url);
          if (!videoId) {
            failedVideos.push({
              url,
              error: 'Invalid YouTube URL format'
            });
            continue;
          }

          // Check if video already exists for this user
          const existingVideos = await video.findAllByVideoId(videoId);
          if (existingVideos && existingVideos.length > 0) {
            const userVideo = existingVideos.find(videoRecord => videoRecord.users_id === actualUserId);
            if (userVideo) {
              failedVideos.push({
                url,
                error: 'Video already exists in your library'
              });
              continue;
            }
          }

          // Get metadata from YouTube (if available)
          let metadata = null;
          try {
            const youtubeMetadata = require('../services/youtube-metadata.service');
            metadata = await youtubeMetadata.extractVideoMetadata(url);
          } catch (metadataError) {
            logger.warn(`Could not extract metadata for ${url}:`, metadataError.message);
          }

          // Prepare video data for PostgreSQL
          const videoData = {
            youtube_url: url,
            videoid: videoId,
            video_title: metadata?.title || 'Untitled Video',
            channel_name: metadata?.channelTitle || 'Unknown Channel',
            channel_handle: metadata?.channelHandle || '',
            description: metadata?.description || '',
            duration: metadata?.duration || 0,
            upload_date: metadata?.publishedAt ? new Date(metadata.publishedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            thumbnail: metadata?.highResThumbnail || metadata?.thumbnails?.[0]?.url || '',
            status: 'pending',
            category: 'Education',
            privacy_setting: 'public',
            users_id: actualUserId,
            created_at: new Date().toISOString()
          };

          // Handle tags
          if (metadata?.tags) {
            videoData.tags = metadata.tags.slice(0, 10).join(',');
          }

          // Create video record using Video model
          const postgresRecord = await video.createVideo(videoData);
          logger.info(`✅ Batch video created in PostgreSQL: ID ${postgresRecord.id} (${videoData.video_title})`);

          // Trigger processing with selected content types
          if (metadata && postgresRecord) {
            try {
              await this.triggerBatchVideoProcessing(postgresRecord.id, metadata, contentTypes);
            } catch (processingError) {
              logger.warn(`Could not trigger processing for ${url}:`, processingError.message);
            }
          }

          processedVideos.push(video.formatVideoResponse(postgresRecord));

        } catch (videoError) {
          logger.error(`Error processing video ${url}:`, videoError);
          failedVideos.push({
            url,
            error: videoError.message || 'Failed to process video'
          });
        }
      }

      const response = {
        success: true,
        message: `Batch processing completed: ${processedVideos.length} successful, ${failedVideos.length} failed`,
        data: {
          processedVideos,
          failedVideos,
          summary: {
            total: urls.length,
            successful: processedVideos.length,
            failed: failedVideos.length
          }
        }
      };

      res.status(201).json(response);

    } catch (error) {
      logger.error('Error in batch video processing:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process videos',
        error: error.message
      });
    }
  }

  /**
   * Trigger video processing with selected content types (batch version)
   * @param {string} videoId - Video record ID
   * @param {Object} metadata - Video metadata
   * @param {Array} selectedContentTypes - Array of selected content types
   */
  async triggerBatchVideoProcessing(videoId, metadata, selectedContentTypes = []) {
    try {
      logger.info(`Batch video processing triggered for ${videoId}`, {
        hasMetadata: !!metadata,
        hasTranscript: !!metadata?.transcript,
        contentTypes: selectedContentTypes
      });

      // Use selected content types if provided, otherwise get all available from database
      let contentTypes = selectedContentTypes && selectedContentTypes.length > 0
        ? selectedContentTypes
        : null;

      // If no content types selected, get all available from database
      if (!contentTypes) {
        try {
          const database = require('../services/database.service');
          const contentTypesList = await aiPrompts.getAvailableContentTypes();
          contentTypes = contentTypesList.map(ct => ct.type);
          logger.info(`Using all available content types from database: ${contentTypes.length} types`);
        } catch (dbError) {
          logger.warn('Could not load content types from database, using fallback:', dbError.message);
          contentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text', 'ebook_text'];
        }
      }

      // Initialize processing status for the video with selected content types
      const processingStatusService = require('../services/processing-status.service');
      const youtubeVideoId = metadata?.videoId || this.extractVideoId(metadata?.url || '');

      if (youtubeVideoId) {
        // Initialize status for selected content types only
        processingStatusService.initializeVideoProcessing(youtubeVideoId, contentTypes);
        logger.info(`Initialized processing status for video ${youtubeVideoId} with content types:`, contentTypes);
      }

      // Update video status to pending using Video model
      await video.updateStatus(videoId, 'pending', {
        processing_log: JSON.stringify({
          triggered: new Date().toISOString(),
          contentTypes: contentTypes,
          steps: [{
            step: 'batch_processing_queued',
            status: 'pending',
            timestamp: new Date().toISOString()
          }]
        })
      });

      // Add processing tasks to queue for each selected content type
      const processingQueue = require('../services/processing-queue.service');

      const processingTasks = [
        { task_type: 'extract_transcript', priority: 5 }, // Always extract transcript first
        { task_type: 'generate_content', priority: 4, contentTypes }  // Generate selected content types
      ];

      for (const task of processingTasks) {
        try {
          await processingQueue.addToQueue(videoId, task.task_type, task.priority, { contentTypes: task.contentTypes });
          logger.info(`Added ${task.task_type} to processing queue for video ${videoId}`);
        } catch (queueError) {
          logger.warn(`Could not add ${task.task_type} to queue:`, queueError.message);
        }
      }

    } catch (error) {
      logger.error('Error triggering batch video processing:', error);
    }
  }

  /**
   * Get available content types from ai_prompts table
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getAvailableContentTypes(req, res) {
    try {
      logger.info('Fetching available content types from ai_prompts table');

      // Use the new ContentService for normalized content type retrieval
      const contentService = require('../services/content.service');
      const contentTypes = await contentService.getAvailableContentTypes();

      // Get AI provider counts from ai_prompts for additional metadata
      const providerCounts = await aiPrompts.getProviderCountsByContentType();

      const providerMap = {};
      providerCounts.forEach(row => {
        providerMap[row.content_type] = {
          count: parseInt(row.provider_count),
          providers: row.providers
        };
      });

      // Format response with content type data and AI provider info
      const availableContentTypes = contentTypes.map(ct => ({
        key: ct.key,
        label: ct.label,
        icon: ct.icon,
        description: ct.description,
        displayOrder: ct.display_order,
        requiresAi: ct.requires_ai,
        hasUrlField: ct.has_url_field,
        providerCount: providerMap[ct.key]?.count || 0,
        providers: providerMap[ct.key]?.providers || [],
        enabled: true
      }));

      logger.info(`Found ${availableContentTypes.length} available content types`);

      res.json({
        success: true,
        data: {
          contentTypes: availableContentTypes,
          totalTypes: availableContentTypes.length
        }
      });

    } catch (error) {
      logger.error('Error fetching available content types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch available content types',
        error: error.message
      });
    }
  }
}

module.exports = new VideosController();
