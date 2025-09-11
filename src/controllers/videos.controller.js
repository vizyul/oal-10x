const { logger } = require('../utils');
const database = require('../services/database.service');
const { validationResult } = require('express-validator');

class VideosController {
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
          }
        } catch (userLookupError) {
          logger.error('Error looking up PostgreSQL user:', userLookupError);
        }
      } else if (typeof userId === 'number' || !isNaN(parseInt(userId))) {
        // This is already a PostgreSQL integer ID
        actualUserId = parseInt(userId);
      }

      // Build WHERE conditions for PostgreSQL
      const whereConditions = [];
      const queryParams = [];
      let paramIndex = 1;

      // Always filter by user
      whereConditions.push(`users_id = $${paramIndex}`);
      queryParams.push(actualUserId);
      paramIndex++;

      // Add status filter
      if (status) {
        whereConditions.push(`status = $${paramIndex}`);
        queryParams.push(status);
        paramIndex++;
      }

      // Add category filter
      if (category) {
        whereConditions.push(`category = $${paramIndex}`);
        queryParams.push(category);
        paramIndex++;
      }

      // Add search filter (case-insensitive search in video_title)
      if (search) {
        whereConditions.push(`LOWER(video_title) LIKE LOWER($${paramIndex})`);
        queryParams.push(`%${search}%`);
        paramIndex++;
      }

      // Build the base query
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Get total count for pagination
      const countQuery = `SELECT COUNT(*) as total FROM videos ${whereClause}`;
      const countResult = await database.query(countQuery, queryParams);
      const totalRecords = parseInt(countResult.rows[0].total);

      // Calculate pagination
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const offset = (pageNum - 1) * limitNum;
      const hasMore = offset + limitNum < totalRecords;

      // Build main query with pagination and sorting
      const mainQuery = `
        SELECT * FROM videos 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      queryParams.push(limitNum, offset);

      logger.info('Executing PostgreSQL query:', { query: mainQuery, params: queryParams });

      const result = await database.query(mainQuery, queryParams);
      const records = result.rows;

      logger.info(`Found ${records.length} videos for user ${actualUserId}`);

      // Format the videos using database service format
      const videos = records.map((record) => {
        try {
          // Create database service formatted record
          const formattedRecord = database.formatRecord(record);
          return this.formatVideoResponse(formattedRecord);
        } catch (formatError) {
          logger.error(`Error formatting video record ${record.id}:`, formatError.message);

          // Return basic video object if formatting fails
          return {
            id: record.id,
            video_title: record.video_title || 'Untitled Video',
            channel_name: record.channel_name || 'Unknown Channel',
            status: record.status || 'completed',
            created_at: record.created_at || new Date().toISOString(),
            ...record
          };
        }
      });

      logger.info(`Successfully formatted ${videos.length} videos for response`);

      res.json({
        success: true,
        data: {
          videos,
          pagination: {
            currentPage: pageNum,
            totalPages: Math.ceil(totalRecords / limitNum),
            totalRecords: totalRecords,
            startIndex: Math.min(offset + 1, totalRecords),
            endIndex: Math.min(offset + videos.length, totalRecords),
            hasMore
          }
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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      const record = await database.findById('videos', id);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check if video belongs to user
      const recordData = record.fields || record;
      if (recordData.users_id && recordData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const video = this.formatVideoResponse(record);

      res.json({
        success: true,
        data: { video }
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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      // Check if video already exists for this user
      const existingVideos = await database.findByField('videos', 'videoid', videoId);
      if (existingVideos && existingVideos.length > 0) {
        // Check if any belong to current user
        const userVideo = existingVideos.find(video => {
          const videoData = video.fields || video;
          return videoData.users_id === actualUserId;
        });

        if (userVideo) {
          return res.status(409).json({
            success: false,
            message: 'Video already exists in your library',
            data: { video: this.formatVideoResponse(userVideo) }
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

      // Write to PostgreSQL
      let postgresRecord = null;

      try {
        logger.info('Writing video to PostgreSQL...');
        postgresRecord = await database.create('videos', videoData);
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
      const video = this.formatVideoResponse(postgresRecord);

      // Trigger processing if we have metadata and PostgreSQL record
      if (metadata && postgresRecord) {
        try {
          const recordData = postgresRecord.fields || postgresRecord;
          await this.triggerVideoProcessing(recordData.id, metadata);
        } catch (processingError) {
          logger.warn('Could not trigger processing:', processingError.message);
        }
      }

      // Success response
      const response = {
        success: true,
        message: 'Video created successfully',
        data: { video }
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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      // Check if video exists and belongs to user
      const existingRecord = await database.findById('videos', id);
      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership
      const existingData = existingRecord.fields || existingRecord;
      if (existingData.users_id && existingData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
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
          const existingLog = existingData.processing_log
            ? (typeof existingData.processing_log === 'string'
              ? JSON.parse(existingData.processing_log)
              : existingData.processing_log)
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

      const record = await database.update('videos', id, safeUpdateData);
      const video = this.formatVideoResponse(record);

      res.json({
        success: true,
        message: 'Video updated successfully',
        data: { video }
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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      // Check if video exists and belongs to user before deleting
      const existingRecord = await database.findById('videos', id);
      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership
      const existingData = existingRecord.fields || existingRecord;
      if (existingData.users_id && existingData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      await database.delete('videos', id);

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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      const record = await database.findById('videos', id);

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership
      const recordData = record.fields || record;
      if (recordData.users_id && recordData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      const status = {
        video_id: id,
        status: recordData.status || 'pending',
        processing_log: recordData.processing_log || null,
        last_updated: recordData.updated_at || recordData.created_at || record.createdTime
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
      const recordData = record.fields || record;
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
        fieldsStructure: record?.fields ? Object.keys(record.fields) : 'No fields',
        hasVideo: !!(record?.fields?.video_title || record?.video_title),
        hasDuration: !!(record?.fields?.duration || record?.duration),
        fullError: JSON.stringify(error, null, 2)
      });
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
   * Legacy method - now just calls formatVideoResponse
   * @param {Object} record - PostgreSQL record (from database service)
   * @returns {Object} Formatted video object
   */
  formatPostgresVideoResponse(record) {
    return this.formatVideoResponse(record);
  }

  /**
   * Get current table fields (to handle missing fields gracefully)
   * @param {string} tableName - Name of the table
   * @returns {Array} Array of field names
   */
  async getCurrentTableFields(tableName) {
    try {
      const schema = await database.getTableSchema(tableName);
      return schema.fields || [];
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

      // Update video status to pending
      const currentFields = await this.getCurrentTableFields('videos');
      if (currentFields.includes('status')) {
        await database.update('videos', videoId, {
          status: 'pending',
          processing_log: JSON.stringify({
            triggered: new Date().toISOString(),
            steps: [{
              step: 'processing_queued',
              status: 'pending',
              timestamp: new Date().toISOString()
            }]
          })
        });
      }

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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      // Check if video exists and belongs to user
      const record = await database.findById('videos', id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership
      const recordData = record.fields || record;
      if (recordData.users_id && recordData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
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
        // This is an Airtable record ID, try to find the PostgreSQL user
        try {
          const userResult = await database.findByField('users', 'airtable_id', userId);
          if (userResult && userResult.length > 0) {
            const user = userResult[0].fields || userResult[0];
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

      // Check if video exists and belongs to user
      const record = await database.findById('videos', id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      const recordData = record.fields || record;
      if (recordData.users_id && recordData.users_id !== actualUserId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Reset status and trigger processing
      const currentFields = await this.getCurrentTableFields('videos');
      if (currentFields.includes('status')) {
        await database.update('videos', id, {
          status: 'pending',
          processing_log: JSON.stringify({
            retried: new Date().toISOString(),
            steps: []
          })
        });
      }

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

      // Get the video to verify ownership
      const video = await database.findById('videos', id);
      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership
      if (video.users_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only cancel processing for your own videos'
        });
      }

      // Delete the video from database (instead of just marking as cancelled)
      await database.delete('videos', id);

      // Cancel processing status using the service method
      const processingStatusService = require('../services/processing-status.service');
      const youtubeVideoId = video.videoid || video.youtube_video_id;
      
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
          id: video.id,
          videoId: video.videoid || video.youtube_video_id,
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
            const user = userResult[0].fields || userResult[0];
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
      let video;
      
      // First try to find by videoid (YouTube video ID)
      const videoIdResults = await database.findByField('videos', 'videoid', id);
      if (videoIdResults && videoIdResults.length > 0) {
        // Filter by user ownership
        const userVideo = videoIdResults.find(v => {
          const videoData = v.fields || v;
          return videoData.users_id === actualUserId;
        });
        if (userVideo) {
          video = userVideo.fields || userVideo;
        }
      }

      // If not found by videoid, try by database record ID
      if (!video) {
        const recordResult = await database.findById('videos', id);
        if (recordResult) {
          const recordData = recordResult.fields || recordResult;
          // Check ownership
          if (recordData.users_id === actualUserId) {
            video = recordData;
          }
        }
      }

      if (!video) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Map content type to database column
      const contentFieldMap = {
        'transcript': 'transcript_text',
        'summary_text': 'summary_text', 
        'study_guide_text': 'study_guide_text',
        'discussion_guide_text': 'discussion_guide_text',
        'group_guide_text': 'group_guide_text',
        'social_media_text': 'social_media_text',
        'quiz_text': 'quiz_text',
        'chapters_text': 'chapters_text'
      };

      const fieldName = contentFieldMap[contentType];
      if (!fieldName) {
        return res.status(400).json({
          success: false,
          message: 'Invalid content type'
        });
      }

      const content = video[fieldName];
      
      if (!content) {
        return res.status(404).json({
          success: false,
          message: `${contentType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())} content not found or not yet generated`
        });
      }

      res.json({
        success: true,
        data: {
          contentType,
          content,
          videoId: video.videoid || video.youtube_video_id,
          videoTitle: video.video_title,
          lastUpdated: video.updated_at
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
}

module.exports = new VideosController();
