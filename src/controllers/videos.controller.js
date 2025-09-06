const { logger } = require('../utils');
const airtable = require('../services/airtable.service');
const databaseService = require('../services/database.service');
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

      // Build filter options - use user_id linked field
      let filterFormula = '';
      
      try {
        // Temporarily disable filtering to get the query working first, then filter manually
        filterFormula = ''; // No filter for now
        logger.info(`Getting all videos, will filter manually for user ID: ${userId}`);
      } catch (error) {
        logger.warn('Error building user filter, returning all videos:', error);
        filterFormula = '';
      }
      
      if (status && filterFormula) {
        filterFormula += ` AND {status} = "${status}"`;
      } else if (status) {
        filterFormula = `{status} = "${status}"`;
      }
      
      if (category && filterFormula) {
        filterFormula += ` AND {category} = "${category}"`;
      } else if (category) {
        filterFormula = `{category} = "${category}"`;
      }
      
      if (search && filterFormula) {
        filterFormula += ` AND (FIND(LOWER("${search}"), LOWER({video_title})) > 0)`;
      } else if (search) {
        filterFormula = `FIND(LOWER("${search}"), LOWER({video_title})) > 0`;
      }

      // Proper query with filtering, sorting, and pagination
      const options = {
        maxRecords: parseInt(limit) * parseInt(page),
        sort: [{ field: 'created_at', direction: 'desc' }]
      };

      if (filterFormula) {
        options.filterByFormula = filterFormula;
      }

      logger.info('Querying Videos with options:', options);

      // Implement timeout wrapper for the Airtable query
      const queryWithTimeout = (query, timeoutMs = 5000) => {
        return Promise.race([
          query,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs}ms`)), timeoutMs)
          )
        ]);
      };

      try {
        logger.info('Starting Airtable query with timeout protection...');
        
        // Very simple query - get only a small batch with minimal options
        const simpleOptions = {
          maxRecords: 50,  // Reduce to 50 records max
          // Remove sorting to speed up the query
        };
        
        logger.info('Executing minimal Airtable query with options:', simpleOptions);
        
        // Try direct Airtable base query instead of service method
        logger.info('Attempting direct Airtable base query...');
        
        const records = await queryWithTimeout(
          new Promise((resolve, reject) => {
            const recordsList = [];
            if (!airtable.base) {
              reject(new Error('Airtable not configured'));
              return;
            }
            
            airtable.base('Videos').select({
              maxRecords: 20, // Even smaller batch
              pageSize: 10    // Small page size
            }).eachPage((pageRecords, fetchNextPage) => {
              recordsList.push(...pageRecords);
              // Only fetch first page to keep it fast
              resolve(recordsList);
            }).catch(reject);
          }),
          4000 // 4 second timeout
        );
        
        logger.info(`Query completed successfully. Found ${records.length} records`);
        
        // Manual filtering by user_id
        const userFilteredRecords = records.filter(record => {
          const userIds = record.fields.user_id || [];
          const hasUser = userIds.includes(userId);
          if (hasUser) {
            logger.info(`Match found: Record ${record.id} belongs to user ${userId}`);
          }
          return hasUser;
        });
        
        logger.info(`After filtering: ${userFilteredRecords.length} records for user ${userId}`);
        
        // Apply pagination to filtered results
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedRecords = userFilteredRecords.slice(startIndex, endIndex);
        
        logger.info(`After pagination: ${paginatedRecords.length} records (page ${page}, limit ${limit})`);

        // Format the videos using arrow function
        const videos = paginatedRecords.map((record) => {
          try {
            return this.formatVideoResponse(record);
          } catch (formatError) {
            logger.error(`Error formatting video record ${record.id}:`, formatError.message);
            
            // Return basic video object if formatting fails
            return {
              id: record.id,
              video_title: record.fields.video_title || 'Untitled Video',
              channel_name: record.fields.channel_name || 'Unknown Channel',
              status: record.fields.status || 'completed',
              created_at: record.createdTime,
              ...record.fields
            };
          }
        });

        logger.info(`Successfully formatted ${videos.length} videos for response`);

        res.json({
          success: true,
          data: {
            videos,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: userFilteredRecords.length,
              hasMore: endIndex < userFilteredRecords.length
            }
          }
        });
        
      } catch (queryError) {
        logger.error('Airtable query failed:', queryError);
        
        if (queryError.message && queryError.message.includes('timeout')) {
          logger.error('Query timed out - returning empty result');
          return res.json({
            success: true,
            data: {
              videos: [],
              pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: 0,
                hasMore: false
              }
            },
            warning: 'Query timed out - there may be too many records to process'
          });
        }
        
        throw queryError; // Re-throw other errors to be caught by outer catch
      }

    } catch (error) {
      logger.error('=== ERROR in getVideos method ===');
      logger.error('Error fetching videos:', error);
      logger.error('Error stack:', error.stack);
      logger.error('Error type:', typeof error);
      logger.error('Error details:', JSON.stringify(error, null, 2));
      
      // More detailed error information
      const errorResponse = {
        success: false,
        message: 'Failed to fetch videos',
        error: error.message || 'Unknown error'
      };
      
      if (error.message && error.message.includes('timeout')) {
        errorResponse.message = 'Request timed out - there may be too many records to process';
      }
      
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

      const record = await airtable.findById('Videos', id);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check if video belongs to user (when user_id field is available)
      if (record.fields.user_id && record.fields.user_id[0] !== userId) {
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

      // Check if video already exists for this user
      const existingVideos = await airtable.findByField('Videos', 'videoid', videoId);
      if (existingVideos && existingVideos.length > 0) {
        // Check if any belong to current user
        const userVideo = existingVideos.find(video => 
          video.fields.user_id && video.fields.user_id[0] === userId
        );
        
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

      // Prepare video data for Airtable with all new fields
      const videoData = {
        // Basic video info
        youtube_url,
        videoid: videoId,
        video_title: video_title || metadata?.title || 'Untitled Video',
        channel_name: channel_name || metadata?.channelTitle || 'Unknown Channel',
        chanel_handle: metadata?.channelHandle || '', // Note: matches Airtable column name
        
        // Enhanced fields (will be ignored if fields don't exist yet)
        description: description || metadata?.description || '',
        duration: metadata?.duration || 0,
        upload_date: metadata?.publishedAt || new Date().toISOString(),
        thumbnail: metadata?.highResThumbnail || metadata?.thumbnails?.[0]?.url || '', // High-res thumbnail
        
        // Processing status
        status: 'pending',
        processing_log: JSON.stringify({
          created: new Date().toISOString(),
          steps: []
        }),
        
        // Categorization
        category: category || 'Education',
        privacy_setting: privacy_setting || 'public',
        
        // User association
        user_id: [userId]
      };

      // Handle tags (convert array to comma-separated string if needed)
      if (tags && Array.isArray(tags)) {
        videoData.tags = tags;
      } else if (metadata?.tags) {
        videoData.tags = metadata.tags.slice(0, 10); // Limit to 10 tags
      }

      // Remove fields that don't exist in current table structure
      const safeVideoData = {};
      const currentTableFields = await this.getCurrentTableFields('Videos');
      
      Object.keys(videoData).forEach(key => {
        if (currentTableFields.includes(key)) {
          safeVideoData[key] = videoData[key];
        }
      });

      // === DUAL WRITE: Write to both Airtable and PostgreSQL === 
      let airtableRecord = null;
      let postgresRecord = null;
      let writeErrors = [];

      // 1. Write to Airtable first (existing logic)
      try {
        logger.info('Writing video to Airtable...');
        airtableRecord = await airtable.create('Videos', safeVideoData);
        logger.info(`✅ Video created in Airtable: ${airtableRecord.id}`);
      } catch (airtableError) {
        logger.error('❌ Failed to create video in Airtable:', airtableError);
        writeErrors.push(`Airtable: ${airtableError.message}`);
      }

      // 2. Write to PostgreSQL (independent operation)
      try {
        logger.info('Writing video to PostgreSQL...');
        
        // Prepare PostgreSQL data (different field mappings)
        const postgresVideoData = {
          youtube_url: youtube_url,
          videoid: videoId,
          video_title: video_title || metadata?.title || 'Untitled Video',
          channel_name: channel_name || metadata?.channelTitle || 'Unknown Channel',
          chanel_handle: metadata?.channelHandle || '', // Channel handle like @prophetdwight
          description: description || metadata?.description || '',
          thumbnail: metadata?.highResThumbnail || metadata?.thumbnails?.[0]?.url || '', // High-res thumbnail URL
          users_id: userId, // PostgreSQL uses users_id column name
          status: 'pending',
          created_at: new Date().toISOString(),
          airtable_id: airtableRecord?.id || null // Store Airtable ID if successful
        };

        // Add other fields if they exist
        if (metadata?.duration) postgresVideoData.duration = metadata.duration;
        if (category) postgresVideoData.category = category;
        if (privacy_setting) postgresVideoData.privacy_setting = privacy_setting;
        
        postgresRecord = await databaseService.create('videos', postgresVideoData);
        logger.info(`✅ Video created in PostgreSQL: ID ${postgresRecord.id}`);
        
      } catch (postgresError) {
        logger.error('❌ Failed to create video in PostgreSQL:', postgresError);
        writeErrors.push(`PostgreSQL: ${postgresError.message}`);
      }

      // 3. Determine response based on results
      if (!airtableRecord && !postgresRecord) {
        // Both failed
        return res.status(500).json({
          success: false,
          message: 'Failed to create video in both databases',
          errors: writeErrors
        });
      }

      // At least one succeeded - format response using available data
      const video = airtableRecord ? 
        this.formatVideoResponse(airtableRecord) :
        this.formatPostgresVideoResponse(postgresRecord);

      // 4. Trigger processing if we have metadata and Airtable record
      if (metadata && airtableRecord) {
        try {
          await this.triggerVideoProcessing(airtableRecord.id, metadata);
        } catch (processingError) {
          logger.warn('Could not trigger processing:', processingError.message);
        }
      }

      // 5. Success response with warnings if any database failed
      const response = {
        success: true,
        message: 'Video created successfully',
        data: { video }
      };

      if (writeErrors.length > 0) {
        response.warnings = writeErrors;
        response.message += ` (with ${writeErrors.length} database warning(s))`;
      }

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

      // Check if video exists and belongs to user
      const existingRecord = await airtable.findById('Videos', id);
      if (!existingRecord) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership (when user_id field is available)
      if (existingRecord.fields.user_id && existingRecord.fields.user_id[0] !== userId) {
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
      delete safeUpdateData.user_id; // Prevent ownership changes
      delete safeUpdateData.created_at;
      
      // Handle processing log updates
      if (safeUpdateData.processing_log) {
        try {
          // Merge with existing log
          const existingLog = existingRecord.fields.processing_log 
            ? JSON.parse(existingRecord.fields.processing_log)
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

      // Add updated timestamp if field exists
      const currentFields = await this.getCurrentTableFields('Videos');
      if (currentFields.includes('updated_at')) {
        safeUpdateData.updated_at = new Date().toISOString();
      }

      // Filter out fields that don't exist in current table structure
      const filteredUpdateData = {};
      Object.keys(safeUpdateData).forEach(key => {
        if (currentFields.includes(key)) {
          filteredUpdateData[key] = safeUpdateData[key];
        }
      });

      const record = await airtable.update('Videos', id, filteredUpdateData);
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

      await airtable.delete('Videos', id);

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

      const record = await airtable.findById('Videos', id);
      
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      const status = {
        video_id: id,
        status: record.fields.status || 'pending',
        processing_log: record.fields.processing_log || null,
        last_updated: record.fields['Last Modified'] || record.createdTime
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
   * Format video record for API response (Airtable)
   * @param {Object} record - Airtable record
   * @returns {Object} Formatted video object
   */
  formatVideoResponse(record) {
    
    try {
      // Ensure record and fields exist
      if (!record || !record.fields) {
        logger.warn('Invalid record format:', record);
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

      // Parse JSON fields safely
      try {
        if (video.processing_log && typeof video.processing_log === 'string') {
          video.processing_log = JSON.parse(video.processing_log);
        }
      } catch (e) {
        logger.warn('Could not parse processing_log JSON');
      }

      try {
        if (video.ai_title_suggestions && typeof video.ai_title_suggestions === 'string') {
          video.ai_title_suggestions = JSON.parse(video.ai_title_suggestions);
        }
      } catch (e) {
        logger.warn('Could not parse ai_title_suggestions JSON');
      }

      try {
        if (video.ai_thumbnail_suggestions && typeof video.ai_thumbnail_suggestions === 'string') {
          video.ai_thumbnail_suggestions = JSON.parse(video.ai_thumbnail_suggestions);
        }
      } catch (e) {
        logger.warn('Could not parse ai_thumbnail_suggestions JSON');
      }

      // Format duration to human readable
      if (video.duration && typeof video.duration === 'number') {
        try {
          video.duration_formatted = this.formatDuration(video.duration);
        } catch (e) {
          logger.warn('Error formatting duration:', e);
          video.duration_formatted = '0:00';
        }
      }

      // Ensure tags is an array
      if (video.tags && typeof video.tags === 'string') {
        try {
          video.tags = video.tags.split(',').map(tag => tag.trim());
        } catch (e) {
          logger.warn('Error parsing tags:', e);
          video.tags = [];
        }
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
        hasVideo: !!record?.fields?.video_title,
        hasDuration: !!record?.fields?.duration,
        fullError: JSON.stringify(error, null, 2)
      });
      return {
        id: record?.id || 'unknown',
        video_title: record?.fields?.video_title || 'Unknown Video',
        status: 'error',
        created_at: record?.createdTime || new Date().toISOString()
      };
    }
  }

  /**
   * Format PostgreSQL video record for API response
   * @param {Object} record - PostgreSQL record (from database service)
   * @returns {Object} Formatted video object
   */
  formatPostgresVideoResponse(record) {
    // PostgreSQL record comes in format: { id, fields, createdTime }
    const video = {
      id: record.id,
      ...record.fields,
      created_at: record.createdTime || record.fields.created_at
    };

    // Parse JSON fields safely (PostgreSQL stores JSON as strings)
    try {
      if (video.thumbnail && typeof video.thumbnail === 'string') {
        video.thumbnail = JSON.parse(video.thumbnail);
      }
    } catch (e) {
      logger.warn('Could not parse thumbnail JSON from PostgreSQL');
    }

    // Format duration to human readable
    if (video.duration && typeof video.duration === 'number') {
      try {
        video.duration_formatted = this.formatDuration(video.duration);
      } catch (e) {
        logger.warn('Error formatting duration in PostgreSQL response:', e);
        video.duration_formatted = '0:00';
      }
    }

    // Ensure tags is an array
    if (video.tags && typeof video.tags === 'string') {
      video.tags = video.tags.split(',').map(tag => tag.trim());
    }

    return video;
  }

  /**
   * Get current table fields (to handle missing fields gracefully)
   * @param {string} tableName - Name of the table
   * @returns {Array} Array of field names
   */
  async getCurrentTableFields(tableName) {
    try {
      const schema = await airtable.getTableSchema(tableName);
      return schema.fields || [];
    } catch (error) {
      logger.warn(`Could not get table schema for ${tableName}:`, error.message);
      // Return common fields as fallback
      return ['Id', 'youtube_url', 'videoid', 'video_title', 'channel_name', 'Last Modified'];
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
      const currentFields = await this.getCurrentTableFields('Videos');
      if (currentFields.includes('status')) {
        await airtable.update('Videos', videoId, {
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

      // Check if video exists and belongs to user
      const record = await airtable.findById('Videos', id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      // Check ownership first
      if (record.fields.user_id && record.fields.user_id[0] !== userId) {
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

      // Check if video exists and belongs to user
      const record = await airtable.findById('Videos', id);
      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      if (record.fields.user_id && record.fields.user_id[0] !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      // Reset status and trigger processing
      const currentFields = await this.getCurrentTableFields('Videos');
      if (currentFields.includes('status')) {
        await airtable.update('Videos', id, {
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
}

module.exports = new VideosController();