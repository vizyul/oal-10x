const axios = require('axios');
const { logger } = require('../utils');

class TranscriptService {
  constructor() {
    this.apiUrl = 'https://io.ourailegacy.com/api/appify/get-transcript';
    this.apiKey = process.env.TRANSCRIPT_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('TRANSCRIPT_API_KEY not configured. Transcript extraction will be disabled.');
    } else {
      logger.info('Transcript service initialized successfully');
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
      if (typeof caption === 'object' && caption.start !== undefined && caption.end !== undefined && caption.text) {
        const start = parseFloat(caption.start).toFixed(1);
        const end = parseFloat(caption.end).toFixed(1);
        return `${start} - ${end} ${caption.text}`;
      }
      return '';
    }).filter(line => line.length > 0).join('\n');
  }

  /**
   * Extract transcript for a YouTube video
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @returns {Promise<string|null>} Video transcript or null if failed
   */
  async extractTranscript(videoId, videoUrl) {
    try {
      if (!this.apiKey) {
        logger.warn('Transcript API key not configured, skipping transcript extraction');
        return null;
      }

      logger.info(`Extracting transcript for video: ${videoId}`);

      const payload = {
        videoId: videoId,
        videoUrl: videoUrl,
        api_key: this.apiKey
      };

      const response = await axios.post(this.apiUrl, payload, {
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OurAILegacy/1.0'
        }
      });

      if (response.status === 200 && response.data) {
        // Handle different response formats
        let transcript = null;
        
        if (typeof response.data === 'string') {
          transcript = response.data;
        } else if (typeof response.data === 'object') {
          // Check for captions array first (new format)
          if (response.data.captions && Array.isArray(response.data.captions)) {
            transcript = this.formatCaptions(response.data.captions);
          // Check if captions are nested in transcript object
          } else if (response.data.transcript && typeof response.data.transcript === 'object' && response.data.transcript.captions && Array.isArray(response.data.transcript.captions)) {
            transcript = this.formatCaptions(response.data.transcript.captions);
          // Try multiple possible object structures
          } else if (response.data.transcript) {
            transcript = response.data.transcript;
          } else if (response.data.text) {
            transcript = response.data.text;
          } else if (response.data.content) {
            transcript = response.data.content;
          } else if (response.data.data) {
            transcript = response.data.data;
          } else if (response.data.result) {
            transcript = response.data.result;
          } else if (Array.isArray(response.data) && response.data.length > 0) {
            // Handle array of transcript segments
            transcript = response.data.map(segment => {
              if (typeof segment === 'string') return segment;
              if (segment.text) return segment.text;
              if (segment.content) return segment.content;
              return '';
            }).join(' ');
          } else {
            logger.warn(`Unexpected object structure for video ${videoId}:`, Object.keys(response.data));
            logger.debug(`Object structure details logged in debug mode`);
            
            // Try to extract any string values from the object
            const stringValues = Object.values(response.data)
              .filter(val => typeof val === 'string' && val.length > 10);
            
            if (stringValues.length > 0) {
              transcript = stringValues.join(' ');
            } else {
              return null;
            }
          }
        } else {
          logger.warn(`Unexpected response format for video ${videoId}:`, typeof response.data);
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
            
            // Airtable has a field size limit, so truncate very large transcripts
            const AIRTABLE_MAX_FIELD_SIZE = 100000; // 100KB limit for Airtable
            let finalTranscript = trimmedTranscript;
            
            if (trimmedTranscript.length > AIRTABLE_MAX_FIELD_SIZE) {
              finalTranscript = trimmedTranscript.substring(0, AIRTABLE_MAX_FIELD_SIZE - 100) + '\n\n[Transcript truncated due to size limit]';
              logger.warn(`Transcript truncated for ${videoId}: ${trimmedTranscript.length} -> ${finalTranscript.length} characters`);
            }
            
            return finalTranscript;
          } else {
            return null;
          }
        } else {
          return null;
        }
      } else {
        logger.warn(`Unexpected response status ${response.status} for video ${videoId}`);
        return null;
      }

    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        logger.warn(`Transcript extraction timeout for video ${videoId}`);
      } else if (error.response) {
        logger.warn(`Transcript API error for video ${videoId}:`, {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else {
        logger.error(`Error extracting transcript for video ${videoId}:`, error.message);
      }
      return null;
    }
  }

  /**
   * Update video transcript in both Airtable and PostgreSQL
   * @param {string} videoRecordId - Airtable record ID
   * @param {string} transcript - Video transcript text
   * @returns {Promise<Object>} Update results
   */
  async updateVideoTranscript(videoRecordId, transcript) {
    try {
      const airtable = require('./airtable.service');
      const databaseService = require('./database.service');

      const results = {
        airtable: { success: false, error: null },
        postgres: { success: false, error: null }
      };

      // Update Airtable
      try {
        await airtable.update('Videos', videoRecordId, {
          transcript_text: transcript
        });
        results.airtable.success = true;
        logger.debug(`Updated Airtable transcript for record ${videoRecordId}`);
      } catch (airtableError) {
        results.airtable.error = airtableError.message;
        logger.error(`Failed to update Airtable transcript for ${videoRecordId}:`, airtableError.message);
      }

      // Update PostgreSQL - find record by Airtable ID
      try {
        const postgresRecords = await databaseService.findByField('videos', 'airtable_id', videoRecordId);
        
        if (postgresRecords.length > 0) {
          const postgresRecord = postgresRecords[0];
          await databaseService.update('videos', postgresRecord.fields.id, {
            transcript_text: transcript
          });
          results.postgres.success = true;
          logger.debug(`Updated PostgreSQL transcript for record ${postgresRecord.fields.id}`);
        } else {
          results.postgres.error = 'PostgreSQL record not found';
          logger.warn(`PostgreSQL record not found for Airtable ID ${videoRecordId}`);
        }
      } catch (postgresError) {
        results.postgres.error = postgresError.message;
        logger.error(`Failed to update PostgreSQL transcript for ${videoRecordId}:`, postgresError.message);
      }

      return results;

    } catch (error) {
      logger.error(`Error updating video transcript for ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Process transcript for a video (extract and update databases)
   * @param {string} videoId - YouTube video ID
   * @param {string} videoUrl - Full YouTube video URL
   * @param {string} videoRecordId - Airtable record ID
   * @returns {Promise<Object>} Processing results
   */
  async processVideoTranscript(videoId, videoUrl, videoRecordId, userId = null) {
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

      // Update databases
      const updateResults = await this.updateVideoTranscript(videoRecordId, transcript);

      const success = updateResults.airtable.success || updateResults.postgres.success;
      
      // Update transcript status
      if (success) {
        processingStatusService.updateTranscriptStatus(videoId, 'completed');
      } else {
        processingStatusService.updateTranscriptStatus(videoId, 'failed', 'Database update failed');
      }

      logger.info(`Transcript processing completed for video ${videoId}`, {
        transcriptLength: transcript.length,
        airtableSuccess: updateResults.airtable.success,
        postgresSuccess: updateResults.postgres.success
      });

      // Trigger content generation if transcript was successfully stored
      if (success) {
        try {
          const contentGenerationService = require('./content-generation.service');
          
          // Start content generation asynchronously - don't wait for completion
          logger.info(`Starting content generation for video ${videoId}`);
          
          contentGenerationService.generateAllContentForVideo(videoRecordId, videoId, transcript, {
            contentTypes: ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text'], // Generate all content types
            userId: userId
          }).then(result => {
            logger.info(`✅ Content generation completed for video ${videoId}`, {
              successful: result.summary?.successful || 0,
              failed: result.summary?.failed || 0
            });
          }).catch(error => {
            logger.warn(`⚠️  Content generation failed for video ${videoId}:`, error.message);
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