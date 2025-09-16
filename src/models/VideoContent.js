const BaseModel = require('./BaseModel');

/**
 * VideoContent Model
 * Manages video content with rich metadata and relationships
 */
class VideoContent extends BaseModel {
  constructor() {
    super('video_content');

    // Define fillable fields (mass assignable)
    this.fillable = [
      'video_id',
      'content_type_id',
      'content_text',
      'content_url',
      'ai_provider',
      'prompt_used_id',
      'generation_status',
      'generation_started_at',
      'generation_completed_at',
      'generation_duration_seconds',
      'content_quality_score',
      'user_rating',
      'is_published',
      'version',
      'parent_content_id',
      'created_by_user_id'
    ];

    // Fields to hide from JSON output
    this.hidden = [];

    // Type casting rules
    this.casts = {
      video_id: 'integer',
      content_type_id: 'integer',
      prompt_used_id: 'integer',
      generation_duration_seconds: 'integer',
      content_quality_score: 'float',
      user_rating: 'integer',
      is_published: 'boolean',
      version: 'integer',
      parent_content_id: 'integer',
      created_by_user_id: 'integer',
      generation_started_at: 'date',
      generation_completed_at: 'date'
    };

    // Validation rules
    this.validationRules = {
      required: ['video_id', 'content_type_id']
    };
  }

