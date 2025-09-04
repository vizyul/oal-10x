const { logger } = require('../utils');
const airtable = require('../services/airtable.service');
const { validationResult } = require('express-validator');

class VideosController {
  /**
   * Get all videos for the authenticated user
   * GET /api/videos
   */
  async getVideos(req, res) {
    try {
      const { page = 1, limit = 10, status, search, category } = req.query;
      const userId = req.user.id;

      logger.info(`Fetching videos for user ${userId}`, { page, limit, status, search, category });

      // Build filter options - use user_id field if available, fallback to no filter for existing data
      let filterFormula = '';
      
      try {
        // Try to filter by user_id (new field)
        filterFormula = `{user_id} = "${userId}"`;
      } catch (error) {
        // If user_id field doesn't exist yet, get all records (temporary)
        logger.warn('user_id field not available yet, returning all videos');
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

      const options = {
        sort: [{ field: 'created_at', direction: 'desc' }, { field: 'Last Modified', direction: 'desc' }],
        maxRecords: parseInt(limit) * parseInt(page)
      };

      if (filterFormula) {
        options.filterByFormula = filterFormula;
      }

      const records = await airtable.findAll('Videos', options);
      
      // Simple pagination (slice results)
      const startIndex = (parseInt(page) - 1) * parseInt(limit);
      const endIndex = startIndex + parseInt(limit);
      const paginatedRecords = records.slice(startIndex, endIndex);

      const videos = paginatedRecords.map(record => this.formatVideoResponse(record));

      res.json({
        success: true,
        data: {
          videos,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: records.length,
            hasMore: endIndex < records.length
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching videos:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch videos',
        error: error.message
      });
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
      if (record.fields.user_id && record.fields.user_id !== userId) {
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
          video.fields.user_id === userId || !video.fields.user_id // temporary: allow if no user_id set
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
        
        // Enhanced fields (will be ignored if fields don't exist yet)
        description: description || metadata?.description || '',
        duration: metadata?.duration || 0,
        upload_date: metadata?.publishedAt || new Date().toISOString(),
        thumbnail_url: metadata?.thumbnails?.[0]?.url || '',
        
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
        user_id: userId
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

      const record = await airtable.create('Videos', safeVideoData);
      const video = this.formatVideoResponse(record);

      // If we have metadata, trigger processing
      if (metadata) {
        try {
          await this.triggerVideoProcessing(record.id, metadata);
        } catch (processingError) {
          logger.warn('Could not trigger processing:', processingError.message);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Video created successfully',
        data: { video }
      });

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
      if (existingRecord.fields.user_id && existingRecord.fields.user_id !== userId) {
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
   * Format video record for API response
   * @param {Object} record - Airtable record
   * @returns {Object} Formatted video object
   */
  formatVideoResponse(record) {
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
      video.duration_formatted = this.formatDuration(video.duration);
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

      if (record.fields.user_id && record.fields.user_id !== userId) {
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

      if (record.fields.user_id && record.fields.user_id !== userId) {
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