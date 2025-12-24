const axios = require('axios');
const { ApifyClient } = require('apify-client');
const { aiPrompts, video: videoModel } = require('../models');
const { logger } = require('../utils');

class TranscriptService {
  constructor() {
    this.apifyToken = process.env.APIFY_TOKEN;
    // Legacy support - still check for external API config
    this.legacyApiUrl = 'https://io.ourailegacy.com/api/appify/get-transcript';
    this.legacyApiKey = process.env.TRANSCRIPT_API_KEY;
    // Use internal Apify integration by default if token is available
    this.useInternalApi = !!this.apifyToken;

    if (this.useInternalApi) {
      logger.info('Transcript service initialized with internal Apify integration');
    } else if (this.legacyApiKey) {
      logger.info('Transcript service initialized with legacy external API');
    } else {
      logger.warn('No transcript API configured (APIFY_TOKEN or TRANSCRIPT_API_KEY). Transcript extraction will be disabled.');
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
   * Format captions array into timestamped transcript text
   * @param {Array} captions - Array of caption objects with start, end, text
   * @returns {string} Formatted transcript text
   */
  formatCaptions(captions) {
    if (!Array.isArray(captions)) {
      return '';
    }

    return captions.map(caption => {
      // Skip null, undefined, or non-object entries
      if (!caption || typeof caption !== 'object') {
        return '';
      }

      // Check for required properties
      if (caption.start !== undefined && caption.start !== null &&
          caption.end !== undefined && caption.end !== null &&
          caption.text) {
        const start = parseFloat(caption.start).toFixed(1);
        const end = parseFloat(caption.end).toFixed(1);
        return `${start} - ${end} ${caption.text}`;
      }

      // Handle captions with only text (no timing)
      if (caption.text) {
        return caption.text;
      }

      return '';
    }).filter(line => line.length > 0).join('\n');
  }

  /**
   * Extract transcript using internal Apify integration
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @returns {Promise<Object|null>} Raw transcript data or null if failed
   */
  async extractTranscriptViaApify(videoId, videoUrl) {
    const client = new ApifyClient({
      token: this.apifyToken,
    });

    // Prepare Actor input
    const input = {
      outputFormat: 'textWithTimestamps',
      urls: [videoUrl],
      maxRetries: 10,
      proxyOptions: {
        useApifyProxy: true,
        apifyProxyGroups: ['BUYPROXIES94952']
      }
    };

    logger.info(`Calling Apify actor for video: ${videoId}`);

    // Run the Apify actor for YouTube transcript extraction
    const run = await client.actor('1s7eXiaukVuOr4Ueg').call(input);

    // Fetch results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      logger.warn(`No transcript data returned from Apify for video: ${videoId}`);
      return null;
    }

    // Return the transcript data from the first item
    return items[0];
  }

  /**
   * Extract transcript using legacy external API
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @returns {Promise<Object|null>} Raw transcript data or null if failed
   */
  async extractTranscriptViaLegacyApi(videoId, videoUrl) {
    const payload = {
      videoId: videoId,
      videoUrl: videoUrl,
      api_key: this.legacyApiKey
    };

    const response = await axios.post(this.legacyApiUrl, payload, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'AmplifyContent/1.0'
      }
    });

    if (response.status === 200 && response.data) {
      return response.data;
    }

