const contentService = require('../services/content.service');
const documentGenerationService = require('../services/document-generation.service');
const { logger } = require('../utils');
const { validationResult } = require('express-validator');

/**
 * Content Controller - Handles normalized content operations
 */
class ContentController {

  /**
   * Get all available content types
   * GET /api/content/types
   */
  async getContentTypes(req, res) {
    try {
      const contentTypes = await contentService.getAvailableContentTypes();

      res.json({
        success: true,
        data: {
          contentTypes: contentTypes.map(ct => ({
            key: ct.key,
            label: ct.label,
            icon: ct.icon,
            description: ct.description,
            requiresAi: ct.requires_ai,
            hasUrlField: ct.has_url_field,
            displayOrder: ct.display_order
          }))
        }
      });

    } catch (error) {
      logger.error('Error getting content types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve content types',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get all content for a specific video
   * GET /api/content/videos/:videoId
   */
  async getVideoContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId } = req.params;
      const { includeMetadata = false, publishedOnly = true } = req.query;
      const userId = req.user.id;

      // Verify user owns this video
      const database = require('../services/database.service');
      const videoCheck = await database.query(
        'SELECT id FROM videos WHERE id = $1 AND users_id = $2',
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const content = await contentService.getVideoContent(videoId, {
        includeMetadata: includeMetadata === 'true',
        publishedOnly: publishedOnly === 'true'
      });

      res.json({
        success: true,
        data: {
          videoId: parseInt(videoId),
          content: content.map(item => ({
            id: item.id,
            contentType: {
              key: item.content_type_key,
              label: item.content_type_label,
              icon: item.content_type_icon,
              description: item.content_type_description,
              displayOrder: item.display_order
            },
            contentText: item.content_text,
            contentUrl: item.content_url,
            generationStatus: item.generation_status,
            isPublished: item.is_published,
            version: item.version,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            ...(includeMetadata === 'true' && {
              aiProvider: item.ai_provider,
              generationDurationSeconds: item.generation_duration_seconds,
              contentQualityScore: item.content_quality_score,
              userRating: item.user_rating
            })
          }))
        }
      });

    } catch (error) {
      logger.error('Error getting video content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve video content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get specific content type for a video
   * GET /api/content/videos/:videoId/:contentType
   */
  async getVideoContentByType(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId, contentType } = req.params;
      const { version = 1 } = req.query;
      const userId = req.user.id;

      // Verify user owns this video
      const database = require('../services/database.service');
      const videoCheck = await database.query(
        'SELECT id FROM videos WHERE id = $1 AND users_id = $2',
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const content = await contentService.getVideoContentByType(
        videoId,
        contentType,
        { version: parseInt(version), publishedOnly: true }
      );

      if (!content) {
        return res.status(404).json({
          success: false,
          message: `No ${contentType} content found for this video`
        });
      }

      res.json({
        success: true,
        data: {
          id: content.id,
          videoId: parseInt(videoId),
          contentType: {
            key: content.content_type_key,
            label: content.content_type_label,
            icon: content.content_type_icon
          },
          contentText: content.content_text,
          contentUrl: content.content_url,
          generationStatus: content.generation_status,
          isPublished: content.is_published,
          version: content.version,
          aiProvider: content.ai_provider,
          generationDurationSeconds: content.generation_duration_seconds,
          contentQualityScore: content.content_quality_score,
          userRating: content.user_rating,
          createdAt: content.created_at,
          updatedAt: content.updated_at
        }
      });

    } catch (error) {
      logger.error('Error getting video content by type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Create new content for a video
   * POST /api/content/videos/:videoId
   */
  async createVideoContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId } = req.params;
      const {
        contentTypeKey,
        contentText,
        contentUrl,
        aiProvider,
        generationStatus = 'completed',
        isPublished = true,
        contentQualityScore
      } = req.body;
      const userId = req.user.id;

      // Verify user owns this video
      const database = require('../services/database.service');
      const videoCheck = await database.query(
        'SELECT id FROM videos WHERE id = $1 AND users_id = $2',
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const content = await contentService.createVideoContent({
        videoId: parseInt(videoId),
        contentTypeKey,
        contentText,
        contentUrl,
        aiProvider,
        generationStatus,
        isPublished,
        createdByUserId: userId,
        contentQualityScore
      });

      logger.info(`Created ${contentTypeKey} content for video ${videoId} by user ${userId}`);

      res.status(201).json({
        success: true,
        data: {
          id: content.id,
          videoId: content.video_id,
          contentTypeKey,
          contentText: content.content_text,
          contentUrl: content.content_url,
          generationStatus: content.generation_status,
          isPublished: content.is_published,
          version: content.version,
          createdAt: content.created_at
        },
        message: 'Content created successfully'
      });

    } catch (error) {
      logger.error('Error creating video content:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to create content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Update existing content
   * PUT /api/content/:contentId
   */
  async updateVideoContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { contentId } = req.params;
      const updateData = req.body;
      const userId = req.user.id;

      // Verify user owns the video that this content belongs to
      const database = require('../services/database.service');
      const ownershipCheck = await database.query(`
        SELECT vc.id 
        FROM video_content vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1 AND v.users_id = $2
      `, [contentId, userId]);

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found or access denied'
        });
      }

      const updatedContent = await contentService.updateVideoContent(
        parseInt(contentId),
        updateData
      );

      logger.info(`Updated content ${contentId} by user ${userId}`);

      res.json({
        success: true,
        data: {
          id: updatedContent.id,
          contentText: updatedContent.content_text,
          contentUrl: updatedContent.content_url,
          generationStatus: updatedContent.generation_status,
          isPublished: updatedContent.is_published,
          contentQualityScore: updatedContent.content_quality_score,
          userRating: updatedContent.user_rating,
          updatedAt: updatedContent.updated_at
        },
        message: 'Content updated successfully'
      });

    } catch (error) {
      logger.error('Error updating video content:', error);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to update content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Delete content
   * DELETE /api/content/:contentId
   */
  async deleteVideoContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { contentId } = req.params;
      const userId = req.user.id;

      // Verify user owns the video that this content belongs to
      const database = require('../services/database.service');
      const ownershipCheck = await database.query(`
        SELECT vc.id 
        FROM video_content vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1 AND v.users_id = $2
      `, [contentId, userId]);

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found or access denied'
        });
      }

      const deleted = await contentService.deleteVideoContent(parseInt(contentId));

      if (deleted) {
        logger.info(`Deleted content ${contentId} by user ${userId}`);
        res.json({
          success: true,
          message: 'Content deleted successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

    } catch (error) {
      logger.error('Error deleting video content:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get content statistics
   * GET /api/content/statistics
   */
  async getContentStatistics(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { userId, startDate, endDate } = req.query;
      const requestingUserId = req.user.id;

      // If userId is specified and it's not the requesting user, check if they have admin access
      if (userId && parseInt(userId) !== requestingUserId) {
        // For now, only allow users to see their own statistics
        // In the future, add admin role check here
        return res.status(403).json({
          success: false,
          message: 'Access denied - can only view your own statistics'
        });
      }

      const statistics = await contentService.getContentStatistics({
        userId: userId ? parseInt(userId) : requestingUserId,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      });

      res.json({
        success: true,
        data: statistics
      });

    } catch (error) {
      logger.error('Error getting content statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Trigger AI content generation
   * POST /api/content/videos/:videoId/generate
   */
  async generateVideoContent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId } = req.params;
      const { contentTypes, aiProvider = 'gemini' } = req.body;
      const userId = req.user.id;

      // Verify user owns this video
      const database = require('../services/database.service');
      const videoCheck = await database.query(
        'SELECT id, video_title FROM videos WHERE id = $1 AND users_id = $2',
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      // Get video transcript for content generation
      const transcriptQuery = await database.query(
        'SELECT transcript_text FROM videos WHERE id = $1',
        [videoId]
      );

      if (transcriptQuery.rows.length === 0 || !transcriptQuery.rows[0].transcript_text) {
        return res.status(400).json({
          success: false,
          message: 'Video transcript not found - content generation requires transcript'
        });
      }

      const transcript = transcriptQuery.rows[0].transcript_text;

      // Actually call the content generation service
      logger.info(`Starting content generation for video ${videoId}, types: ${contentTypes.join(', ')}, provider: ${aiProvider}`);

      try {
        const contentGenerationService = require('../services/content-generation.service');
        const results = await contentGenerationService.generateAllContentForVideo(
          videoId, // videoRecordId
          videoId, // videoId (same for PostgreSQL)
          transcript,
          {
            provider: aiProvider,
            contentTypes,
            userId
          }
        );

        // Return accurate results based on what actually happened
        const response = {
          success: results.summary.failed === 0,
          message: results.summary.failed === 0
            ? `Content generation completed successfully for ${results.summary.successful} types`
            : `Content generation partially completed: ${results.summary.successful} succeeded, ${results.summary.failed} failed`,
          data: {
            videoId: parseInt(videoId),
            contentTypes,
            aiProvider,
            summary: results.summary,
            completedTypes: Object.keys(results.content || {}),
            failedTypes: Object.keys(results.errors || {}),
            status: results.summary.failed === 0 ? 'completed' : 'partial'
          }
        };

        // Use appropriate HTTP status code
        const statusCode = results.summary.failed === 0 ? 200 : 207; // 207 = Multi-Status (partial success)
        res.status(statusCode).json(response);

      } catch (generationError) {
        logger.error(`Content generation failed for video ${videoId}:`, generationError);
        res.status(500).json({
          success: false,
          message: 'Content generation failed',
          data: {
            videoId: parseInt(videoId),
            contentTypes,
            aiProvider,
            status: 'failed',
            error: generationError.message
          }
        });
      }

    } catch (error) {
      logger.error('Error triggering content generation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start content generation',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Get video content in legacy format (backward compatibility)
   * GET /api/content/videos/:videoId/legacy
   */
  async getVideoContentLegacy(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId } = req.params;
      const userId = req.user.id;

      // Verify user owns this video
      const database = require('../services/database.service');
      const videoCheck = await database.query(
        'SELECT id FROM videos WHERE id = $1 AND users_id = $2',
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const legacyContent = await contentService.getVideoContentLegacyFormat(videoId);

      res.json({
        success: true,
        data: {
          videoId: parseInt(videoId),
          content: legacyContent
        }
      });

    } catch (error) {
      logger.error('Error getting video content in legacy format:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve content',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Download content as DOCX document
   * GET /api/content/videos/:videoId/:contentType/download/docx
   */
  async downloadDocx(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId, contentType } = req.params;
      const userId = req.user.id;

      // Verify user owns this video and get video title (and transcript if needed)
      const database = require('../services/database.service');
      const isNumeric = /^\d+$/.test(videoId);
      const videoCheck = await database.query(
        `SELECT id, video_title, transcript_text FROM videos WHERE ${isNumeric ? 'id' : 'videoid'} = $1 AND users_id = $2`,
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const dbVideoId = videoCheck.rows[0].id;
      const videoTitle = videoCheck.rows[0].video_title;
      let contentText = null;

      // Handle transcript specially - it's stored in videos table, not video_content
      if (contentType === 'transcript' || contentType === 'transcript_text') {
        contentText = videoCheck.rows[0].transcript_text;
      } else {
        // Get the content from video_content table
        const content = await contentService.getVideoContentByType(
          dbVideoId,
          contentType,
          { publishedOnly: false }
        );
        contentText = content?.content_text;
      }

      if (!contentText) {
        return res.status(404).json({
          success: false,
          message: `No ${contentType} content found for this video`
        });
      }

      // Generate DOCX
      const docxBuffer = await documentGenerationService.generateDocx(
        contentText,
        contentType,
        videoTitle
      );

      const filename = documentGenerationService.generateFilename(videoTitle, contentType, 'docx');

      logger.info(`User ${userId} downloading DOCX for video ${videoId}, content type ${contentType}`);

      // Set headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', docxBuffer.length);

      res.send(docxBuffer);

    } catch (error) {
      logger.error('Error downloading DOCX:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate DOCX document',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Download content as PDF document
   * GET /api/content/videos/:videoId/:contentType/download/pdf
   */
  async downloadPdf(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
      }

      const { videoId, contentType } = req.params;
      const userId = req.user.id;

      // Verify user owns this video and get video title (and transcript if needed)
      const database = require('../services/database.service');
      const isNumeric = /^\d+$/.test(videoId);
      const videoCheck = await database.query(
        `SELECT id, video_title, transcript_text FROM videos WHERE ${isNumeric ? 'id' : 'videoid'} = $1 AND users_id = $2`,
        [videoId, userId]
      );

      if (videoCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found or access denied'
        });
      }

      const dbVideoId = videoCheck.rows[0].id;
      const videoTitle = videoCheck.rows[0].video_title;
      let contentText = null;

      // Handle transcript specially - it's stored in videos table, not video_content
      if (contentType === 'transcript' || contentType === 'transcript_text') {
        contentText = videoCheck.rows[0].transcript_text;
      } else {
        // Get the content from video_content table
        const content = await contentService.getVideoContentByType(
          dbVideoId,
          contentType,
          { publishedOnly: false }
        );
        contentText = content?.content_text;
      }

      if (!contentText) {
        return res.status(404).json({
          success: false,
          message: `No ${contentType} content found for this video`
        });
      }

      // Generate PDF
      const pdfBuffer = await documentGenerationService.generatePdf(
        contentText,
        contentType,
        videoTitle
      );

      const filename = documentGenerationService.generateFilename(videoTitle, contentType, 'pdf');

      logger.info(`User ${userId} downloading PDF for video ${videoId}, content type ${contentType}`);

      // Set headers for file download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);

    } catch (error) {
      logger.error('Error downloading PDF:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate PDF document',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

}

module.exports = new ContentController();
