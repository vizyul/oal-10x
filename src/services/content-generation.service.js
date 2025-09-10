const aiChatService = require('./ai-chat.service');
const databaseService = require('./database.service');
const { logger } = require('../utils');

class ContentGenerationService {
  constructor() {
    this.supportedContentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text'];
    this.supportedProviders = ['gemini', 'chatgpt', 'claude'];
  }

  /**
   * Check if video processing has been cancelled
   * @param {string} videoId - YouTube video ID
   * @returns {Promise<boolean>} True if cancelled, false otherwise
   */
  async isVideoCancelled(videoId) {
    try {
      // Primary check: processing status service (where cancellation is tracked)
      const processingStatusService = require('./processing-status.service');
      const videoStatus = processingStatusService.processingVideos.get(videoId);
      
      if (videoStatus && videoStatus.cancelled) {
        return true;
      }
      
      // Secondary check: if video was deleted from database, consider it cancelled
      const videos = await databaseService.query(
        'SELECT id FROM videos WHERE videoid = $1 OR youtube_video_id = $1',
        [videoId]
      );
      
      // If video doesn't exist in database but we're still processing, it might have been deleted (cancelled)
      if (!videos.rows || videos.rows.length === 0) {
        logger.info(`Video ${videoId} not found in database - may have been cancelled and deleted`);
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking video cancellation status:', error);
      // In case of error, assume not cancelled to avoid blocking legitimate processing
      return false;
    }
  }

  /**
   * Get all active prompts from database
   * @param {string} provider - AI provider filter ('gemini' or 'chatgpt')
   * @param {string} contentType - Content type filter
   * @returns {Promise<Array>} Array of prompt objects
   */
  async getActivePrompts(provider = null, contentType = null) {
    try {
      logger.debug('Getting active prompts', { provider, contentType });

      // Build filter conditions for PostgreSQL
      const conditions = { is_active: true };
      if (provider) conditions.ai_provider = provider.toLowerCase();
      if (contentType) conditions.content_type = contentType.toLowerCase();

      const records = await databaseService.findByMultipleFields('ai_prompts', conditions);

      // PostgreSQL returns records directly
      const prompts = records;

      logger.debug(`Found ${prompts.length} prompts in PostgreSQL`);
      return prompts;
    } catch (error) {
      logger.error('Error getting active prompts:', error);
      throw error;
    }
  }

  /**
   * Get a specific prompt by name and provider
   * @param {string} name - Prompt name
   * @param {string} provider - AI provider
   * @returns {Promise<Object|null>} Prompt object or null if not found
   */
  async getPrompt(name, provider) {
    try {
      const prompts = await this.getActivePrompts(provider);
      const prompt = prompts.find(p => p.name === name && p.ai_provider === provider.toLowerCase());

      if (!prompt) {
        logger.warn(`Prompt not found: ${name} for provider ${provider}`);
        return null;
      }

      return prompt;
    } catch (error) {
      logger.error(`Error getting prompt ${name} for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Generate content for a video using a specific prompt
   * @param {string} videoId - Video ID (for logging)
   * @param {string} transcript - Video transcript
   * @param {Object} prompt - Prompt configuration
   * @returns {Promise<Object>} Generation result
   */
  async generateContent(videoId, transcript, prompt, _userId = null) {
    const processingStatusService = require('./processing-status.service');

    try {

      // Update content status to pending
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'pending');

      // Validate provider availability
      if (!aiChatService.isProviderAvailable(prompt.ai_provider)) {
        throw new Error(`AI provider ${prompt.ai_provider} not available`);
      }

      // Process the prompt template
      const processedPrompt = aiChatService.processPromptTemplate(prompt.prompt_text, {
        TRANSCRIPT: transcript,
        VIDEO_ID: videoId
      });

      // Generate content with retry logic
      const generatedContent = await aiChatService.generateContentWithRetry(
        prompt.ai_provider,
        {
          prompt: processedPrompt,
          systemMessage: prompt.system_message,
          temperature: prompt.temperature || 0.7,
          maxTokens: prompt.max_tokens || 2000
        },
        2 // Max retries
      );


      // Update content status to completed
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'completed');

      return {
        success: true,
        content: generatedContent,
        contentType: prompt.content_type,
        provider: prompt.ai_provider,
        promptName: prompt.name,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error(`Failed to generate content for video ${videoId}:`, {
        error: error.message,
        provider: prompt.ai_provider,
        contentType: prompt.content_type,
        promptName: prompt.name
      });

      // Update content status to failed
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'failed', error.message);

      return {
        success: false,
        error: error.message,
        contentType: prompt.content_type,
        provider: prompt.ai_provider,
        promptName: prompt.name,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Generate all content types for a video
   * @param {string} videoRecordId - PostgreSQL video record ID (or Airtable ID for backward compatibility)
   * @param {string} videoId - YouTube video ID
   * @param {string} transcript - Video transcript
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation results
   */
  async generateAllContentForVideo(videoRecordId, videoId, transcript, options = {}) {
    try {
      // Check if video processing has been cancelled before starting
      if (await this.isVideoCancelled(videoId)) {
        logger.info(`Video ${videoId} has been cancelled, skipping content generation`);
        return { success: false, message: 'Video processing cancelled', results: [] };
      }

      const {
        provider = null, // Will be determined from user preference or default to gemini
        contentTypes = this.supportedContentTypes,
        concurrent = 2, // Number of concurrent generations
        userId = null,
        userEmail = null
      } = options;

      // Determine AI provider from user preference or use default
      let selectedProvider = provider;
      if (!selectedProvider && (userId || userEmail)) {
        try {
          const PreferencesService = require('./preferences.service');
          const preferencesService = new PreferencesService();
          let userPreferences = null;

          if (userEmail) {
            userPreferences = await preferencesService.getUserPreferences(userEmail);
          } else if (userId) {
            // If we only have userId, we'd need to get user email first
            const authService = require('./auth.service');
            const user = await authService.findUserById(userId);
            if (user) {
              userPreferences = await preferencesService.getUserPreferences(user.email);
            }
          }

          if (userPreferences && userPreferences.aiProvider) {
            selectedProvider = userPreferences.aiProvider;
            logger.info(`Using user preferred AI provider: ${selectedProvider} for video ${videoId}`);
          }
        } catch (prefError) {
          logger.warn(`Could not load user preferences for AI provider: ${prefError.message}`);
        }
      }

      // Fallback to gemini if no provider determined
      selectedProvider = selectedProvider || 'gemini';


      // Validate provider
      if (!aiChatService.isProviderAvailable(selectedProvider)) {
        throw new Error(`AI provider ${selectedProvider} not available`);
      }

      // Get active prompts for the provider and content types
      const allPrompts = await this.getActivePrompts(selectedProvider);

      const relevantPrompts = allPrompts.filter(prompt =>
        contentTypes.includes(prompt.content_type)
      );

      if (relevantPrompts.length === 0) {
        const availableContentTypes = allPrompts.map(p => p.content_type);
        logger.error(`Content type mismatch - Available: [${availableContentTypes.join(', ')}], Requested: [${contentTypes.join(', ')}]`);
        throw new Error(`No active prompts found for provider ${selectedProvider} and content types ${contentTypes.join(', ')}`);
      }

      // Generate content in batches to avoid overwhelming the AI service
      const results = {
        videoId,
        videoRecordId,
        provider: selectedProvider,
        generatedAt: new Date().toISOString(),
        content: {},
        errors: {},
        summary: {
          total: relevantPrompts.length,
          successful: 0,
          failed: 0
        }
      };

      // Process prompts in batches
      for (let i = 0; i < relevantPrompts.length; i += concurrent) {
        // Check for cancellation before each batch
        if (await this.isVideoCancelled(videoId)) {
          logger.info(`Video ${videoId} was cancelled during content generation, stopping at batch ${Math.floor(i / concurrent) + 1}`);
          break;
        }

        const batch = relevantPrompts.slice(i, i + concurrent);

        logger.debug(`Processing batch ${Math.floor(i / concurrent) + 1}/${Math.ceil(relevantPrompts.length / concurrent)}`);

        const batchPromises = batch.map(prompt =>
          this.generateContent(videoId, transcript, prompt, userId)
            .then(result => ({ prompt: prompt.name, result }))
            .catch(error => ({ prompt: prompt.name, result: { success: false, error: error.message } }))
        );

        const batchResults = await Promise.all(batchPromises);

        // Process batch results
        batchResults.forEach(({ prompt, result }) => {
          if (result.success) {
            results.content[result.contentType] = {
              content: result.content,
              provider: result.provider,
              promptName: result.promptName,
              generatedAt: result.generatedAt
            };
            results.summary.successful++;
          } else {
            results.errors[prompt] = result.error;
            results.summary.failed++;
          }
        });

        // Add delay between batches to be respectful to the AI service
        if (i + concurrent < relevantPrompts.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Update the video record with generated content
      try {
        await this.updateVideoWithGeneratedContent(videoRecordId, results.content);
        logger.info(`Updated video ${videoRecordId} with generated content`);
      } catch (updateError) {
        logger.error(`Failed to update video ${videoRecordId} with generated content:`, updateError.message);
        results.updateError = updateError.message;
      }

      logger.info(`Content generation completed for video ${videoId}`, results.summary);
      return results;

    } catch (error) {
      logger.error(`Content generation failed for video ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Update video record with generated content
   * @param {string} videoRecordId - PostgreSQL video record ID (or Airtable ID for backward compatibility)
   * @param {Object} generatedContent - Generated content by type
   * @returns {Promise<void>}
   */
  async updateVideoWithGeneratedContent(videoRecordId, generatedContent) {
    try {
      const updates = {};

      // Map content types to database field names
      const fieldMappings = {
        summary_text: ['summary_text', 'summary_url'],
        study_guide_text: ['study_guide_text', 'study_guide_url'],
        discussion_guide_text: ['discussion_guide_text', 'discussion_guide_url'],
        group_guide_text: ['group_guide_text', 'group_guide_url'],
        social_media_text: ['social_media_text', 'social_media_url'],
        quiz_text: ['quiz_text', 'quiz_url'],
        chapters_text: ['chapter_text', 'chapter_url']
      };

      // Prepare updates for database
      Object.entries(generatedContent).forEach(([contentType, data]) => {
        // eslint-disable-next-line no-unused-vars
        const [textField, _urlField] = fieldMappings[contentType] || [];
        if (textField && data.content) {
          updates[textField] = data.content;
          // URL field could be used for future implementations (e.g., saving to external storage)
        }
      });

      if (Object.keys(updates).length === 0) {
        logger.warn(`No valid content to update for video ${videoRecordId}`);
        return;
      }

      // First try to find the record by direct ID (assuming it's a PostgreSQL ID)
      try {
        await databaseService.update('videos', videoRecordId, updates);
        logger.debug(`Updated video record ${videoRecordId} with generated content`);
        return;
      } catch (directUpdateError) {
        logger.debug(`Direct update failed, trying to find by airtable_id: ${directUpdateError.message}`);

        // If direct update fails, try to find by airtable_id (backward compatibility)
        try {
          const records = await databaseService.findByField('videos', 'airtable_id', videoRecordId);

          if (records.length > 0) {
            const record = records[0];
            const recordId = record.id; // PostgreSQL returns records directly
            await databaseService.update('videos', recordId, updates);
            logger.debug(`Updated video record ${recordId} (found by airtable_id ${videoRecordId}) with generated content`);
          } else {
            logger.error(`Video record not found with ID or airtable_id: ${videoRecordId}`);
            throw new Error(`Video record not found: ${videoRecordId}`);
          }
        } catch (fallbackError) {
          logger.error(`Failed to update video record ${videoRecordId}:`, fallbackError.message);
          throw fallbackError;
        }
      }

    } catch (error) {
      logger.error(`Error updating video ${videoRecordId} with generated content:`, error);
      throw error;
    }
  }

  /**
   * Process videos that have transcripts but missing content
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Array of processing results
   */
  async processVideosWithTranscripts(options = {}) {
    try {
      const {
        provider = 'gemini',
        contentTypes = this.supportedContentTypes,
        maxVideos = 10,
        userId = null
      } = options;

      logger.info('Starting batch content generation for videos with transcripts', {
        provider,
        contentTypes,
        maxVideos,
        userId
      });

      // Get videos from PostgreSQL database
      const allVideos = await databaseService.findAll('videos', { maxRecords: maxVideos * 2 });

      // Filter videos that have transcripts but missing content
      let videos = allVideos.filter(record => {
        // Skip if no transcript or transcript too short
        if (!record.transcript_text || record.transcript_text.trim().length < 100) {
          return false;
        }

        // Include if userId filter is specified and matches
        if (userId && record.user_id !== userId) {
          return false;
        }

        // Include if missing some content (e.g., blog_text or discussion_guide_text)
        return !record.summary_text || !record.discussion_guide_text || !record.quiz_text;
      }).slice(0, maxVideos);

      logger.info(`Found ${videos.length} videos needing content generation`);

      if (videos.length === 0) {
        logger.info('No videos found that need content generation');
        return [];
      }

      // Process videos
      const results = [];
      for (const video of videos) {
        try {
          const videoRecordId = video.id;
          const videoId = video.videoid || video.video_id || video.youtube_video_id;

          const result = await this.generateAllContentForVideo(
            videoRecordId,
            videoId,
            video.transcript_text,
            { provider, contentTypes, userId }
          );

          results.push(result);

          // Add delay between videos
          await new Promise(resolve => setTimeout(resolve, 3000));

        } catch (error) {
          logger.error(`Failed to process video ${video.id}:`, error.message);
          results.push({
            videoId: video.videoid || video.video_id || video.youtube_video_id,
            videoRecordId: video.id,
            success: false,
            error: error.message
          });
        }
      }

      logger.info(`Batch processing completed: ${results.filter(r => r.summary?.successful > 0).length}/${results.length} videos processed successfully`);
      return results;

    } catch (error) {
      logger.error('Error in batch content generation:', error);
      throw error;
    }
  }

  /**
   * Get content generation statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getGenerationStats() {
    try {
      // Get prompts statistics
      const activePrompts = await this.getActivePrompts();
      const promptsByProvider = {};
      const promptsByContentType = {};

      activePrompts.forEach(prompt => {
        // By provider
        if (!promptsByProvider[prompt.ai_provider]) {
          promptsByProvider[prompt.ai_provider] = 0;
        }
        promptsByProvider[prompt.ai_provider]++;

        // By content type
        if (!promptsByContentType[prompt.content_type]) {
          promptsByContentType[prompt.content_type] = 0;
        }
        promptsByContentType[prompt.content_type]++;
      });

      // Get video statistics from PostgreSQL
      let videoStats = { total: 0, withTranscripts: 0, withGeneratedContent: 0 };

      try {
        const allVideos = await databaseService.findAll('videos', { maxRecords: 1000 });
        videoStats.total = allVideos.length;

        // PostgreSQL returns records directly
        videoStats.withTranscripts = allVideos.filter(v => {
          return v.transcript_text?.length > 100;
        }).length;

        videoStats.withGeneratedContent = allVideos.filter(v => {
          return v.summary_text || v.discussion_guide_text || v.quiz_text;
        }).length;
      } catch (error) {
        logger.warn('Could not get video statistics from database:', error.message);
      }

      return {
        prompts: {
          total: activePrompts.length,
          byProvider: promptsByProvider,
          byContentType: promptsByContentType
        },
        videos: videoStats,
        availableProviders: aiChatService.getAvailableProviders(),
        supportedContentTypes: this.supportedContentTypes,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting generation statistics:', error);
      throw error;
    }
  }
}

module.exports = new ContentGenerationService();
