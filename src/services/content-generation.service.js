const aiChatService = require('./ai-chat.service');
const airtable = require('./airtable.service');
const databaseService = require('./database.service');
const { logger } = require('../utils');

class ContentGenerationService {
  constructor() {
    this.supportedContentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text'];
    this.supportedProviders = ['gemini', 'chatgpt', 'claude'];
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

      // Try PostgreSQL first, fallback to Airtable
      let prompts = [];
      
      try {
        // Build filter conditions for PostgreSQL
        const conditions = { is_active: true };
        if (provider) conditions.ai_provider = provider.toLowerCase();
        if (contentType) conditions.content_type = contentType.toLowerCase();

        const records = await databaseService.findByMultipleFields('ai_prompts', conditions);
        prompts = records.map(record => record.fields);
        
        logger.debug(`Found ${prompts.length} prompts in PostgreSQL`);
      } catch (pgError) {
        logger.warn('PostgreSQL query failed, trying Airtable:', pgError.message);
        
        // Fallback to Airtable
        try {
          let filterFormula = 'is_active = TRUE()';
          if (provider) {
            filterFormula += ` AND ai_provider = "${provider.toLowerCase()}"`;
          }
          if (contentType) {
            filterFormula += ` AND content_type = "${contentType.toLowerCase()}"`;
          }

          const airtableRecords = await airtable.findAll('AI_Prompts', {
            filterByFormula: filterFormula,
            maxRecords: 100
          });
          
          prompts = airtableRecords.map(record => record.fields);
          logger.debug(`Found ${prompts.length} prompts in Airtable`);
        } catch (airtableError) {
          logger.error('Both PostgreSQL and Airtable failed:', airtableError.message);
          throw new Error('Could not retrieve prompts from either database');
        }
      }

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
  async generateContent(videoId, transcript, prompt, userId = null) {
    try {

      const processingStatusService = require('./processing-status.service');
      
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
   * @param {string} videoRecordId - Airtable video record ID
   * @param {string} videoId - YouTube video ID
   * @param {string} transcript - Video transcript
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generation results
   */
  async generateAllContentForVideo(videoRecordId, videoId, transcript, options = {}) {
    try {
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
   * @param {string} videoRecordId - Airtable video record ID
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
        chapters_text: ['chapters_text', 'chapters_url']
      };

      // Prepare updates for Airtable
      Object.entries(generatedContent).forEach(([contentType, data]) => {
        const [textField, urlField] = fieldMappings[contentType] || [];
        if (textField && data.content) {
          updates[textField] = data.content;
          // URL field could be used for future implementations (e.g., saving to external storage)
        }
      });

      if (Object.keys(updates).length === 0) {
        logger.warn(`No valid content to update for video ${videoRecordId}`);
        return;
      }

      // Update Airtable
      try {
        await airtable.update('Videos', videoRecordId, updates);
        logger.debug(`Updated Airtable record ${videoRecordId} with generated content`);
      } catch (airtableError) {
        logger.error(`Failed to update Airtable record ${videoRecordId}:`, airtableError.message);
      }

      // Update PostgreSQL
      try {
        const postgresRecords = await databaseService.findByField('videos', 'airtable_id', videoRecordId);
        
        if (postgresRecords.length > 0) {
          const postgresRecord = postgresRecords[0];
          await databaseService.update('videos', postgresRecord.fields.id, updates);
          logger.debug(`Updated PostgreSQL record ${postgresRecord.fields.id} with generated content`);
        } else {
          logger.warn(`PostgreSQL record not found for Airtable ID ${videoRecordId}`);
        }
      } catch (postgresError) {
        logger.error(`Failed to update PostgreSQL record for ${videoRecordId}:`, postgresError.message);
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

      // Build filter for videos that have transcripts but missing content
      let filterConditions = {
        transcript_text: { operator: 'IS NOT NULL' }
      };

      if (userId) {
        filterConditions.user_id = userId;
      }

      // Get videos from database
      let videos = [];
      try {
        // Try PostgreSQL first
        const allVideos = await databaseService.findAll('videos', { maxRecords: maxVideos * 2 });
        videos = allVideos.filter(record => {
          const fields = record.fields;
          return fields.transcript_text && 
                 fields.transcript_text.trim().length > 100 && // Minimum transcript length
                 (!fields.blog_text || !fields.discussion_guide_text); // Missing some content
        }).slice(0, maxVideos);
        
        logger.info(`Found ${videos.length} videos in PostgreSQL needing content generation`);
      } catch (pgError) {
        logger.warn('PostgreSQL query failed, trying Airtable:', pgError.message);
        
        // Fallback to Airtable
        const airtableVideos = await airtable.findAll('Videos', {
          filterByFormula: 'AND(NOT(transcript_text = ""), LEN(transcript_text) > 100)',
          maxRecords: maxVideos
        });
        
        videos = airtableVideos.filter(record => {
          const fields = record.fields;
          return !fields.blog_text || !fields.discussion_guide_text;
        });
        
        logger.info(`Found ${videos.length} videos in Airtable needing content generation`);
      }

      if (videos.length === 0) {
        logger.info('No videos found that need content generation');
        return [];
      }

      // Process videos
      const results = [];
      for (const video of videos) {
        try {
          const fields = video.fields;
          const result = await this.generateAllContentForVideo(
            video.id || fields.airtable_id,
            fields.videoid || fields.video_id,
            fields.transcript_text,
            { provider, contentTypes }
          );
          
          results.push(result);
          
          // Add delay between videos
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (error) {
          logger.error(`Failed to process video ${video.id}:`, error.message);
          results.push({
            videoId: fields.videoid || fields.video_id,
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

      // Get video statistics (try PostgreSQL first)
      let videoStats = { total: 0, withTranscripts: 0, withGeneratedContent: 0 };
      
      try {
        const allVideos = await databaseService.findAll('videos', { maxRecords: 1000 });
        videoStats.total = allVideos.length;
        videoStats.withTranscripts = allVideos.filter(v => v.fields.transcript_text?.length > 100).length;
        videoStats.withGeneratedContent = allVideos.filter(v => 
          v.fields.blog_text || v.fields.discussion_guide_text || v.fields.quiz_text
        ).length;
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