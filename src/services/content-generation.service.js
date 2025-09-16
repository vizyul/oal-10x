const aiChatService = require('./ai-chat.service');
const promptSanitizer = require('../utils/prompt-sanitizer');
const { aiPrompts, video: videoModel } = require('../models');
const { logger } = require('../utils');
const database = require('./database.service');

class ContentGenerationService {
  constructor() {
    // Remove hardcoded content types - will load from database
    this.supportedProviders = ['gemini', 'chatgpt', 'claude'];
    this.supportedContentTypesCache = null;
    this.contentTypesCacheExpiry = null;
  }

  /**
   * Get supported content types from database with caching
   * @returns {Array} Array of content type strings
   */
  async getSupportedContentTypes() {
    // Check if cache is still valid (cache for 5 minutes)
    const now = Date.now();
    if (this.supportedContentTypesCache && this.contentTypesCacheExpiry && now < this.contentTypesCacheExpiry) {
      return this.supportedContentTypesCache;
    }

    try {
      const contentTypes = await aiPrompts.getAvailableContentTypes();
      this.supportedContentTypesCache = contentTypes.map(ct => ct.type);
      this.contentTypesCacheExpiry = now + (5 * 60 * 1000); // Cache for 5 minutes

      logger.info(`Loaded ${this.supportedContentTypesCache.length} supported content types from AiPrompts model`);
      return this.supportedContentTypesCache;
    } catch (error) {
      logger.error('Error loading content types from AiPrompts model:', error);
      // Fallback to hardcoded types if model query fails
      this.supportedContentTypesCache = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text', 'ebook_text'];
      this.contentTypesCacheExpiry = now + (1 * 60 * 1000); // Short cache for fallback
      return this.supportedContentTypesCache;
    }
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
      const video = await videoModel.findByVideoId(videoId);

      // If video doesn't exist in database but we're still processing, it might have been deleted (cancelled)
      if (!video) {
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

      let prompts;

      if (provider && contentType) {
        // Get specific prompt for provider and content type
        const prompt = await aiPrompts.findByProviderAndType(provider.toLowerCase(), contentType.toLowerCase());
        prompts = prompt ? [prompt] : [];
      } else if (provider) {
        // Get all prompts for provider
        prompts = await aiPrompts.getByProvider(provider.toLowerCase());
      } else if (contentType) {
        // Get all prompts for content type
        prompts = await aiPrompts.getByContentType(contentType.toLowerCase());
      } else {
        // Get all system prompts
        prompts = await aiPrompts.getSystemPrompts();
      }

      logger.debug(`Found ${prompts.length} prompts using AiPrompts model`);
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
  async generateContent(videoId, videoRecordId, transcript, prompt, _userId = null) {
    const processingStatusService = require('./processing-status.service');

    try {

      // Update content status to pending
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'pending');

      // Validate provider availability
      if (!aiChatService.isProviderAvailable(prompt.ai_provider)) {
        throw new Error(`AI provider ${prompt.ai_provider} not available`);
      }

      // Process the prompt template with sanitization
      const processedPrompt = promptSanitizer.processTemplate(prompt.prompt_text, {
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

      // Write content to database immediately
      try {
        const contentUpdate = {
          [prompt.content_type]: {
            content: generatedContent
          }
        };
        await this.updateVideoWithGeneratedContent(videoRecordId, contentUpdate);
        logger.info(`Successfully saved ${prompt.content_type} content to database for video ${videoId}`);

        // Update content status to completed ONLY after successful database write
        processingStatusService.updateContentStatus(videoId, prompt.content_type, 'completed');

      } catch (dbError) {
        logger.error(`Failed to save ${prompt.content_type} content to database for video ${videoId}:`, dbError.message);
        processingStatusService.updateContentStatus(videoId, prompt.content_type, 'failed', `Database save failed: ${dbError.message}`);

        return {
          success: false,
          error: `Database save failed: ${dbError.message}`,
          contentType: prompt.content_type
        };
      }

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
          this.generateContent(videoId, videoRecordId, transcript, prompt, userId)
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

      // Note: Database updates now happen individually after each content generation
      // No batch update needed here since each generateContent call writes to database immediately

      logger.info(`Content generation completed for video ${videoId}`, results.summary);

      // Check if we should mark the video as completed in the database
      await this.checkAndUpdateVideoCompletion(videoRecordId, videoId);

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
      // First, resolve the actual video ID (handle backward compatibility with Airtable IDs)
      let actualVideoId = videoRecordId;
      let video = null;

      // Try to find video by direct ID first
      try {
        video = await videoModel.findById(videoRecordId);
        actualVideoId = video.id;
      } catch (directFindError) {
        // If not found by direct ID, try by airtable_id (backward compatibility)
        try {
          video = await videoModel.findByAirtableId(videoRecordId);
          if (video) {
            actualVideoId = video.id;
            logger.debug(`Found video by airtable_id ${videoRecordId}, using PostgreSQL ID ${actualVideoId}`);
          } else {
            logger.error(`Video record not found with ID or airtable_id: ${videoRecordId}`);
            throw new Error(`Video record not found: ${videoRecordId}`);
          }
        } catch (fallbackError) {
          logger.error(`Failed to find video record ${videoRecordId}:`, fallbackError.message);
          throw fallbackError;
        }
      }

      // Process each content type and save to video_content table
      for (const [contentType, data] of Object.entries(generatedContent)) {
        if (!data.content) {
          logger.warn(`No content provided for content type ${contentType}`);
          continue;
        }

        try {
          // Look up content type ID from content_types table
          const contentTypeQuery = `
            SELECT id, label 
            FROM content_types 
            WHERE key = $1 AND is_active = true
          `;

          const contentTypeResult = await database.query(contentTypeQuery, [contentType]);

          if (contentTypeResult.rows.length === 0) {
            logger.warn(`Content type '${contentType}' not found in content_types table, skipping`);
            continue;
          }

          const contentTypeRecord = contentTypeResult.rows[0];

          // Check if content already exists for this video and content type
          const existingContentQuery = `
            SELECT id 
            FROM video_content 
            WHERE video_id = $1 AND content_type_id = $2
          `;

          const existingContentResult = await database.query(existingContentQuery, [actualVideoId, contentTypeRecord.id]);

          const now = new Date();

          if (existingContentResult.rows.length > 0) {
            // Update existing record
            const existingContentId = existingContentResult.rows[0].id;

            const updateQuery = `
              UPDATE video_content 
              SET 
                content_text = $1,
                ai_provider = $2,
                generation_status = 'completed',
                generation_completed_at = $3,
                updated_at = $3,
                is_published = true,
                version = COALESCE(version, 0) + 1
              WHERE id = $4
            `;

            await database.query(updateQuery, [
              data.content,
              data.provider || 'unknown',
              now,
              existingContentId
            ]);

            logger.debug(`Updated existing video_content record ID ${existingContentId} for video ${actualVideoId} content type ${contentType}`);

          } else {
            // Insert new record
            const insertQuery = `
              INSERT INTO video_content (
                video_id,
                content_type_id,
                content_text,
                ai_provider,
                generation_status,
                generation_completed_at,
                is_published,
                version,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, 'completed', $5, true, 1, $5, $5)
            `;

            await database.query(insertQuery, [
              actualVideoId,
              contentTypeRecord.id,
              data.content,
              data.provider || 'unknown',
              now
            ]);

            logger.debug(`Created new video_content record for video ${actualVideoId} content type ${contentType}`);
          }

        } catch (contentError) {
          logger.error(`Error saving content type ${contentType} for video ${actualVideoId}:`, contentError.message);
          // Continue with other content types rather than failing completely
        }
      }

      logger.info(`Successfully processed ${Object.keys(generatedContent).length} content types for video ${actualVideoId}`);

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

      // Get videos from PostgreSQL database using Video model
      const allVideos = await videoModel.findAll({}, { limit: maxVideos * 2 });

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
          const videoId = video.videoid;

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
            videoId: video.videoid,
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
        const allVideos = await videoModel.findAll({}, { limit: 1000 });
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

  /**
   * Check if video processing is complete and update video status to completed
   * @param {string} videoRecordId - PostgreSQL video record ID
   * @param {string} videoId - YouTube video ID
   */
  async checkAndUpdateVideoCompletion(videoRecordId, videoId) {
    try {
      const { video: videoModel } = require('../models');
      const database = require('./database.service');
      const { logger } = require('../utils');

      // Check if video has transcript
      const video = await videoModel.findById(videoRecordId);
      if (!video || !video.transcript_text || video.transcript_text.trim() === '') {
        logger.debug(`Video ${videoId} does not have transcript yet, not marking as completed`);
        return;
      }

      // Check if video has any content in video_content table
      const contentQuery = `
        SELECT COUNT(*) as content_count
        FROM video_content 
        WHERE video_id = $1 AND content_text IS NOT NULL AND content_text != ''
      `;

      const contentResult = await database.query(contentQuery, [videoRecordId]);
      const contentCount = parseInt(contentResult.rows[0].content_count);

      if (contentCount > 0) {
        // Video has both transcript and some generated content, mark as completed
        await videoModel.updateStatus(videoRecordId, 'completed', {
          processed_at: new Date().toISOString()
        });

        logger.info(`✅ Video ${videoId} marked as completed - has transcript and ${contentCount} content items`);
      } else {
        logger.debug(`Video ${videoId} has transcript but no generated content yet, keeping status as processing`);
      }

    } catch (error) {
      const { logger } = require('../utils');
      logger.error(`Error checking video completion for ${videoId}:`, error);
    }
  }
}

module.exports = new ContentGenerationService();
