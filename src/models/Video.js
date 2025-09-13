const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * Video Model - Handles all video-related database operations
 * Extends BaseModel to inherit standard CRUD operations
 */
class Video extends BaseModel {
  constructor() {
    super();
    this.tableName = 'videos';
    this.primaryKey = 'id';
    
    // Define video-specific validation rules
    this.validationRules = {
      videoid: { required: true, type: 'string' },
      video_title: { required: true, type: 'string' },
      users_id: { required: true, type: 'integer' },
      youtube_url: { required: false, type: 'string' },
      channel_name: { required: false, type: 'string' },
      channel_handle: { required: false, type: 'string' },
      description: { required: false, type: 'string' },
      duration: { required: false, type: 'integer' },
      upload_date: { required: false, type: 'date' },
      thumbnail_url: { required: false, type: 'string' },
      status: { required: false, type: 'string', default: 'pending' },
      category: { required: false, type: 'string', default: 'general' },
      privacy_setting: { required: false, type: 'string', default: 'public' }
    };

    // Define allowed status values
    this.allowedStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    this.allowedCategories = ['general', 'education', 'entertainment', 'business', 'technology'];
    this.allowedPrivacySettings = ['public', 'unlisted', 'private'];
  }

  /**
   * Get videos for a specific user with filtering and pagination
   */
  async getVideosByUser(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        search,
        category,
        includeContent = false
      } = options;

      // Validate userId
      if (!userId || (!Number.isInteger(userId) && isNaN(parseInt(userId)))) {
        throw new Error('Valid user ID is required');
      }

      const actualUserId = parseInt(userId);

      // Build conditions for BaseModel
      const conditions = {
        users_id: actualUserId
      };

      // Add optional filters
      if (status && this.allowedStatuses.includes(status)) {
        conditions.status = status;
      }

      if (category && this.allowedCategories.includes(category)) {
        conditions.category = category;
      }

      // Build query options
      const queryOptions = {
        page,
        limit,
        orderBy: 'created_at DESC'
      };

      // Add search if provided
      if (search && search.trim()) {
        queryOptions.searchFields = ['video_title', 'description', 'channel_name'];
        queryOptions.searchTerm = search.trim();
        queryOptions.caseInsensitive = true;
      }