    return null;
  }

  /**
   * Extract transcript for a YouTube video
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @returns {Promise<string|null>} Video transcript or null if failed
   */
  async extractTranscript(videoId, videoUrl) {
    try {
      // Check if video processing has been cancelled before starting
      if (await this.isVideoCancelled(videoId)) {
        logger.info(`Video ${videoId} has been cancelled, skipping transcript extraction`);
        return null;
      }

      // Check if any transcript API is configured
      if (!this.useInternalApi && !this.legacyApiKey) {
        logger.warn('No transcript API configured, skipping transcript extraction');
        return null;
      }

      logger.info(`Extracting transcript for video: ${videoId} (using ${this.useInternalApi ? 'Apify' : 'legacy API'})`);

      // Get raw transcript data from the appropriate source
      let responseData;
      try {
        if (this.useInternalApi) {
          responseData = await this.extractTranscriptViaApify(videoId, videoUrl);
        } else {
          responseData = await this.extractTranscriptViaLegacyApi(videoId, videoUrl);
        }
      } catch (apiError) {
        logger.error(`Transcript API error for video ${videoId}:`, apiError.message);
        return null;
      }

      // Check again for cancellation after API call (in case cancelled during processing)
      if (await this.isVideoCancelled(videoId)) {
        logger.info(`Video ${videoId} was cancelled during transcript extraction, aborting`);
        return null;
      }

      if (responseData) {
        // Handle different response formats
        let transcript = null;

        if (typeof responseData === 'string') {
          transcript = responseData;
        } else if (typeof responseData === 'object') {
          // Check for captions array first (Apify format)
          if (responseData.captions && Array.isArray(responseData.captions)) {
            transcript = this.formatCaptions(responseData.captions);
          // Check if captions are nested in transcript object
          } else if (responseData.transcript && typeof responseData.transcript === 'object' && responseData.transcript.captions && Array.isArray(responseData.transcript.captions)) {
            transcript = this.formatCaptions(responseData.transcript.captions);
          // Try multiple possible object structures
          } else if (responseData.transcript) {
            transcript = responseData.transcript;
          } else if (responseData.text) {
            transcript = responseData.text;
          } else if (responseData.content) {
            transcript = responseData.content;
          } else if (responseData.data) {
            transcript = responseData.data;
          } else if (responseData.result) {
            transcript = responseData.result;
          } else if (Array.isArray(responseData) && responseData.length > 0) {
            // Handle array of transcript segments
            transcript = responseData.map(segment => {
              if (typeof segment === 'string') return segment;
              if (segment.text) return segment.text;
              if (segment.content) return segment.content;
              return '';
            }).join(' ');
          } else {
            logger.warn(`Unexpected object structure for video ${videoId}:`, Object.keys(responseData));
            logger.debug('Object structure details logged in debug mode');

            // Try to extract any string values from the object
            const stringValues = Object.values(responseData)
              .filter(val => typeof val === 'string' && val.length > 10);

            if (stringValues.length > 0) {
              transcript = stringValues.join(' ');
            } else {
              return null;
            }
          }
        } else {
          logger.warn(`Unexpected response format for video ${videoId}:`, typeof responseData);
          return null;
        }

        // Final conversion and validation
        if (transcript) {
          // If transcript is still an object, try to stringify it
          if (typeof transcript === 'object') {
            if (Array.isArray(transcript)) {
              transcript = transcript.join(' ');
            } else {
              transcript = JSON.stringify(transcript);
            }
          }

          // Ensure it's a string and has content
          if (typeof transcript === 'string' && transcript.trim().length > 0) {
            const trimmedTranscript = transcript.trim();

            // PostgreSQL can handle large text fields, but still apply reasonable limits
            const POSTGRES_MAX_FIELD_SIZE = 500000; // 500KB reasonable limit for PostgreSQL
            let finalTranscript = trimmedTranscript;

            if (trimmedTranscript.length > POSTGRES_MAX_FIELD_SIZE) {
              finalTranscript = trimmedTranscript.substring(0, POSTGRES_MAX_FIELD_SIZE - 100) + '\n\n[Transcript truncated due to size limit]';
              logger.warn(`Transcript truncated for ${videoId}: ${trimmedTranscript.length} -> ${finalTranscript.length} characters`);
            }

            logger.info(`Transcript extracted successfully for video ${videoId}: ${finalTranscript.length} characters`);
            return finalTranscript;
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        logger.warn(`No transcript data returned for video ${videoId}`);
        return null;
      }

    } catch (error) {
      logger.error(`Error extracting transcript for video ${videoId}:`, error.message);
      return null;
    }
  }

  /**
   * Update video transcript in PostgreSQL
   * @param {string} videoRecordId - Video record ID
   * @param {string} transcript - Video transcript text
   * @returns {Promise<Object>} Update results
   */
  async updateVideoTranscript(videoRecordId, transcript) {
    try {
      const results = {
        success: false,
        error: null
      };

      // Update using Video model
      try {
        await videoModel.updateVideo(videoRecordId, {
          transcript_text: transcript
        });
        results.success = true;
        logger.debug(`Updated video transcript for record ${videoRecordId} using Video model`);
      } catch (updateError) {
        results.error = updateError.message;
        logger.error(`Failed to update video transcript for ${videoRecordId}:`, updateError.message);
      }

      return results;

    } catch (error) {
      logger.error(`Error updating video transcript for ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Process transcript for a video (extract and update database)
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @param {string} videoRecordId - Video record ID
   * @param {string} userId - User ID
   * @param {Array} contentTypes - Content types to generate (optional)
   * @returns {Promise<Object>} Processing results
   */
  async processVideoTranscript(videoId, videoUrl, videoRecordId, userId = null, contentTypes = null) {
    try {
      logger.info(`Processing transcript for video ${videoId} (record: ${videoRecordId})`);

      const processingStatusService = require('./processing-status.service');

      // Update transcript status to processing
      processingStatusService.updateTranscriptStatus(videoId, 'pending');

      // Extract transcript
      const transcript = await this.extractTranscript(videoId, videoUrl);

      if (!transcript) {
        logger.info(`No transcript available for video ${videoId}`);

        // Update transcript status to failed
        processingStatusService.updateTranscriptStatus(videoId, 'failed', 'No transcript available');

        return {
          success: false,
          reason: 'No transcript available',
          transcript: null,
          updates: null
        };
      }

      // Update database
      const updateResults = await this.updateVideoTranscript(videoRecordId, transcript);

      const success = updateResults.success;

      // Update transcript status
      if (success) {
        processingStatusService.updateTranscriptStatus(videoId, 'completed');

        // Trigger cloud storage upload for transcript if user has auto-upload enabled
        if (userId) {
          this.triggerTranscriptCloudUpload(videoRecordId, transcript, userId)
            .catch(err => logger.warn(`Transcript cloud storage upload failed:`, err.message));
        }
      } else {
        processingStatusService.updateTranscriptStatus(videoId, 'failed', 'Database update failed');
      }

      logger.info(`Transcript processing completed for video ${videoId}`, {
        transcriptLength: transcript.length,
        success: updateResults.success
      });

      // Trigger content generation if transcript was successfully stored
      if (success) {
        try {
          const contentGenerationService = require('./content-generation.service');

          // Start content generation asynchronously - don't wait for completion
          logger.info(`Starting content generation for video ${videoId}`);

          // Use provided content types or get all available from database
          let typesToGenerate = contentTypes;

          if (!typesToGenerate || typesToGenerate.length === 0) {
            try {
              const contentTypes = await aiPrompts.getAvailableContentTypes();
              typesToGenerate = contentTypes.map(ct => ct.type);
              logger.info(`No content types specified, using all ${typesToGenerate.length} available types from AiPrompts model`);
            } catch (dbError) {
              logger.warn('Could not load content types from AiPrompts model, using fallback:', dbError.message);
              typesToGenerate = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text', 'ebook_text'];
            }
          } else {
            logger.info(`Using ${typesToGenerate.length} specified content types for generation: ${typesToGenerate.join(', ')}`);
          }

          contentGenerationService.generateAllContentForVideo(videoRecordId, videoId, transcript, {
            contentTypes: typesToGenerate,
            userId: userId
          }).then(result => {
            logger.info(`Content generation completed for video ${videoId}`, {
              successful: result.summary?.successful || 0,
              failed: result.summary?.failed || 0,
              contentTypes: typesToGenerate.length
            });
          }).catch(error => {
            logger.warn(`Content generation failed for video ${videoId}:`, error.message);
          });

        } catch (contentError) {
          logger.warn(`Error initiating content generation for video ${videoId}:`, contentError.message);
        }
      }

      return {
        success: success,
        transcript: transcript,
        updates: updateResults
      };

    } catch (error) {
      logger.error(`Error processing transcript for video ${videoId}:`, error);
      return {
        success: false,
        reason: error.message,
        transcript: null,
        updates: null
      };
    }
  }

  /**
   * Trigger cloud storage upload for transcript (runs in background)
   * @param {string} videoRecordId - PostgreSQL video record ID
   * @param {string} transcript - Transcript text
   * @param {number} userId - User ID
   */
  async triggerTranscriptCloudUpload(videoRecordId, transcript, userId) {
    try {
      if (!userId) {
        return; // No user ID, can't check preferences
      }

      const database = require('./database.service');

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

      logger.info(`Auto-uploading transcript to ${provider} for video ${videoRecordId}`);

      // Get video info for folder naming
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
      const folder = await cloudStorageService.ensureContentFolder(userId, provider, 'transcript_text', videoTitle, videoRecordId);

      const formatsToUpload = uploadFormat === 'both' ? ['docx', 'pdf'] : [uploadFormat];

      for (const format of formatsToUpload) {
        try {
          const fileName = `transcript.${format}`;
          let fileContent, mimeType;

          if (format === 'docx') {
            fileContent = await documentService.generateDocx(transcript, 'transcript_text', videoTitle);
            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          } else {
            fileContent = await documentService.generatePdf(transcript, 'transcript_text', videoTitle);
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
            'transcript_text',
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
          logger.error(`Failed to upload ${format} transcript to ${provider}:`, formatError.message);
          logger.info(`Continuing with remaining formats for transcript - one format failure doesn't block others`);
          // Continue with other formats even if one fails
        }
      }

    } catch (error) {
      logger.error(`Transcript cloud storage auto-upload failed:`, error.message);
      // Don't throw - this is a non-critical background task
    }
  }

  /**
   * Batch process transcripts for multiple videos
   * @param {Array} videos - Array of video objects with {videoId, videoUrl, recordId}
   * @param {Object} options - Processing options
   * @returns {Promise<Array>} Array of processing results
   */
  async batchProcessTranscripts(videos, options = {}) {
    try {
      const { concurrent = 3, delayBetween = 1000 } = options;

      logger.info(`Starting batch transcript processing for ${videos.length} videos`);

      const results = [];

      // Process in batches to avoid overwhelming the API
      for (let i = 0; i < videos.length; i += concurrent) {
        const batch = videos.slice(i, i + concurrent);

        logger.debug(`Processing batch ${Math.floor(i / concurrent) + 1}/${Math.ceil(videos.length / concurrent)}`);

        const batchPromises = batch.map(video =>
          this.processVideoTranscript(video.videoId, video.videoUrl, video.recordId)
            .catch(error => ({
              success: false,
              reason: error.message,
              videoId: video.videoId
            }))
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Add delay between batches to be respectful to the API
        if (i + concurrent < videos.length && delayBetween > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      }

      const successful = results.filter(r => r.success).length;
      logger.info(`Batch processing completed: ${successful}/${videos.length} successful`);

      return results;

    } catch (error) {
      logger.error('Error in batch transcript processing:', error);
      throw error;
    }
  }
}

module.exports = new TranscriptService();
