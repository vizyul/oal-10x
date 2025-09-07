const { logger } = require('../utils');
const database = require('./database.service');
const youtubeMetadata = require('./youtube-metadata.service');

class VideoProcessingService {
  constructor() {
    this.processingQueue = new Map(); // In-memory queue for now
    this.isProcessing = false;
  }

  /**
   * Process a video through all stages
   * @param {string} videoId - Video record ID
   * @returns {Object} Processing result
   */
  async processVideo(videoId) {
    try {
      logger.info(`Starting video processing for ${videoId}`);

      // Get video record
      const videoRecord = await database.findById('videos', videoId);
      if (!videoRecord) {
        throw new Error('Video not found');
      }

      const videoData = videoRecord.fields || videoRecord;
      
      // Update status to processing
      await this.updateProcessingStatus(videoId, 'processing', {
        started: new Date().toISOString(),
        steps: []
      });

      let processingSteps = [];

      // Step 1: Extract metadata (if not already done)
      if (!videoData.duration || !videoData.description) {
        logger.info(`Extracting metadata for video ${videoId}`);
        
        try {
          const metadata = await this.extractMetadata(videoData.youtube_url);
          await this.updateVideoWithMetadata(videoId, metadata);
          
          processingSteps.push({
            step: 'metadata_extraction',
            status: 'completed',
            timestamp: new Date().toISOString(),
            data: {
              title: metadata.title,
              duration: metadata.duration,
              channelTitle: metadata.channelTitle
            }
          });
        } catch (metadataError) {
          logger.error('Metadata extraction failed:', metadataError);
          processingSteps.push({
            step: 'metadata_extraction',
            status: 'failed',
            timestamp: new Date().toISOString(),
            error: metadataError.message
          });
        }
      } else {
        processingSteps.push({
          step: 'metadata_extraction',
          status: 'skipped',
          timestamp: new Date().toISOString(),
          reason: 'Metadata already exists'
        });
      }

      // Step 2: Generate AI content
      await this.generateAllContent(videoId, processingSteps);

      // Final status update
      const finalStatus = processingSteps.every(step => 
        step.status === 'completed' || step.status === 'skipped'
      ) ? 'completed' : 'error';

      await this.updateProcessingStatus(videoId, finalStatus, {
        completed: new Date().toISOString(),
        steps: processingSteps
      });

      logger.info(`Video processing completed for ${videoId}`, { status: finalStatus });

      return {
        success: finalStatus === 'completed',
        videoId,
        steps: processingSteps
      };

    } catch (error) {
      logger.error('Video processing failed:', error);
      
      await this.updateProcessingStatus(videoId, 'error', {
        error: error.message,
        failed: new Date().toISOString(),
        steps: [{
          step: 'processing_failed',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message
        }]
      });

      throw error;
    }
  }

  /**
   * Extract video metadata from YouTube
   * @param {string} videoUrl - YouTube video URL
   * @returns {Object} Video metadata
   */
  async extractMetadata(videoUrl) {
    try {
      logger.info(`Extracting metadata from ${videoUrl}`);
      
      const metadata = await youtubeMetadata.extractVideoMetadata(videoUrl);
      
      logger.info('Metadata extraction completed', {
        title: metadata.title,
        duration: metadata.duration,
        channelTitle: metadata.channelTitle
      });

      return metadata;
    } catch (error) {
      logger.error('Metadata extraction failed:', error);
      throw new Error(`Failed to extract video metadata: ${error.message}`);
    }
  }

  /**
   * Update video record with extracted metadata
   * @param {string} videoId - Video record ID
   * @param {Object} metadata - Extracted metadata
   */
  async updateVideoWithMetadata(videoId, metadata) {
    try {
      const currentFields = await this.getCurrentTableFields('videos');
      const updateData = {};

      // Map metadata to table fields
      if (currentFields.includes('description') && metadata.description) {
        updateData.description = this.cleanText(metadata.description, 1000);
      }
      
      if (currentFields.includes('duration') && metadata.duration) {
        updateData.duration = metadata.duration;
      }
      
      if (currentFields.includes('upload_date') && metadata.publishedAt) {
        updateData.upload_date = metadata.publishedAt;
      }
      
      if (currentFields.includes('thumbnail_url') && metadata.thumbnails?.[0]?.url) {
        updateData.thumbnail_url = metadata.thumbnails[0].url;
      }
      
      if (currentFields.includes('tags') && metadata.tags?.length > 0) {
        updateData.tags = JSON.stringify(metadata.tags.slice(0, 10)); // Store as JSON string
      }

      if (Object.keys(updateData).length > 0) {
        await database.update('videos', videoId, updateData);
        logger.info(`Video metadata updated for ${videoId}`, Object.keys(updateData));
      }

    } catch (error) {
      logger.error('Failed to update video with metadata:', error);
      throw error;
    }
  }

