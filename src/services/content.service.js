const { contentType, videoContent } = require('../models');
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
      const content = await videoContent.getByVideo(videoId, options);
      logger.info(`Retrieved ${content.length} content items for video ${videoId}`);
      return content;
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
      const content = await videoContent.getByVideoAndType(videoId, contentTypeKey, options);

      if (content) {
        logger.info(`Retrieved ${contentTypeKey} content for video ${videoId}`);
      } else {
        logger.info(`No ${contentTypeKey} content found for video ${videoId}`);
      }

      return content;
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

      // Get content type
      const contentTypeRecord = await this.getContentTypeByKey(contentTypeKey);
      if (!contentTypeRecord) {
        throw new Error(`Content type '${contentTypeKey}' not found`);
      }

      // Prepare data for model
      const modelData = {
        video_id: videoId,
        content_type_id: contentTypeRecord.id,
        content_text: contentText,
        content_url: contentUrl,
        ai_provider: aiProvider,
        prompt_used_id: promptUsedId,
        generation_status: generationStatus,
        is_published: isPublished,
        created_by_user_id: createdByUserId,
        generation_duration_seconds: generationDurationSeconds,
        content_quality_score: contentQualityScore
      };

      // Use model's versioned create method
      const createdContent = await videoContent.createVersioned(modelData);

      logger.info(`Created ${contentTypeKey} content for video ${videoId} (version ${createdContent.version})`);
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

      // Prepare data for model update
      const modelUpdateData = {};

      if (contentText !== undefined) {
        modelUpdateData.content_text = contentText;
      }

      if (contentUrl !== undefined) {
        modelUpdateData.content_url = contentUrl;
      }

      if (generationStatus !== undefined) {
        modelUpdateData.generation_status = generationStatus;
      }

      if (isPublished !== undefined) {
        modelUpdateData.is_published = isPublished;
      }

      if (contentQualityScore !== undefined) {
        modelUpdateData.content_quality_score = contentQualityScore;
      }

      if (userRating !== undefined) {
        modelUpdateData.user_rating = userRating;
      }

      if (Object.keys(modelUpdateData).length === 0) {
        throw new Error('No fields to update');
      }

      // Use model's update method
      const updatedContent = await videoContent.update(contentId, modelUpdateData);

      if (!updatedContent) {
        throw new Error(`Content with ID ${contentId} not found`);
      }

      logger.info(`Updated video content ${contentId}`);
      return updatedContent;

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
      const deleted = await videoContent.delete(contentId);

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
      return await contentType.findByKey(key);
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
      const types = await contentType.getActive();
      logger.info(`Retrieved ${types.length} available content types`);
      return types;
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

      // Use model's statistics method with filters
      const filters = {};
      if (userId) filters.userId = userId;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      const stats = await videoContent.getStatistics(filters);

      logger.info('Retrieved content generation statistics');
      return {
        contentTypes: stats,
        totalItems: stats.reduce((sum, row) => sum + row.total_generated, 0)
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
      // Use model's legacy format method
      const legacyFormat = await videoContent.getLegacyFormat(videoId);

      logger.info(`Retrieved video content in legacy format for video ${videoId}`);
      return legacyFormat;

    } catch (error) {
      logger.error(`Error getting video content in legacy format for video ${videoId}:`, error);
      throw error;
    }
  }

}

module.exports = new ContentService();
