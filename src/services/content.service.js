const database = require('./database.service');
const { logger } = require('../utils');

/**
 * Content Service - Manages normalized content storage
 * Replaces the fixed-column approach in the videos table
 */
class ContentService {
  
  /**
   * Get all content for a specific video
   * @param {number} videoId - Video ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of content items
   */
  async getVideoContent(videoId, options = {}) {
    try {
      const { publishedOnly = true, includeMetadata = false } = options;
      
      let query = `
        SELECT 
          vc.id,
          vc.video_id,
          vc.content_text,
          vc.content_url,
          vc.generation_status,
          vc.is_published,
          vc.version,
          vc.created_at,
          vc.updated_at,
          ct.key as content_type_key,
          ct.label as content_type_label,
          ct.icon as content_type_icon,
          ct.description as content_type_description,
          ct.display_order
          ${includeMetadata ? `, 
            vc.ai_provider,
            vc.generation_duration_seconds,
            vc.content_quality_score,
            vc.user_rating` : ''}
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        WHERE vc.video_id = $1
        ${publishedOnly ? 'AND vc.is_published = true' : ''}
        AND ct.is_active = true
        ORDER BY ct.display_order, vc.version DESC
      `;
      
      const result = await database.query(query, [videoId]);
      
      logger.info(`Retrieved ${result.rows.length} content items for video ${videoId}`);
      return result.rows;
      
    } catch (error) {
      logger.error(`Error getting video content for video ${videoId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get specific content type for a video
   * @param {number} videoId - Video ID
   * @param {string} contentTypeKey - Content type key (e.g., 'summary_text')
   * @param {object} options - Query options
   * @returns {Promise<object|null>} Content item or null
   */
  async getVideoContentByType(videoId, contentTypeKey, options = {}) {
    try {
      const { version = 1, publishedOnly = true } = options;
      
      const query = `
        SELECT 
          vc.id,
          vc.video_id,
          vc.content_text,
          vc.content_url,
          vc.generation_status,
          vc.is_published,
          vc.version,
          vc.ai_provider,
          vc.generation_duration_seconds,
          vc.content_quality_score,
          vc.user_rating,
          vc.created_at,
          vc.updated_at,
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
      
      const result = await database.query(query, [videoId, contentTypeKey, version]);
      
      if (result.rows.length > 0) {
        logger.info(`Retrieved ${contentTypeKey} content for video ${videoId}`);
        return result.rows[0];
      }
      
      logger.info(`No ${contentTypeKey} content found for video ${videoId}`);
      return null;
      
    } catch (error) {
      logger.error(`Error getting ${contentTypeKey} content for video ${videoId}:`, error);
      throw error;
    }
  }
  
  /**
   * Create new content for a video
   * @param {object} contentData - Content data
   * @returns {Promise<object>} Created content item
   */
  async createVideoContent(contentData) {
    try {
      const {
        videoId,
        contentTypeKey,
        contentText = null,
        contentUrl = null,
        aiProvider = null,
        promptUsedId = null,
        generationStatus = 'completed',
        isPublished = true,
        createdByUserId = null,
        generationDurationSeconds = null,
        contentQualityScore = null
      } = contentData;
      
      // Validate required fields
      if (!videoId || !contentTypeKey) {
        throw new Error('videoId and contentTypeKey are required');
      }
      
      if (!contentText && !contentUrl) {
        throw new Error('Either contentText or contentUrl must be provided');
      }
      
      // Get content type ID
      const contentType = await this.getContentTypeByKey(contentTypeKey);
      if (!contentType) {
        throw new Error(`Content type '${contentTypeKey}' not found`);
      }
      
      // Check for existing content (enforce unique constraint)
      const existing = await this.getVideoContentByType(videoId, contentTypeKey, { 
        version: 1, 
        publishedOnly: false 
      });
      
      let version = 1;
      if (existing) {
        // Create new version
        version = existing.version + 1;
      }
      
      const query = `
        INSERT INTO video_content (
          video_id, content_type_id, content_text, content_url,
          ai_provider, prompt_used_id, generation_status, is_published,
          version, created_by_user_id, generation_duration_seconds,
          content_quality_score, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *
      `;
      
      const values = [
        videoId,
        contentType.id,
        contentText,
        contentUrl,
        aiProvider,
        promptUsedId,
        generationStatus,
        isPublished,
        version,
        createdByUserId,
        generationDurationSeconds,
        contentQualityScore
      ];
      
      const result = await database.query(query, values);
      const createdContent = result.rows[0];
      
      logger.info(`Created ${contentTypeKey} content for video ${videoId} (version ${version})`);
      return createdContent;
      
    } catch (error) {
      logger.error('Error creating video content:', error);
      throw error;
    }
  }
  
  /**
   * Update existing video content
   * @param {number} contentId - Content ID
   * @param {object} updateData - Update data
   * @returns {Promise<object>} Updated content item
   */
  async updateVideoContent(contentId, updateData) {
    try {
      const {
        contentText,
        contentUrl,
        generationStatus,
        isPublished,
        contentQualityScore,
        userRating
      } = updateData;
      
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (contentText !== undefined) {
        updateFields.push(`content_text = $${paramIndex++}`);
        updateValues.push(contentText);
      }
      
      if (contentUrl !== undefined) {
        updateFields.push(`content_url = $${paramIndex++}`);
        updateValues.push(contentUrl);
      }
      
      if (generationStatus !== undefined) {
        updateFields.push(`generation_status = $${paramIndex++}`);
        updateValues.push(generationStatus);
      }
      
      if (isPublished !== undefined) {
        updateFields.push(`is_published = $${paramIndex++}`);
        updateValues.push(isPublished);
      }
      
      if (contentQualityScore !== undefined) {
        updateFields.push(`content_quality_score = $${paramIndex++}`);
        updateValues.push(contentQualityScore);
      }
      
      if (userRating !== undefined) {
        updateFields.push(`user_rating = $${paramIndex++}`);
        updateValues.push(userRating);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(contentId);
      
      const query = `
        UPDATE video_content 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      const result = await database.query(query, updateValues);
      
      if (result.rows.length === 0) {
        throw new Error(`Content with ID ${contentId} not found`);
      }
      
      logger.info(`Updated video content ${contentId}`);
      return result.rows[0];
      
    } catch (error) {
      logger.error(`Error updating video content ${contentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Delete video content
   * @param {number} contentId - Content ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteVideoContent(contentId) {
    try {
      const result = await database.query(
        'DELETE FROM video_content WHERE id = $1',
        [contentId]
      );
      
      const deleted = result.rowCount > 0;
      if (deleted) {
        logger.info(`Deleted video content ${contentId}`);
      } else {
        logger.warn(`No content found with ID ${contentId} to delete`);
      }
      
      return deleted;
      
    } catch (error) {
      logger.error(`Error deleting video content ${contentId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get content type by key
   * @param {string} key - Content type key
   * @returns {Promise<object|null>} Content type or null
   */
  async getContentTypeByKey(key) {
    try {
      const result = await database.query(
        'SELECT * FROM content_types WHERE key = $1 AND is_active = true',
        [key]
      );
      
      return result.rows.length > 0 ? result.rows[0] : null;
      
    } catch (error) {
      logger.error(`Error getting content type by key ${key}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all available content types
   * @returns {Promise<Array>} Array of content types
   */
  async getAvailableContentTypes() {
    try {
      const result = await database.query(`
        SELECT id, key, label, icon, description, display_order, requires_ai, has_url_field
        FROM content_types 
        WHERE is_active = true
        ORDER BY display_order
      `);
      
      logger.info(`Retrieved ${result.rows.length} available content types`);
      return result.rows;
      
    } catch (error) {
      logger.error('Error getting available content types:', error);
      throw error;
    }
  }
  
  /**
   * Get content statistics for analytics
   * @param {object} options - Query options
   * @returns {Promise<object>} Statistics object
   */
  async getContentStatistics(options = {}) {
    try {
      const { userId = null, startDate = null, endDate = null } = options;
      
      let whereConditions = [];
      let queryParams = [];
      let paramIndex = 1;
      
      if (userId) {
        whereConditions.push(`v.users_id = $${paramIndex++}`);
        queryParams.push(userId);
      }
      
      if (startDate) {
        whereConditions.push(`vc.created_at >= $${paramIndex++}`);
        queryParams.push(startDate);
      }
      
      if (endDate) {
        whereConditions.push(`vc.created_at <= $${paramIndex++}`);
        queryParams.push(endDate);
      }
      
      const whereClause = whereConditions.length > 0 ? 
        `WHERE ${whereConditions.join(' AND ')}` : '';
      
      const query = `
        SELECT 
          ct.label as content_type,
          ct.icon,
          COUNT(*) as total_generated,
          COUNT(CASE WHEN vc.generation_status = 'completed' THEN 1 END) as completed,
          COUNT(CASE WHEN vc.generation_status = 'failed' THEN 1 END) as failed,
          AVG(vc.generation_duration_seconds) as avg_generation_time,
          AVG(vc.content_quality_score) as avg_quality_score,
          AVG(vc.user_rating) as avg_user_rating
        FROM video_content vc
        JOIN content_types ct ON vc.content_type_id = ct.id
        JOIN videos v ON vc.video_id = v.id
        ${whereClause}
        GROUP BY ct.id, ct.label, ct.icon, ct.display_order
        ORDER BY ct.display_order
      `;
      
      const result = await database.query(query, queryParams);
      
      logger.info('Retrieved content generation statistics');
      return {
        contentTypes: result.rows,
        totalItems: result.rows.reduce((sum, row) => sum + parseInt(row.total_generated), 0)
      };
      
    } catch (error) {
      logger.error('Error getting content statistics:', error);
      throw error;
    }
  }

  /**
   * Legacy compatibility method - Get video content in old format
   * This bridges the gap during migration, returning content in the format expected by existing code
   * @param {number} videoId - Video ID
   * @returns {Promise<object>} Video content in old format
   */
  async getVideoContentLegacyFormat(videoId) {
    try {
      const content = await this.getVideoContent(videoId, { publishedOnly: true });
      
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
      
      logger.info(`Retrieved video content in legacy format for video ${videoId}`);
      return legacyFormat;
      
    } catch (error) {
      logger.error(`Error getting video content in legacy format for video ${videoId}:`, error);
      throw error;
    }
  }
  
}

module.exports = new ContentService();