  /**
   * Generate all AI content for video
   * @param {string} videoId - Video record ID
   * @param {Array} processingSteps - Processing steps array to update
   */
  async generateAllContent(videoId, processingSteps) {
    const videoRecord = await database.findById('videos', videoId);
    const videoData = videoRecord.fields || videoRecord;
    const currentFields = await this.getCurrentTableFields('videos');

    // Generate AI Summary
    if (currentFields.includes('ai_summary') && !videoData.ai_summary) {
      try {
        logger.info(`Generating AI summary for video ${videoId}`);
        const summary = await this.generateSummary(videoData);
        
        if (summary) {
          await database.update('videos', videoId, { ai_summary: summary });
          processingSteps.push({
            step: 'ai_summary',
            status: 'completed',
            timestamp: new Date().toISOString(),
            data: { length: summary.length }
          });
        } else {
          throw new Error('No summary generated');
        }
      } catch (error) {
        logger.error('AI summary generation failed:', error);
        processingSteps.push({
          step: 'ai_summary',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    } else {
      processingSteps.push({
        step: 'ai_summary',
        status: 'skipped',
        timestamp: new Date().toISOString(),
        reason: currentFields.includes('ai_summary') 
          ? 'Summary already exists'
          : 'Field not available'
      });
    }

    // Generate Title Suggestions
    if (currentFields.includes('ai_title_suggestions') && !videoData.ai_title_suggestions) {
      try {
        logger.info(`Generating title suggestions for video ${videoId}`);
        const titles = await this.generateTitles(videoData);
        
        if (titles && titles.length > 0) {
          await database.update('videos', videoId, { 
            ai_title_suggestions: JSON.stringify(titles) 
          });
          processingSteps.push({
            step: 'ai_titles',
            status: 'completed',
            timestamp: new Date().toISOString(),
            data: { count: titles.length }
          });
        } else {
          throw new Error('No titles generated');
        }
      } catch (error) {
        logger.error('Title generation failed:', error);
        processingSteps.push({
          step: 'ai_titles',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    } else {
      processingSteps.push({
        step: 'ai_titles',
        status: 'skipped',
        timestamp: new Date().toISOString(),
        reason: currentFields.includes('ai_title_suggestions')
          ? 'Titles already exist'
          : 'Field not available'
      });
    }

    // Generate Thumbnail Concepts
    if (currentFields.includes('ai_thumbnail_suggestions') && !videoData.ai_thumbnail_suggestions) {
      try {
        logger.info(`Generating thumbnail concepts for video ${videoId}`);
        const thumbnails = await this.generateThumbnailConcepts(videoData);
        
        if (thumbnails && thumbnails.length > 0) {
          await database.update('videos', videoId, { 
            ai_thumbnail_suggestions: JSON.stringify(thumbnails) 
          });
          processingSteps.push({
            step: 'ai_thumbnails',
            status: 'completed',
            timestamp: new Date().toISOString(),
            data: { count: thumbnails.length }
          });
        } else {
          throw new Error('No thumbnail concepts generated');
        }
      } catch (error) {
        logger.error('Thumbnail generation failed:', error);
        processingSteps.push({
          step: 'ai_thumbnails',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message
        });
      }
    } else {
      processingSteps.push({
        step: 'ai_thumbnails',
        status: 'skipped',
        timestamp: new Date().toISOString(),
        reason: currentFields.includes('ai_thumbnail_suggestions')
          ? 'Thumbnails already exist'
          : 'Field not available'
      });
    }
  }

  /**
   * Generate AI summary for video
   * @param {Object} videoData - Video data
   * @returns {string} Generated summary
   */
  async generateSummary(videoData) {
    try {
      // This is a placeholder for AI integration
      // In a real implementation, you would call an AI service like OpenAI, Gemini, etc.
      
      const title = videoData.video_title || 'Untitled Video';
      const description = videoData.description || '';
      const channelName = videoData.channel_name || 'Unknown Channel';
      
      // Mock AI summary generation
      const summary = this.generateMockSummary(title, description, channelName);
      
      logger.info('AI summary generated', { length: summary.length });
      return summary;
      
    } catch (error) {
      logger.error('Summary generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate AI title suggestions
   * @param {Object} videoData - Video data
   * @returns {Array} Array of title suggestions
   */
  async generateTitles(videoData) {
    try {
      // Mock title generation
      const baseTitle = videoData.video_title || 'Untitled Video';
      const titles = this.generateMockTitles(baseTitle);
      
      logger.info('Title suggestions generated', { count: titles.length });
      return titles;
      
    } catch (error) {
      logger.error('Title generation failed:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail concepts
   * @param {Object} videoData - Video data
   * @returns {Array} Array of thumbnail concepts
   */
  async generateThumbnailConcepts(videoData) {
    try {
      // Mock thumbnail concept generation
      const title = videoData.video_title || 'Untitled Video';
      const concepts = this.generateMockThumbnailConcepts(title);
      
      logger.info('Thumbnail concepts generated', { count: concepts.length });
      return concepts;
      
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      throw error;
    }
  }

  /**
   * Update video processing status
   * @param {string} videoId - Video record ID
   * @param {string} status - Processing status
   * @param {Object} logData - Additional log data
   */
  async updateProcessingStatus(videoId, status, logData = {}) {
    try {
      const currentFields = await this.getCurrentTableFields('videos');
      const updateData = {};

      if (currentFields.includes('status')) {
        updateData.status = status;
      }

      if (currentFields.includes('processing_log')) {
        // Get existing log
        const videoRecord = await database.findById('videos', videoId);
        const recordData = videoRecord.fields || videoRecord;
        const existingLog = recordData.processing_log 
          ? JSON.parse(recordData.processing_log)
          : { steps: [] };

        // Merge logs
        const mergedLog = {
          ...existingLog,
          ...logData,
          lastUpdated: new Date().toISOString()
        };

        if (logData.steps) {
          mergedLog.steps = [...(existingLog.steps || []), ...logData.steps];
        }

        updateData.processing_log = JSON.stringify(mergedLog);
      }

      if (currentFields.includes('updated_at')) {
        updateData.updated_at = new Date().toISOString();
      }

      if (Object.keys(updateData).length > 0) {
        await database.update('videos', videoId, updateData);
        logger.info(`Processing status updated for ${videoId}`, { status, hasLog: !!updateData.processing_log });
      }

    } catch (error) {
      logger.error('Failed to update processing status:', error);
      throw error;
    }
  }

  /**
   * Handle processing errors
   * @param {string} videoId - Video record ID
   * @param {Error} error - Error that occurred
   */
  async handleProcessingError(videoId, error) {
    try {
      logger.error(`Processing error for video ${videoId}:`, error);
      
      await this.updateProcessingStatus(videoId, 'error', {
        error: error.message,
        errorStack: error.stack,
        errorTime: new Date().toISOString(),
        steps: [{
          step: 'error_handling',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message
        }]
      });

    } catch (updateError) {
      logger.error('Failed to handle processing error:', updateError);
    }
  }

  /**
   * Get processing queue status
   * @returns {Object} Queue status
   */
  async getQueueStatus() {
    try {
      // In a full implementation, this would query the Processing Queue table
      // For now, return mock data
      
      return {
        totalItems: this.processingQueue.size,
        processing: this.isProcessing,
        lastUpdate: new Date().toISOString(),
        items: Array.from(this.processingQueue.entries()).map(([id, data]) => ({
          videoId: id,
          ...data
        }))
      };

    } catch (error) {
      logger.error('Failed to get queue status:', error);
      return {
        totalItems: 0,
        processing: false,
        error: error.message
      };
    }
  }

  // Helper methods

  /**
   * Get current table fields
   * @param {string} tableName - Table name
   * @returns {Array} Field names
   */
  async getCurrentTableFields(tableName) {
    try {
      const schema = await database.getTableSchema(tableName);
      return schema.fields || [];
    } catch (error) {
      logger.warn(`Could not get table schema for ${tableName}:`, error.message);
      return [];
    }
  }

  /**
   * Clean text for storage
   * @param {string} text - Text to clean
   * @param {number} maxLength - Maximum length
   * @returns {string} Cleaned text
   */
  cleanText(text, maxLength = 1000) {
    if (!text) return '';
    
    let cleaned = text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim() + '...';
    }
    
    return cleaned;
  }

  // Mock AI generation methods (replace with real AI services)

  generateMockSummary(title, description, channelName) {
    const summaries = [
      `This video from ${channelName} titled "${title}" provides valuable insights and information. ${description.substring(0, 200)}...`,
      'In this engaging content, the creator discusses key topics related to the subject matter. The video offers practical advice and actionable insights for viewers.',
      'This educational video explores important concepts and provides viewers with comprehensive information on the topic. The content is well-structured and informative.'
    ];
    
    return summaries[Math.floor(Math.random() * summaries.length)];
  }

  generateMockTitles(baseTitle) {
    const prefixes = ['How to', 'Top 5', 'Ultimate Guide to', 'Everything About', 'Mastering'];
    const suffixes = ['- Complete Tutorial', '(2024 Update)', '| Step by Step', '- Pro Tips', 'Explained'];
    
    return [
      baseTitle, // Keep original
      `${prefixes[0]} ${baseTitle.toLowerCase()}`,
      `${baseTitle} ${suffixes[0]}`,
      `${prefixes[1]} ${baseTitle.replace(/\b\w/g, l => l.toLowerCase())} Tips`,
      `${baseTitle} ${suffixes[1]}`
    ].slice(0, 5);
  }

  generateMockThumbnailConcepts(title) {
    return [
      {
        concept: 'Bold text overlay with bright background',
        description: `Large, bold text showing "${title}" with a bright, eye-catching background color`,
        elements: ['Bold typography', 'Bright background', 'High contrast']
      },
      {
        concept: 'Person pointing with shocked expression',
        description: 'Thumbnail showing a person with an surprised expression pointing at text',
        elements: ['Human face', 'Pointing gesture', 'Emotional expression']
      },
      {
        concept: 'Split screen before/after style',
        description: 'Thumbnail divided into two sections showing a before and after comparison',
        elements: ['Split layout', 'Before/after text', 'Comparison imagery']
      }
    ];
  }
}

module.exports = new VideoProcessingService();