  /**
   * Get all content for a video
   * @param {number} videoId - Video ID
   * @param {object} options - Query options
   * @returns {Promise<Array>}
   */
  async getByVideo(videoId, options = {}) {
    try {
      const { publishedOnly = true, includeMetadata = false } = options;

      let query = `
        SELECT 
          vc.*,
          ct.key as content_type_key,
          ct.label as content_type_label,
          ct.icon as content_type_icon,
          ct.description as content_type_description,
          ct.display_order
          ${includeMetadata ? `, 
            v.video_title,
            u.first_name,
            u.last_name` : ''}
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        ${includeMetadata ? `
          LEFT JOIN videos v ON vc.video_id = v.id
          LEFT JOIN users u ON vc.created_by_user_id = u.id` : ''}
        WHERE vc.video_id = $1
        ${publishedOnly ? 'AND vc.is_published = true' : ''}
        AND ct.is_active = true
        ORDER BY ct.display_order ASC, vc.version DESC
      `;

      const result = await this.query(query, [videoId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      throw new Error(`Failed to get content for video ${videoId}: ${error.message}`);
    }
  }

  /**
   * Get specific content type for a video
   * @param {number} videoId - Video ID
   * @param {string} contentTypeKey - Content type key
   * @param {object} options - Query options
   * @returns {Promise<object|null>}
   */
  async getByVideoAndType(videoId, contentTypeKey, options = {}) {
    try {
      const { version = 1, publishedOnly = true } = options;

      const query = `
        SELECT 
          vc.*,
          ct.key as content_type_key,
          ct.label as content_type_label,
          ct.icon as content_type_icon,
          ct.requires_ai
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        WHERE vc.video_id = $1 
        AND ct.key = $2 
        AND vc.version = $3
        ${publishedOnly ? 'AND vc.is_published = true' : ''}
        AND ct.is_active = true
      `;

      const result = await this.query(query, [videoId, contentTypeKey, version]);
      return result.rows.length > 0 ? this.formatOutput(result.rows[0]) : null;
    } catch (error) {
      throw new Error(`Failed to get ${contentTypeKey} for video ${videoId}: ${error.message}`);
    }
  }

  /**
   * Create content with automatic versioning
   * @param {object} data - Content data
   * @returns {Promise<object>}
   */
  async createVersioned(data) {
    try {
      // Check for existing content of same type for this video
      const existingQuery = `
        SELECT MAX(version) as max_version 
        FROM video_content 
        WHERE video_id = $1 AND content_type_id = $2
      `;

      const existingResult = await this.query(existingQuery, [data.video_id, data.content_type_id]);
      const maxVersion = existingResult.rows[0].max_version || 0;

      // Set version to max + 1
      data.version = maxVersion + 1;

      // Set defaults
      data.generation_status = data.generation_status || 'completed';
      data.is_published = data.is_published !== undefined ? data.is_published : true;

      return await this.create(data);
    } catch (error) {
      throw new Error(`Failed to create versioned content: ${error.message}`);
    }
  }

  /**
   * Update content generation status
   * @param {number} id - Content ID
   * @param {string} status - New status (pending, generating, completed, failed)
   * @param {object} metadata - Additional metadata
   * @returns {Promise<object|null>}
   */
  async updateGenerationStatus(id, status, metadata = {}) {
    try {
      const updateData = { generation_status: status };

      // Set timestamps based on status
      if (status === 'generating') {
        updateData.generation_started_at = new Date();
      } else if (status === 'completed' || status === 'failed') {
        updateData.generation_completed_at = new Date();

        // Calculate duration if we have start time
        const existing = await this.findById(id);
        if (existing && existing.generation_started_at) {
          const startTime = new Date(existing.generation_started_at);
          const endTime = new Date();
          updateData.generation_duration_seconds = Math.round((endTime - startTime) / 1000);
        }
      }

      // Add any additional metadata
      Object.assign(updateData, metadata);

      return await this.update(id, updateData);
    } catch (error) {
      throw new Error(`Failed to update generation status: ${error.message}`);
    }
  }

  /**
   * Get content statistics by type
   * @param {object} filters - Filter options (userId, dateRange, etc.)
   * @returns {Promise<Array>}
   */
  async getStatistics(filters = {}) {
    try {
      let whereConditions = ['ct.is_active = true'];
      const queryParams = [];
      let paramIndex = 1;

      if (filters.userId) {
        whereConditions.push(`v.users_id = $${paramIndex}`);
        queryParams.push(filters.userId);
        paramIndex++;
      }

      if (filters.startDate) {
        whereConditions.push(`vc.created_at >= $${paramIndex}`);
        queryParams.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        whereConditions.push(`vc.created_at <= $${paramIndex}`);
        queryParams.push(filters.endDate);
        paramIndex++;
      }

      const query = `
        SELECT 
          ct.key,
          ct.label,
          ct.icon,
          COUNT(*) as total_generated,
          COUNT(CASE WHEN vc.generation_status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN vc.generation_status = 'failed' THEN 1 END) as failed,
          AVG(vc.generation_duration_seconds) as avg_generation_time,
          AVG(vc.content_quality_score) as avg_quality_score,
          AVG(vc.user_rating) as avg_user_rating,
          COUNT(DISTINCT vc.video_id) as unique_videos
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        JOIN videos v ON vc.video_id = v.id
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY ct.id, ct.key, ct.label, ct.icon, ct.display_order
        ORDER BY ct.display_order ASC
      `;

      const result = await this.query(query, queryParams);
      return result.rows.map(row => ({
        ...row,
        total_generated: parseInt(row.total_generated),
        completed: parseInt(row.completed),
        failed: parseInt(row.failed),
        avg_generation_time: row.avg_generation_time ? parseFloat(row.avg_generation_time) : null,
        avg_quality_score: row.avg_quality_score ? parseFloat(row.avg_quality_score) : null,
        avg_user_rating: row.avg_user_rating ? parseFloat(row.avg_user_rating) : null,
        unique_videos: parseInt(row.unique_videos)
      }));
    } catch (error) {
      throw new Error(`Failed to get content statistics: ${error.message}`);
    }
  }

  /**
   * Get content versions for a video and content type
   * @param {number} videoId - Video ID
   * @param {number} contentTypeId - Content type ID
   * @returns {Promise<Array>}
   */
  async getVersions(videoId, contentTypeId) {
    try {
      const query = `
        SELECT 
          vc.*,
          ct.label as content_type_label,
          u.first_name,
          u.last_name
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        LEFT JOIN users u ON vc.created_by_user_id = u.id
        WHERE vc.video_id = $1 AND vc.content_type_id = $2
        ORDER BY vc.version DESC
      `;

      const result = await this.query(query, [videoId, contentTypeId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      throw new Error(`Failed to get content versions: ${error.message}`);
    }
  }

  /**
   * Get content in legacy format for backward compatibility
   * @param {number} videoId - Video ID
   * @returns {Promise<object>}
   */
  async getLegacyFormat(videoId) {
    try {
      const content = await this.getByVideo(videoId, { publishedOnly: true });

      // Transform to old format expected by existing code
      const legacyFormat = {};

      content.forEach(item => {
        const key = item.content_type_key;

        // Map to old field names for backward compatibility
        if (key === 'chapters_text') {
          // Special case: chapters_text in API maps to chapter_text in old schema
          legacyFormat['chapter_text'] = item.content_text;
          legacyFormat['chapter_url'] = item.content_url;
        } else {
          legacyFormat[key] = item.content_text;
          legacyFormat[key.replace('_text', '_url')] = item.content_url;
        }
      });

      return legacyFormat;
    } catch (error) {
      throw new Error(`Failed to get content in legacy format: ${error.message}`);
    }
  }

  /**
   * Enhanced validation with business rules
   * @param {object} data - Data to validate
   * @param {boolean} isUpdate - Whether this is an update
   */
  validate(data, isUpdate = false) {
    super.validate(data, isUpdate);

    // Must have either content_text or content_url
    if (!isUpdate || data.content_text !== undefined || data.content_url !== undefined) {
      if (!data.content_text && !data.content_url) {
        throw new Error('Either content_text or content_url must be provided');
      }
    }

    // Quality score validation
    if (data.content_quality_score !== undefined) {
      const score = parseFloat(data.content_quality_score);
      if (isNaN(score) || score < 0 || score > 5) {
        throw new Error('Content quality score must be between 0 and 5');
      }
    }

    // User rating validation
    if (data.user_rating !== undefined) {
      const rating = parseInt(data.user_rating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        throw new Error('User rating must be between 1 and 5');
      }
    }

    // Generation status validation
    if (data.generation_status) {
      const validStatuses = ['pending', 'generating', 'completed', 'failed'];
      if (!validStatuses.includes(data.generation_status)) {
        throw new Error(`Generation status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    // AI provider validation
    if (data.ai_provider) {
      const validProviders = ['gemini', 'chatgpt', 'claude', 'none'];
      if (!validProviders.includes(data.ai_provider)) {
        throw new Error(`AI provider must be one of: ${validProviders.join(', ')}`);
      }
    }
  }

  /**
   * Publish content (set is_published = true)
   * @param {number} id - Content ID
   * @returns {Promise<object|null>}
   */
  async publish(id) {
    return await this.update(id, { is_published: true });
  }

  /**
   * Unpublish content (set is_published = false)
   * @param {number} id - Content ID
   * @returns {Promise<object|null>}
   */
  async unpublish(id) {
    return await this.update(id, { is_published: false });
  }

  /**
   * Rate content
   * @param {number} id - Content ID
   * @param {number} rating - Rating (1-5)
   * @returns {Promise<object|null>}
   */
  async rate(id, rating) {
    return await this.update(id, { user_rating: rating });
  }
}

module.exports = VideoContent;
