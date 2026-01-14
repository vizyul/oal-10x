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

      logger.debug(`Loaded ${this.supportedContentTypesCache.length} content types`);
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
   * Process ebook content to generate images for [AI_IMAGE: ...] placeholders
   * @param {string} videoId - Video ID (for logging)
   * @param {string} content - Generated ebook content with image placeholders
   * @returns {Promise<string>} Content with image placeholders replaced by base64 images
   */
  async processEbookImages(videoId, content) {
    try {
      // Check if image generation is available
      if (!aiChatService.isImageGenerationAvailable()) {
        logger.warn(`Image generation not available for video ${videoId}, returning content without images`);
        return content;
      }

      // Find all [AI_IMAGE: ...] placeholders
      const imageRegex = /\[AI_IMAGE:\s*([^\]]+)\]/g;
      const matches = [...content.matchAll(imageRegex)];

      if (matches.length === 0) {
        logger.debug(`No image placeholders found in ebook content for video ${videoId}`);
        return content;
      }

      logger.info(`Found ${matches.length} image placeholders in ebook content for video ${videoId}`);

      // Process each image placeholder
      let processedContent = content;
      let successCount = 0;
      let failCount = 0;

      for (const match of matches) {
        const fullPlaceholder = match[0];
        const imagePrompt = match[1].trim();

        try {
          logger.info(`Generating image for prompt: "${imagePrompt.substring(0, 50)}..."`);

          // Generate image using Gemini
          const imageResult = await aiChatService.generateImage(imagePrompt, {
            aspectRatio: '16:9'
          });

          if (imageResult.success && imageResult.image) {
            // Create base64 image tag
            const imageTag = `![Generated Image](data:${imageResult.image.mimeType};base64,${imageResult.image.base64})`;

            // Replace placeholder with image
            processedContent = processedContent.replace(fullPlaceholder, imageTag);
            successCount++;

            logger.info(`Successfully generated image ${successCount}/${matches.length} for video ${videoId}`);
          } else {
            throw new Error('Image generation returned no data');
          }

        } catch (imageError) {
          logger.error(`Failed to generate image for placeholder in video ${videoId}:`, {
            prompt: imagePrompt.substring(0, 100),
            error: imageError.message
          });

          // Replace with error placeholder instead of leaving the original
          const errorPlaceholder = `[Image generation failed: ${imagePrompt.substring(0, 50)}...]`;
          processedContent = processedContent.replace(fullPlaceholder, errorPlaceholder);
          failCount++;
        }
      }

      logger.info(`Ebook image processing complete for video ${videoId}`, {
        total: matches.length,
        success: successCount,
        failed: failCount
      });

      return processedContent;

    } catch (error) {
      logger.error(`Error processing ebook images for video ${videoId}:`, error.message);
      // Return original content if overall processing fails
      return content;
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
    const generationStartTime = new Date();
    let processedPrompt;

    try {

      // Update content status to generating and set start timestamp
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'generating');

      // Validate provider availability
      if (!aiChatService.isProviderAvailable(prompt.ai_provider)) {
        throw new Error(`AI provider ${prompt.ai_provider} not available`);
      }

      // Process the prompt template with sanitization
      processedPrompt = promptSanitizer.processTemplate(prompt.prompt_text, {
        TRANSCRIPT: transcript,
        VIDEO_ID: videoId
      });


      // Generate content with retry logic
      const generationResult = await aiChatService.generateContentWithRetry(
        prompt.ai_provider,
        {
          prompt: processedPrompt,
          systemMessage: prompt.system_message,
          temperature: prompt.temperature || 0.7,
          maxTokens: prompt.max_tokens || 2000,
          contentType: prompt.content_type
        },
        2 // Max retries
      );

      // Handle both old string format and new object format for backward compatibility
      let generatedContent = typeof generationResult === 'string' ? generationResult : generationResult.text;
      const metrics = typeof generationResult === 'object' ? generationResult.metrics : null;

      // Check if LLM actually generated content
      if (!generatedContent || generatedContent.trim() === '') {
        throw new Error(`LLM generated empty or null content for ${prompt.content_type}`);
      }

      // Post-processing for ebook_text: Generate images for [AI_IMAGE: ...] placeholders
      if (prompt.content_type === 'ebook_text') {
        generatedContent = await this.processEbookImages(videoId, generatedContent);
      }

      // Calculate generation duration
      const generationEndTime = new Date();
      const generationDuration = (generationEndTime - generationStartTime) / 1000;


      // Write content to database immediately
      try {
        const contentUpdate = {
          [prompt.content_type]: {
            content: generatedContent,
            provider: prompt.ai_provider,
            generationStartTime: generationStartTime,
            metrics: metrics
          }
        };


        await this.updateVideoWithGeneratedContent(videoRecordId, contentUpdate);


        // Update content status to completed ONLY after successful database write
        processingStatusService.updateContentStatus(videoId, prompt.content_type, 'completed');

        // Auto-upload to cloud storage if user has it configured (runs in background)
        this.triggerCloudStorageUpload(videoRecordId, prompt.content_type, generatedContent, _userId)
          .catch(err => logger.warn(`Cloud storage upload failed for ${prompt.content_type}:`, err.message));

        // Post-processing: If this is clips_text, trigger automatic clip downloads
        if (prompt.content_type === 'clips_text') {
          logger.info(`Clips JSON generated, triggering automatic clip downloads for video ${videoId}`);

          try {
            const clipsService = require('./clips.service');

            // Parse the JSON content (strip markdown code blocks if present)
            let jsonContent = generatedContent.trim();
            // Match both array [] and object {} formats
            const jsonMatch = jsonContent.match(/```(?:json)?\s*([[{][\s\S]*?[\]}])\s*```/);
            if (jsonMatch) {
              jsonContent = jsonMatch[1];
            }

            const clipsData = JSON.parse(jsonContent);

            // Handle both array format [{...}] and object format {clips: [{...}]}
            let clipsArray;
            if (Array.isArray(clipsData)) {
              clipsArray = clipsData;
            } else if (clipsData.clips && Array.isArray(clipsData.clips)) {
              clipsArray = clipsData.clips;
            } else {
              logger.warn(`Invalid clips JSON format for video ${videoId}, expected array or object with 'clips' property`);
              clipsArray = null;
            }

            if (clipsArray && clipsArray.length > 0) {
              // Save clips to database and trigger downloads
              const clipIds = await clipsService.saveClipSuggestions(
                videoRecordId,
                clipsArray,
                prompt.ai_provider
              );

              logger.info(`Saved ${clipIds.length} clip suggestions for video ${videoId}`);

              // Now trigger downloads for all clips (runs in background, doesn't block)
              if (clipIds.length > 0) {
                // Download and convert clips in background (don't await to avoid blocking)
                globalThis.setImmediate(async () => {
                  for (const clipId of clipIds) {
                    try {
                      logger.info(`Downloading clip ${clipId} for video ${videoId}`);
                      await clipsService.downloadClip(clipId);

                      logger.info(`Converting clip ${clipId} to vertical format`);
                      await clipsService.convertToVerticalFormat(clipId);

                      logger.info(`Clip ${clipId} downloaded and converted successfully`);
                    } catch (clipError) {
                      logger.error(`Failed to process clip ${clipId}:`, clipError.message);
                      // Continue with next clip even if one fails
                    }
                  }
                  logger.info(`✅ Finished processing ${clipIds.length} clips for video ${videoId}`);
                });
              }
            }
          } catch (clipsError) {
            logger.error(`Failed to process clips for video ${videoId}:`, clipsError.message);
            // Don't fail the overall content generation if clips processing fails
          }
        }

      } catch (dbError) {
        // Log database save failure
        logger.error(`❌ Database save failed for ${prompt.content_type}`, {
          videoId,
          contentType: prompt.content_type,
          databaseStatus: 'failed',
          finalGenerationStatus: 'failed',
          llmGenerationStatus: 'completed', // LLM succeeded but DB failed
          errorMessage: dbError.message,
          contentLength: generatedContent?.length || 0,
          generationDuration: `${generationDuration}s`
        });

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
        generatedAt: new Date().toISOString(),
        metrics: metrics
      };

    } catch (error) {
      // Calculate generation duration even for failures
      const generationEndTime = new Date();
      const generationDuration = (generationEndTime - generationStartTime) / 1000;

      // Analyze LLM generation failure
      const llmErrorDetails = this.analyzeLLMGenerationError(error, prompt, processedPrompt);

      // Log LLM generation failure with detailed analysis
      logger.error(`🚫 LLM generation failed for ${prompt.content_type}`, {
        videoId,
        contentType: prompt.content_type,
        aiProvider: prompt.ai_provider,
        finalGenerationStatus: 'failed',
        llmGenerationStatus: 'failed',
        errorMessage: error.message,
        errorType: error.constructor.name,
        errorCode: error.code,
        statusCode: error.status || error.statusCode,
        generationDuration: `${generationDuration}s`,
        promptName: prompt.name,
        promptLength: processedPrompt?.length || 'unknown',
        failureCategory: llmErrorDetails.category,
        failureReason: llmErrorDetails.reason,
        suggestedFix: llmErrorDetails.suggestedFix,
        retryable: llmErrorDetails.retryable,
        apiCost: llmErrorDetails.estimatedCost
      });

      // Update content status to failed with detailed metadata for frontend logging
      processingStatusService.updateContentStatus(videoId, prompt.content_type, 'failed', error.message, {
        isContentFiltered: llmErrorDetails.isContentFiltered || false,
        errorCode: error.code || llmErrorDetails.category,
        errorType: llmErrorDetails.category,
        suggestedFix: llmErrorDetails.suggestedFix,
        failureReason: llmErrorDetails.reason,
        frontendMessage: error.frontendMessage || error.message,
        errorDetails: error.details || null,
        aiProvider: prompt.ai_provider,
        contentType: prompt.content_type
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code || llmErrorDetails.category,
        isContentFiltered: llmErrorDetails.isContentFiltered || false,
        failureReason: llmErrorDetails.reason,
        suggestedFix: llmErrorDetails.suggestedFix,
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

      // Simple summary for successful cases, detailed for failures
      if (results.summary.failed === 0) {
        logger.info(`✅ All content generated for video ${videoId} (${results.summary.successful}/${results.summary.total} types)`);
      } else {
        // Detailed logging only for failures
        const failedTypeDetails = Object.keys(results.errors).map(promptName => {
          const prompt = relevantPrompts.find(p => p.name === promptName);
          return {
            contentType: prompt?.content_type || promptName,
            error: results.errors[promptName]
          };
        });

        logger.error(`❌ Partial content generation for video ${videoId}`, {
          videoId,
          successful: results.summary.successful,
          failed: results.summary.failed,
          provider: selectedProvider,
          completedTypes: Object.keys(results.content),
          failedTypes: failedTypeDetails,
          overallStatus: 'partial_completion'
        });
      }

      // Check if we should mark the video as completed in the database
      await this.checkAndUpdateVideoCompletion(videoRecordId, videoId);

      // Update YouTube video description if content was generated successfully
      if (results.summary.successful > 0 && userId) {
        await this.updateYouTubeDescription(videoId, videoRecordId, results, userId);
      }

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
      } catch {
        // If not found by direct ID, try by airtable_id (backward compatibility)
        try {
          video = await videoModel.findByAirtableId(videoRecordId);
          if (video) {
            actualVideoId = video.id;
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
      const processedTypes = [];
      const failedTypes = [];

      for (const [contentType, data] of Object.entries(generatedContent)) {
        if (!data.content) {
          logger.warn(`No content provided for content type ${contentType}`);
          failedTypes.push({ contentType, reason: 'No content provided' });
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
          const startTime = data.generationStartTime || now;
          const responseLength = data.metrics?.responseLength || null;
          const tokensUsed = data.metrics?.tokensUsed || null;
          const durationSeconds = Math.round((now - startTime) / 1000);

          if (existingContentResult.rows.length > 0) {
            // Update existing record
            const existingContentId = existingContentResult.rows[0].id;

            const updateQuery = `
              UPDATE video_content
              SET
                content_text = $1,
                ai_provider = $2,
                generation_status = 'completed',
                generation_started_at = $3,
                generation_completed_at = $4,
                generation_duration_seconds = $5,
                response_length = $6,
                tokens_used = $7,
                updated_at = $4,
                is_published = true,
                version = COALESCE(version, 0) + 1
              WHERE id = $8
            `;

            await database.query(updateQuery, [
              data.content,
              data.provider || 'unknown',
              startTime,
              now,
              durationSeconds,
              responseLength,
              tokensUsed,
              existingContentId
            ]);

            processedTypes.push({ contentType, status: 'updated' });

          } else {
            // Insert new record
            const insertQuery = `
              INSERT INTO video_content (
                video_id,
                content_type_id,
                content_text,
                ai_provider,
                generation_status,
                generation_started_at,
                generation_completed_at,
                generation_duration_seconds,
                response_length,
                tokens_used,
                is_published,
                version,
                created_at,
                updated_at
              ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, true, 1, $6, $6)
            `;

            await database.query(insertQuery, [
              actualVideoId,
              contentTypeRecord.id,
              data.content,
              data.provider || 'unknown',
              startTime,
              now,
              durationSeconds,
              responseLength,
              tokensUsed
            ]);

            processedTypes.push({ contentType, status: 'created' });
          }

        } catch (contentError) {
          logger.error(`Error saving content type ${contentType} for video ${actualVideoId}:`, contentError.message);
          failedTypes.push({ contentType, reason: contentError.message });
          throw new Error(`Failed to save ${contentType}: ${contentError.message}`);
        }
      }


      // Throw error if any content types failed
      if (failedTypes.length > 0) {
        const failureMessage = `${failedTypes.length} content type(s) failed: ${failedTypes.map(f => `${f.contentType} (${f.reason})`).join(', ')}`;
        throw new Error(failureMessage);
      }

    } catch (error) {
      logger.error(`Error updating video ${videoRecordId} with generated content:`, error);
      throw error;
    }
  }

  /**
   * Analyze content save errors to provide detailed failure reasons
   * @param {Error} error - The error that occurred
   * @param {string} contentType - Content type being saved
   * @param {number} videoId - Video ID
   * @param {Object} data - Content data
   * @returns {Object} Error analysis with category, reason, and suggested fix
   */
  analyzeContentSaveError(error, contentType, videoId, data) {
    const analysis = {
      category: 'unknown',
      reason: error.message,
      suggestedFix: 'Review logs and try again',
      retryable: false
    };

    // PostgreSQL specific error codes
    if (error.code) {
      switch (error.code) {
        case '23505': // unique_violation
          analysis.category = 'duplicate_content';
          analysis.reason = `Duplicate content detected for ${contentType} - content already exists`;
          analysis.suggestedFix = 'Use UPDATE instead of INSERT, or check for existing content first';
          analysis.retryable = false;
          break;

        case '23503': // foreign_key_violation
          analysis.category = 'foreign_key_violation';
          if (error.message.includes('content_type_id')) {
            analysis.reason = `Content type '${contentType}' not found in content_types table`;
            analysis.suggestedFix = 'Ensure content type exists and is active in content_types table';
          } else if (error.message.includes('video_id')) {
            analysis.reason = `Video ID ${videoId} not found in videos table`;
            analysis.suggestedFix = 'Ensure video exists in videos table before generating content';
          } else {
            analysis.reason = 'Foreign key constraint violation - referenced record not found';
            analysis.suggestedFix = 'Check that all referenced records exist';
          }
          analysis.retryable = false;
          break;

        case '23514': // check_violation
          analysis.category = 'data_validation';
          analysis.reason = 'Data validation failed - content violates database constraints';
          analysis.suggestedFix = 'Check content format, length, and required fields';
          analysis.retryable = false;
          break;

        case '23502': // not_null_violation
          analysis.category = 'missing_required_data';
          analysis.reason = 'Required field is null or missing';
          analysis.suggestedFix = 'Ensure all required fields are provided';
          analysis.retryable = false;
          break;

        case '42P01': // undefined_table
          analysis.category = 'schema_error';
          analysis.reason = 'Database table not found - possible schema migration issue';
          analysis.suggestedFix = 'Check database schema and run migrations if needed';
          analysis.retryable = false;
          break;

        case '42703': // undefined_column
          analysis.category = 'schema_error';
          analysis.reason = 'Database column not found - possible schema mismatch';
          analysis.suggestedFix = 'Check database schema matches application code';
          analysis.retryable = false;
          break;

        case '53300': // too_many_connections
          analysis.category = 'connection_limit';
          analysis.reason = 'Database connection limit exceeded';
          analysis.suggestedFix = 'Retry after brief delay when connections available';
          analysis.retryable = true;
          break;

        case '57014': // query_canceled
          analysis.category = 'query_timeout';
          analysis.reason = 'Database query was canceled or timed out';
          analysis.suggestedFix = 'Retry with shorter content or check database performance';
          analysis.retryable = true;
          break;

        case '08006': // connection_failure
        case '08000': // connection_exception
          analysis.category = 'connection_error';
          analysis.reason = 'Database connection failed';
          analysis.suggestedFix = 'Check database connectivity and retry';
          analysis.retryable = true;
          break;

        default:
          analysis.category = 'database_error';
          analysis.reason = `Database error (${error.code}): ${error.message}`;
          analysis.suggestedFix = 'Check database logs for detailed error information';
          analysis.retryable = true;
      }
    }
    // Content-specific validation errors
    else if (error.message.includes('content_text')) {
      if (data.content && data.content.length > 50000) {
        analysis.category = 'content_too_large';
        analysis.reason = `Content too large (${data.content.length} chars) for ${contentType}`;
        analysis.suggestedFix = 'Truncate content or increase database field size';
        analysis.retryable = false;
      } else if (!data.content || data.content.trim() === '') {
        analysis.category = 'empty_content';
        analysis.reason = `Empty or null content provided for ${contentType}`;
        analysis.suggestedFix = 'Ensure LLM generated valid content before saving';
        analysis.retryable = true;
      }
    }
    // Network/connection errors
    else if (error.message.includes('ECONNRESET') || error.message.includes('ENOTFOUND')) {
      analysis.category = 'network_error';
      analysis.reason = 'Network connection to database failed';
      analysis.suggestedFix = 'Check network connectivity and retry';
      analysis.retryable = true;
    }
    // Timeout errors
    else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
      analysis.category = 'timeout_error';
      analysis.reason = 'Database operation timed out';
      analysis.suggestedFix = 'Retry with shorter content or check database performance';
      analysis.retryable = true;
    }
    // Verification failures
    else if (error.message.includes('Verification failed')) {
      analysis.category = 'verification_failure';
      analysis.reason = 'Content saved but verification query failed to find it';
      analysis.suggestedFix = 'Check for transaction rollback or database consistency issues';
      analysis.retryable = true;
    }

    return analysis;
  }

  /**
   * Analyze LLM generation errors to provide detailed failure reasons
   * @param {Error} error - The error that occurred during LLM generation
   * @param {Object} prompt - The prompt configuration used
   * @param {string} processedPrompt - The actual prompt sent to LLM
   * @returns {Object} Error analysis with category, reason, and suggested fix
   */
  analyzeLLMGenerationError(error, prompt, processedPrompt) {
    const analysis = {
      category: 'unknown',
      reason: error.message,
      suggestedFix: 'Review error and try again',
      retryable: false,
      estimatedCost: 'unknown'
    };

    // API key and authentication errors
    if (error.status === 401 || error.statusCode === 401 || error.message.includes('API key') || error.message.includes('authentication')) {
      analysis.category = 'authentication_error';
      analysis.reason = `Invalid or missing API key for ${prompt.ai_provider}`;
      analysis.suggestedFix = 'Check API key configuration and permissions';
      analysis.retryable = false;
    }
    // Rate limiting errors
    else if (error.status === 429 || error.statusCode === 429 || error.message.includes('rate limit') || error.message.includes('quota')) {
      analysis.category = 'rate_limit_exceeded';
      analysis.reason = `${prompt.ai_provider} rate limit or quota exceeded`;
      analysis.suggestedFix = 'Wait before retrying or upgrade API plan';
      analysis.retryable = true;
    }
    // Content policy violations and safety filter blocks
    else if (error.code === 'CONTENT_FILTERED' || (error.status === 400 && (error.message.includes('content policy') || error.message.includes('safety') || error.message.includes('inappropriate')))) {
      analysis.category = 'content_policy_violation';
      analysis.reason = `The video content triggered ${prompt.ai_provider} safety filters. This may happen with religious, political, or other sensitive topics.`;
      analysis.suggestedFix = 'The video content may contain topics that AI providers restrict. Try using a different AI provider in your settings, or the content may need to be manually created.';
      analysis.retryable = false;
      analysis.isContentFiltered = true;
    }
    // Token limit exceeded
    else if (error.message.includes('token') && (error.message.includes('limit') || error.message.includes('exceeded') || error.message.includes('maximum'))) {
      analysis.category = 'token_limit_exceeded';
      analysis.reason = `Prompt or response exceeded token limits for ${prompt.ai_provider}`;
      analysis.suggestedFix = 'Reduce prompt size or increase max_tokens setting';
      analysis.retryable = false;

      // Estimate cost based on prompt length
      const estimatedTokens = Math.ceil((processedPrompt?.length || 0) / 4);
      analysis.estimatedCost = `~${estimatedTokens} tokens`;
    }
    // Network and connectivity errors
    else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.message.includes('network')) {
      analysis.category = 'network_error';
      analysis.reason = `Network connectivity issue with ${prompt.ai_provider} API`;
      analysis.suggestedFix = 'Check internet connection and API endpoint status';
      analysis.retryable = true;
    }
    // Server errors (5xx)
    else if (error.status >= 500 || error.statusCode >= 500) {
      analysis.category = 'api_server_error';
      analysis.reason = `${prompt.ai_provider} API server error (${error.status || error.statusCode})`;
      analysis.suggestedFix = 'Retry after brief delay - server issue on API provider side';
      analysis.retryable = true;
    }
    // Client errors (4xx)
    else if (error.status >= 400 && error.status < 500) {
      analysis.category = 'api_client_error';
      analysis.reason = `Invalid request to ${prompt.ai_provider} API (${error.status})`;
      analysis.suggestedFix = 'Check request format, parameters, and API documentation';
      analysis.retryable = false;
    }
    // Timeout errors
    else if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
      analysis.category = 'request_timeout';
      analysis.reason = `Request to ${prompt.ai_provider} API timed out`;
      analysis.suggestedFix = 'Reduce prompt complexity or increase timeout settings';
      analysis.retryable = true;
    }
    // Model-specific errors
    else if (error.message.includes('model') && error.message.includes('not found')) {
      analysis.category = 'model_not_found';
      analysis.reason = `AI model not available or invalid for ${prompt.ai_provider}`;
      analysis.suggestedFix = 'Check model name and availability in API documentation';
      analysis.retryable = false;
    }
    // JSON parsing errors (malformed API response)
    else if (error.message.includes('JSON') || error.message.includes('parse')) {
      analysis.category = 'response_parsing_error';
      analysis.reason = `Invalid or malformed response from ${prompt.ai_provider} API`;
      analysis.suggestedFix = 'Retry request - may be temporary API response issue';
      analysis.retryable = true;
    }
    // Content generation failures (empty or invalid responses)
    else if (error.message.includes('empty') || error.message.includes('no content') || error.message.includes('invalid response')) {
      analysis.category = 'empty_response';
      analysis.reason = `${prompt.ai_provider} returned empty or invalid content`;
      analysis.suggestedFix = 'Modify prompt to be more specific or try different parameters';
      analysis.retryable = true;
    }
    // Provider-specific error handling
    else if (prompt.ai_provider === 'gemini') {
      if (error.message.includes('SAFETY')) {
        analysis.category = 'safety_filter';
        analysis.reason = 'Content blocked by Gemini safety filters';
        analysis.suggestedFix = 'Modify prompt to avoid potentially harmful content';
        analysis.retryable = false;
      } else if (error.message.includes('RECITATION')) {
        analysis.category = 'recitation_filter';
        analysis.reason = 'Content blocked due to potential copyright recitation';
        analysis.suggestedFix = 'Modify prompt to request original content only';
        analysis.retryable = false;
      }
    }
    else if (prompt.ai_provider === 'openai') {
      if (error.message.includes('content_filter')) {
        analysis.category = 'content_filter';
        analysis.reason = 'Content blocked by OpenAI content filter';
        analysis.suggestedFix = 'Modify prompt to comply with OpenAI usage policies';
        analysis.retryable = false;
      }
    }

    // Add retry recommendation based on category
    if (['network_error', 'api_server_error', 'request_timeout', 'rate_limit_exceeded', 'response_parsing_error', 'empty_response'].includes(analysis.category)) {
      analysis.retryable = true;
    }

    return analysis;
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


      // Get videos from PostgreSQL database using Video model
      const allVideos = await videoModel.findAll({}, { limit: maxVideos * 2 });

      // Get dynamic content types from ai_prompts table
      const supportedTypes = await this.getSupportedContentTypes();

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

        // Include if missing any supported content type
        return supportedTypes.some(type => !record[type]);
      }).slice(0, maxVideos);


      if (videos.length === 0) {
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

        // Get dynamic content types and check if any content exists
        const supportedTypes = await this.getSupportedContentTypes();
        videoStats.withGeneratedContent = allVideos.filter(v => {
          return supportedTypes.some(type => v[type]);
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

      // Check if video has transcript
      const video = await videoModel.findById(videoRecordId);
      if (!video || !video.transcript_text || video.transcript_text.trim() === '') {
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
      }
      // No else needed - if no content, video status remains unchanged

    } catch (error) {
      const { logger } = require('../utils');
      logger.error(`Error checking video completion for ${videoId}:`, error);
    }
  }

  /**
   * Update YouTube video description with summary and chapters
   * @param {string} videoId - YouTube video ID
   * @param {string} videoRecordId - PostgreSQL video record ID
   * @param {Object} results - Content generation results
   * @param {string} userId - User ID
   */
  async updateYouTubeDescription(videoId, videoRecordId, results, userId) {
    try {
      // Check if video was imported through YouTube integration (has OAuth tokens)
      const { video: videoModel } = require('../models');
      const video = await videoModel.findById(videoRecordId);

      if (!video || !video.imported_via_youtube_oauth) {
        logger.debug(`Video ${videoId} not imported via YouTube OAuth, skipping description update`);
        return;
      }

      // Get summary and chapters from generated content
      const summary = results.content.summary_text?.content || null;
      const chapters = results.content.chapters_text?.content || null;

      // Only update if we have summary or chapters
      if (!summary && !chapters) {
        logger.debug(`No summary or chapters generated for video ${videoId}, skipping description update`);
        return;
      }

      // Call YouTube OAuth service to update description
      const youtubeOAuthService = require('./youtube-oauth.service');

      try {
        const updateResult = await youtubeOAuthService.updateVideoDescription(
          userId,
          videoId,
          summary,
          chapters
        );

        if (updateResult.success) {
          logger.info(`✅ Updated YouTube description for video ${videoId}`, {
            videoId,
            originalLength: updateResult.originalDescriptionLength,
            newLength: updateResult.newDescriptionLength,
            addedLength: updateResult.addedContentLength,
            truncated: updateResult.truncated
          });
        }
      } catch (youtubeError) {
        // Don't fail content generation if YouTube update fails
        logger.warn(`Failed to update YouTube description for video ${videoId}:`, youtubeError.message);

        // Check if it's an authentication issue
        if (youtubeError.message.includes('tokens') || youtubeError.message.includes('authentication')) {
          logger.info(`YouTube OAuth tokens may need refresh for user ${userId}`);
        }
      }

    } catch (error) {
      logger.error(`Error updating YouTube description for video ${videoId}:`, error.message);
      // Don't throw - this is a non-critical enhancement
    }
  }

  /**
   * Trigger cloud storage upload for generated content (runs in background)
   * @param {string} videoRecordId - PostgreSQL video record ID
   * @param {string} contentType - Content type that was generated
   * @param {string} content - Generated content text
   * @param {number} userId - User ID
   */
  async triggerCloudStorageUpload(videoRecordId, contentType, content, userId) {
    try {
      if (!userId) {
        return; // No user ID, can't check preferences
      }

      // Get user preferences for cloud storage
      const prefResult = await database.query(`
        SELECT cloud_storage_provider, cloud_storage_auto_upload,
               cloud_storage_upload_format, cloud_storage_folder_per_video
        FROM user_preferences WHERE users_id = $1
      `, [userId]);

      const prefs = prefResult.rows[0];

      // Check if auto-upload is enabled
      if (!prefs || !prefs.cloud_storage_auto_upload || !prefs.cloud_storage_provider) {
        return; // Auto-upload not enabled
      }

      const provider = prefs.cloud_storage_provider;
      const uploadFormat = prefs.cloud_storage_upload_format || 'both';

      // Skip certain content types that shouldn't be auto-uploaded
      if (['clips_text'].includes(contentType)) {
        return;
      }

      logger.info(`Auto-uploading ${contentType} to ${provider} for video ${videoRecordId}`);

      // Get video info for folder naming
      const { video: videoModel } = require('../models');
      const video = await videoModel.findById(videoRecordId);
      if (!video) {
        logger.warn(`Video ${videoRecordId} not found for cloud upload`);
        return;
      }

      const cloudStorageService = require('./cloud-storage.service');
      const documentService = require('./document-generation.service');

      // Get video title for folder naming
      const videoTitle = video.video_title || 'Untitled Video';

      // Create folder structure (AmplifyContent/VideoTitle_Code/)
      // Pass videoRecordId to reuse existing folder for same video
      const folder = await cloudStorageService.ensureContentFolder(userId, provider, contentType, videoTitle, videoRecordId);

      const formatsToUpload = uploadFormat === 'both' ? ['docx', 'pdf'] : [uploadFormat];

      for (const format of formatsToUpload) {
        try {
          const fileName = `${contentType.replace(/_text$/, '')}.${format}`;
          let fileContent, mimeType;

          if (format === 'docx') {
            fileContent = await documentService.generateDocx(content, contentType, videoTitle);
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          } else {
            fileContent = await documentService.generatePdf(content, contentType, videoTitle);
            mimeType = 'application/pdf';
          }

          const result = await cloudStorageService.uploadFile(
            userId, provider, fileName, fileContent, mimeType,
            folder.folderPath || folder.folderId
          );

          // Track upload in database
          const cloudStorageCredentials = require('../models/CloudStorageCredentials');
          const credential = await cloudStorageCredentials.getUserProviderCredential(userId, provider);

          await database.query(`
            INSERT INTO cloud_storage_uploads (
              users_id, cloud_storage_credentials_id, videos_id,
              provider, content_type, file_format, file_name, file_size,
              cloud_file_id, cloud_file_url, cloud_folder_id, cloud_folder_path,
              status, completed_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed', CURRENT_TIMESTAMP)
          `, [
            userId,
            credential?.id,
            videoRecordId,
            provider,
            contentType,
            format,
            fileName,
            fileContent.length,
            result.fileId,
            result.webViewLink || result.webUrl || result.sharedLink,
            folder.folderId,
            folder.folderPath
          ]);

          logger.info(`Auto-uploaded ${fileName} to ${provider} successfully`);

        } catch (formatError) {
          logger.error(`Failed to upload ${format} ${contentType} to ${provider}:`, formatError.message);
          logger.info(`Continuing with remaining formats for ${contentType} - one format failure doesn't block others`);
          // Continue with other formats even if one fails
        }
      }

    } catch (error) {
      logger.error(`Cloud storage auto-upload failed for ${contentType}:`, error.message);
      // Don't throw - this is a non-critical background task
    }
  }
}

module.exports = new ContentGenerationService();