      // Use BaseModel's advanced pagination method or include content if requested
      let result;
      if (includeContent) {
        // Join with video_content table to get content data
        const database = require('../services/database.service');
        
        // Build the query with content joins
        let whereClause = `v.users_id = $1`;
        let params = [actualUserId];
        let paramIndex = 2;
        
        if (status && this.allowedStatuses.includes(status)) {
          whereClause += ` AND v.status = $${paramIndex}`;
          params.push(status);
          paramIndex++;
        }
        
        if (category && this.allowedCategories.includes(category)) {
          whereClause += ` AND v.category = $${paramIndex}`;
          params.push(category);
          paramIndex++;
        }
        
        if (search && search.trim()) {
          whereClause += ` AND (v.video_title ILIKE $${paramIndex} OR v.description ILIKE $${paramIndex} OR v.channel_name ILIKE $${paramIndex})`;
          params.push(`%${search.trim()}%`);
          paramIndex++;
        }
        
        // Calculate offset and add pagination
        const offset = (page - 1) * limit;
        
        // Query to get videos with aggregated content (includes transcript from videos table)
        const videosQuery = `
          SELECT v.*,
            COALESCE(
              json_object_agg(
                ct.key, 
                CASE WHEN vc.content_text IS NOT NULL AND vc.content_text != '' 
                     THEN vc.content_text 
                     ELSE NULL END
              ) FILTER (WHERE ct.key IS NOT NULL),
              '{}'::json
            ) as content_data
          FROM videos v
          LEFT JOIN video_content vc ON v.id = vc.video_id
          LEFT JOIN content_types ct ON vc.content_type_id = ct.id
          WHERE ${whereClause}
          GROUP BY v.id
          ORDER BY v.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        
        params.push(limit, offset);
        
        // Get total count (use same whereClause and params except limit/offset)
        const countQuery = `
          SELECT COUNT(DISTINCT v.id) as total
          FROM videos v
          WHERE ${whereClause}
        `;
        const countParams = params.slice(0, -2); // Remove limit and offset
        
        const [videosResult, countResult] = await Promise.all([
          database.query(videosQuery, params),
          database.query(countQuery, countParams)
        ]);
        
        const videos = videosResult.rows.map(row => {
          const { content_data, ...videoData } = row;
          // Merge content data into the video object for compatibility
          // Also include transcript from videos table if it exists
          const mergedData = {
            ...videoData,
            ...content_data
          };
          
          // Add transcript from videos table if it exists
          if (videoData.transcript_text && videoData.transcript_text.trim()) {
            mergedData.transcript_text = videoData.transcript_text;
          }
          
          return mergedData;
        });
        
        const totalRecords = parseInt(countResult.rows[0].total);
        const totalPages = Math.ceil(totalRecords / limit);
        
        result = {
          data: videos,
          pagination: {
            currentPage: page,
            totalPages,
            totalRecords,
            hasMore: page < totalPages,
            startIndex: totalRecords > 0 ? offset + 1 : 0,
            endIndex: Math.min(offset + limit, totalRecords)
          }
        };
      } else {
        // Use BaseModel's standard pagination without content
        result = await this.findAllWithPagination(conditions, queryOptions);
      }

      return {
        videos: result.data,
        pagination: result.pagination
      };

    } catch (error) {
      logger.error('Error in Video.getVideosByUser:', error);
      throw error;
    }
  }

  /**
   * Find video by YouTube video ID
   */
  async findByVideoId(videoId) {
    try {
      if (!videoId) {
        throw new Error('Video ID is required');
      }

      const query = `SELECT * FROM ${this.tableName} WHERE videoid = $1`;
      const result = await database.query(query, [videoId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding video by videoid ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Find videos by YouTube video ID (can return multiple)
   */
  async findAllByVideoId(videoId) {
    try {
      if (!videoId) {
        throw new Error('Video ID is required');
      }

      const query = `SELECT * FROM ${this.tableName} WHERE videoid = $1 ORDER BY created_at DESC`;
      const result = await database.query(query, [videoId]);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error finding videos by videoid ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Get video with user ownership validation
   */
  async getVideoByIdAndUser(videoId, userId) {
    try {
      if (!videoId || !userId) {
        throw new Error('Video ID and User ID are required');
      }

      const actualUserId = parseInt(userId);
      const query = `SELECT * FROM ${this.tableName} WHERE id = $1 AND users_id = $2`;
      const result = await database.query(query, [videoId, actualUserId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding video ${videoId} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new video with validation
   */
  async createVideo(videoData) {
    try {
      // Validate required fields
      if (!videoData.videoid || !videoData.video_title || !videoData.users_id) {
        throw new Error('videoid, video_title, and users_id are required');
      }

      // Set defaults
      const processedData = {
        status: 'pending',
        category: 'general',
        privacy_setting: 'public',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...videoData
      };

      // Validate status, category, privacy_setting
      if (processedData.status && !this.allowedStatuses.includes(processedData.status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }
      
      if (processedData.category && !this.allowedCategories.includes(processedData.category)) {
        throw new Error(`Invalid category. Allowed values: ${this.allowedCategories.join(', ')}`);
      }
      
      if (processedData.privacy_setting && !this.allowedPrivacySettings.includes(processedData.privacy_setting)) {
        throw new Error(`Invalid privacy setting. Allowed values: ${this.allowedPrivacySettings.join(', ')}`);
      }

      return await this.create(processedData);
    } catch (error) {
      logger.error('Error creating video:', error);
      throw error;
    }
  }

  /**
   * Update video with validation
   */
  async updateVideo(id, updateData) {
    try {
      if (!id) {
        throw new Error('Video ID is required');
      }

      // Filter out sensitive/read-only fields
      const safeUpdateData = { ...updateData };
      delete safeUpdateData.id;
      delete safeUpdateData.created_at;
      delete safeUpdateData.users_id; // Don't allow changing ownership
      
      // Set updated timestamp
      safeUpdateData.updated_at = new Date().toISOString();

      // Validate status, category, privacy_setting if provided
      if (safeUpdateData.status && !this.allowedStatuses.includes(safeUpdateData.status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }
      
      if (safeUpdateData.category && !this.allowedCategories.includes(safeUpdateData.category)) {
        throw new Error(`Invalid category. Allowed values: ${this.allowedCategories.join(', ')}`);
      }
      
      if (safeUpdateData.privacy_setting && !this.allowedPrivacySettings.includes(safeUpdateData.privacy_setting)) {
        throw new Error(`Invalid privacy setting. Allowed values: ${this.allowedPrivacySettings.join(', ')}`);
      }

      return await this.update(id, safeUpdateData);
    } catch (error) {
      logger.error(`Error updating video ${id}:`, error);
      throw error;
    }
  }

  /**
   * Update video status
   */
  async updateStatus(id, status, additionalData = {}) {
    try {
      if (!id || !status) {
        throw new Error('Video ID and status are required');
      }

      if (!this.allowedStatuses.includes(status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      const updateData = {
        status,
        updated_at: new Date().toISOString(),
        ...additionalData
      };

      return await this.update(id, updateData);
    } catch (error) {
      logger.error(`Error updating video ${id} status to ${status}:`, error);
      throw error;
    }
  }

  /**
   * Delete video with user ownership validation
   */
  async deleteVideoByUser(id, userId) {
    try {
      if (!id || !userId) {
        throw new Error('Video ID and User ID are required');
      }

      // First verify ownership
      const video = await this.getVideoByIdAndUser(id, userId);
      if (!video) {
        throw new Error('Video not found or access denied');
      }

      return await this.delete(id);
    } catch (error) {
      logger.error(`Error deleting video ${id} for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get videos by status
   */
  async getVideosByStatus(status, limit = 50) {
    try {
      if (!status || !this.allowedStatuses.includes(status)) {
        throw new Error(`Invalid status. Allowed values: ${this.allowedStatuses.join(', ')}`);
      }

      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE status = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      const result = await database.query(query, [status, limit]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting videos by status ${status}:`, error);
      throw error;
    }
  }

  /**
   * Get video statistics by provider
   */
  async getProviderStatistics() {
    try {
      const query = `
        SELECT 
          COALESCE(ai_provider, 'none') as provider,
          COUNT(*) as count
        FROM ${this.tableName}
        GROUP BY ai_provider
        ORDER BY count DESC
      `;
      
      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting provider statistics:', error);
      throw error;
    }
  }

  /**
   * Format video record for API response
   */
  formatVideoResponse(record) {
    const formatted = this.formatOutput(record);
    
    // Add any additional formatting for API responses
    return {
      ...formatted,
      // Ensure consistent field names for frontend
      videoId: formatted.videoid,
      title: formatted.video_title,
      channelName: formatted.channel_name,
      youtubeUrl: formatted.youtube_url,
      thumbnailUrl: formatted.thumbnail_url,
      uploadDate: formatted.upload_date,
      createdAt: formatted.created_at,
      updatedAt: formatted.updated_at
    };
  }

  /**
   * Validate video data before save
   */
  validateVideoData(data) {
    const errors = [];

    // Required field validation
    if (!data.videoid) errors.push('videoid is required');
    if (!data.video_title) errors.push('video_title is required');
    if (!data.users_id) errors.push('users_id is required');

    // Format validation
    if (data.duration && (!Number.isInteger(data.duration) && isNaN(parseInt(data.duration)))) {
      errors.push('duration must be a number');
    }

    if (data.youtube_url && !data.youtube_url.includes('youtube.com') && !data.youtube_url.includes('youtu.be')) {
      errors.push('youtube_url must be a valid YouTube URL');
    }

    // Enum validation
    if (data.status && !this.allowedStatuses.includes(data.status)) {
      errors.push(`status must be one of: ${this.allowedStatuses.join(', ')}`);
    }

    if (data.category && !this.allowedCategories.includes(data.category)) {
      errors.push(`category must be one of: ${this.allowedCategories.join(', ')}`);
    }

    if (data.privacy_setting && !this.allowedPrivacySettings.includes(data.privacy_setting)) {
      errors.push(`privacy_setting must be one of: ${this.allowedPrivacySettings.join(', ')}`);
    }

    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }

    return true;
  }
}

module.exports = Video;