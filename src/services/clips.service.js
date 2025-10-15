const aiChatService = require('./ai-chat.service');
const promptSanitizer = require('../utils/prompt-sanitizer');
const database = require('./database.service');
const { aiPrompts, video: videoModel } = require('../models');
const { logger } = require('../utils');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;

const execPromise = util.promisify(exec);

class ClipsService {
  constructor() {
    this.clipsStoragePath = path.join(__dirname, '..', '..', 'storage', 'clips');
    this.ensureStorageDirectory();
  }

  /**
   * Ensure clips storage directory exists
   */
  async ensureStorageDirectory() {
    try {
      await fs.mkdir(this.clipsStoragePath, { recursive: true });
      logger.info(`Clips storage directory ready: ${this.clipsStoragePath}`);
    } catch (error) {
      logger.error('Error creating clips storage directory:', error);
    }
  }

  /**
   * Generate clip suggestions from video transcript using AI
   * @param {string} videoRecordId - Video record ID
   * @param {string} transcript - Video transcript with timestamps
   * @param {Object} options - Generation options
   * @returns {Promise<Array>} Array of clip suggestions
   */
  async generateClipSuggestions(videoRecordId, transcript, options = {}) {
    try {
      const {
        provider = 'gemini',
        maxClips = 10
      } = options;

      logger.info(`Generating clip suggestions for video ${videoRecordId} using ${provider}`);

      // Get video details
      const video = await videoModel.findById(videoRecordId);
      if (!video) {
        throw new Error(`Video not found: ${videoRecordId}`);
      }

      // Get clips AI prompt
      const contentTypeQuery = `SELECT id FROM content_types WHERE key = 'clips_text'`;
      const contentTypeResult = await database.query(contentTypeQuery);

      if (contentTypeResult.rows.length === 0) {
        throw new Error('clips_text content type not found. Run setup-video-clips-schema.js first.');
      }

      const contentTypeId = contentTypeResult.rows[0].id;

      const promptQuery = `
        SELECT * FROM ai_prompts
        WHERE content_type_id = $1 AND ai_provider = $2 AND is_active = true
        LIMIT 1
      `;

      const promptResult = await database.query(promptQuery, [contentTypeId, provider]);

      if (promptResult.rows.length === 0) {
        throw new Error(`No active ${provider} prompt found for clips generation`);
      }

      const promptConfig = promptResult.rows[0];

      // Process prompt with transcript
      const processedPrompt = promptSanitizer.processTemplate(promptConfig.prompt_text, {
        TRANSCRIPT: transcript
      });

      // Generate clip suggestions using AI
      logger.debug('Sending transcript to AI for clip analysis...');
      const generationResult = await aiChatService.generateContentWithRetry(
        provider,
        {
          prompt: processedPrompt,
          systemMessage: promptConfig.system_message,
          temperature: promptConfig.temperature || 0.7,
          maxTokens: promptConfig.max_tokens || 4000
          // Note: model is set by ai-chat.service defaults (gemini-flash-lite-latest for gemini)
        },
        2 // Max retries
      );

      const generatedContent = typeof generationResult === 'string' ? generationResult : generationResult.text;

      // Parse JSON response
      let clipSuggestions;
      try {
        // Try to extract JSON from markdown code blocks if present
        const jsonMatch = generatedContent.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        const jsonContent = jsonMatch ? jsonMatch[1] : generatedContent;

        clipSuggestions = JSON.parse(jsonContent.trim());

        if (!Array.isArray(clipSuggestions)) {
          throw new Error('AI response is not an array');
        }
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', parseError.message);
        logger.debug('AI Response:', generatedContent.substring(0, 500));
        throw new Error('AI returned invalid JSON format for clips');
      }

      // Validate and normalize clip data
      const validatedClips = [];
      for (const clip of clipSuggestions.slice(0, maxClips)) {
        if (!clip.start_time || !clip.end_time || !clip.title) {
          logger.warn('Skipping invalid clip suggestion:', clip);
          continue;
        }

        // Ensure times are numbers
        const startTime = parseFloat(clip.start_time);
        const endTime = parseFloat(clip.end_time);

        if (isNaN(startTime) || isNaN(endTime) || startTime >= endTime) {
          logger.warn('Skipping clip with invalid timestamps:', clip);
          continue;
        }

        // Ensure duration is within reasonable bounds (15-60 seconds)
        const duration = endTime - startTime;
        if (duration < 10 || duration > 120) {
          logger.warn(`Skipping clip with duration ${duration}s (must be 10-120s):`, clip.title);
          continue;
        }

        validatedClips.push({
          title: clip.title.substring(0, 255), // Limit title length
          description: clip.description || '',
          start_time: startTime,
          end_time: endTime,
          relevance_score: clip.relevance_score || 7,
          hook: clip.hook || ''
        });
      }

      logger.info(`Generated ${validatedClips.length} valid clip suggestions for video ${videoRecordId}`);

      return validatedClips;

    } catch (error) {
      logger.error(`Error generating clip suggestions for video ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Save clip suggestions to database
   * @param {string} videoRecordId - Video record ID
   * @param {Array} clips - Array of clip suggestions
   * @param {string} aiProvider - AI provider used
   * @returns {Promise<Array>} Array of saved clip IDs
   */
  async saveClipSuggestions(videoRecordId, clips, aiProvider) {
    try {
      const video = await videoModel.findById(videoRecordId);
      if (!video) {
        throw new Error(`Video not found: ${videoRecordId}`);
      }

      const savedClipIds = [];

      for (const clip of clips) {
        // Generate YouTube clip URL with timestamp
        const youtubeClipUrl = `${video.youtube_url}?t=${Math.floor(clip.start_time)}`;

        const insertQuery = `
          INSERT INTO video_clips (
            video_id,
            clip_title,
            clip_description,
            start_time_seconds,
            end_time_seconds,
            youtube_clip_url,
            ai_provider,
            ai_relevance_score,
            status,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          RETURNING id
        `;

        const result = await database.query(insertQuery, [
          videoRecordId,
          clip.title,
          clip.description || clip.hook || '',
          clip.start_time,
          clip.end_time,
          youtubeClipUrl,
          aiProvider,
          clip.relevance_score || 7
        ]);

        savedClipIds.push(result.rows[0].id);
      }

      logger.info(`Saved ${savedClipIds.length} clip suggestions for video ${videoRecordId}`);

      return savedClipIds;

    } catch (error) {
      logger.error(`Error saving clip suggestions for video ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Get clips for a video
   * @param {string} videoRecordId - Video record ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of clips
   */
  async getClipsByVideo(videoRecordId, options = {}) {
    try {
      const {
        status = null,
        minRelevance = 0,
        limit = 100
      } = options;

      let query = `
        SELECT * FROM video_clips
        WHERE video_id = $1
      `;

      const params = [videoRecordId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (minRelevance > 0) {
        query += ` AND ai_relevance_score >= $${paramIndex}`;
        params.push(minRelevance);
        paramIndex++;
      }

      query += ` ORDER BY ai_relevance_score DESC, created_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await database.query(query, params);

      return result.rows;

    } catch (error) {
      logger.error(`Error getting clips for video ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Download clip using yt-dlp
   * @param {number} clipId - Clip ID
   * @returns {Promise<Object>} Download result
   */
  async downloadClip(clipId) {
    try {
      const clipQuery = `SELECT vc.*, v.youtube_url, v.videoid
                         FROM video_clips vc
                         JOIN videos v ON vc.video_id = v.id
                         WHERE vc.id = $1`;

      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        throw new Error(`Clip not found: ${clipId}`);
      }

      const clip = clipResult.rows[0];

      // Update status to processing
      await database.query(
        'UPDATE video_clips SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['processing', clipId]
      );

      // Create filename
      const safeTitle = clip.clip_title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const filename = `${clip.videoid}_${Math.floor(clip.start_time_seconds)}_${safeTitle}.mp4`;
      const outputPath = path.join(this.clipsStoragePath, filename);

      // Calculate duration
      const duration = clip.end_time_seconds - clip.start_time_seconds;

      // Download clip using yt-dlp
      logger.info(`Downloading clip ${clipId} from ${clip.start_time_seconds}s to ${clip.end_time_seconds}s...`);

      const ytDlpCommand = `yt-dlp "${clip.youtube_url}" -f "best[height<=1080]" --download-sections "*${clip.start_time_seconds}-${clip.end_time_seconds}" -o "${outputPath}" --force-keyframes-at-cuts`;

      const { stdout, stderr } = await execPromise(ytDlpCommand, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      logger.debug('yt-dlp stdout:', stdout);
      if (stderr) {
        logger.warn('yt-dlp stderr:', stderr);
      }

      // Check if file was created
      const stats = await fs.stat(outputPath);

      // Update clip record
      await database.query(`
        UPDATE video_clips SET
          file_path = $1,
          file_size_bytes = $2,
          status = 'completed',
          processed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [outputPath, stats.size, clipId]);

      logger.info(`Clip ${clipId} downloaded successfully: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      return {
        success: true,
        clipId,
        filePath: outputPath,
        fileSize: stats.size
      };

    } catch (error) {
      logger.error(`Error downloading clip ${clipId}:`, error);

      // Update status to failed
      await database.query(`
        UPDATE video_clips SET
          status = 'failed',
          processing_error = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [error.message, clipId]);

      throw error;
    }
  }

  /**
   * Convert clip to vertical (9:16) format using ffmpeg
   * @param {number} clipId - Clip ID
   * @returns {Promise<Object>} Conversion result
   */
  async convertToVerticalFormat(clipId) {
    try {
      const clipQuery = `SELECT * FROM video_clips WHERE id = $1`;
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        throw new Error(`Clip not found: ${clipId}`);
      }

      const clip = clipResult.rows[0];

      if (!clip.file_path) {
        throw new Error(`Clip ${clipId} has no downloaded file. Download it first.`);
      }

      // Check if file exists
      await fs.access(clip.file_path);

      // Create output path for vertical version
      const inputPath = clip.file_path;
      const outputPath = inputPath.replace('.mp4', '_vertical.mp4');

      logger.info(`Converting clip ${clipId} to vertical format...`);

      // FFmpeg command to convert to 9:16 vertical format
      // This crops and scales the video to 1080x1920 (9:16 aspect ratio)
      const ffmpegCommand = `ffmpeg -i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -c:a copy "${outputPath}" -y`;

      const { stdout, stderr } = await execPromise(ffmpegCommand, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      logger.debug('ffmpeg stdout:', stdout);
      if (stderr) {
        logger.debug('ffmpeg stderr:', stderr);
      }

      // Check if output file was created
      const stats = await fs.stat(outputPath);

      // Update clip record
      await database.query(`
        UPDATE video_clips SET
          file_path = $1,
          file_size_bytes = $2,
          vertical_format = true,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [outputPath, stats.size, clipId]);

      logger.info(`Clip ${clipId} converted to vertical format: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      return {
        success: true,
        clipId,
        filePath: outputPath,
        fileSize: stats.size
      };

    } catch (error) {
      logger.error(`Error converting clip ${clipId} to vertical format:`, error);

      // Update error in database
      await database.query(`
        UPDATE video_clips SET
          processing_error = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [error.message, clipId]);

      throw error;
    }
  }

  /**
   * Process all clips for a video: generate, download, and convert
   * @param {string} videoRecordId - Video record ID
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Processing results
   */
  async processVideoClips(videoRecordId, options = {}) {
    try {
      const {
        provider = 'gemini',
        maxClips = 10,
        downloadClips = true,  // Default: automatically download clips
        convertToVertical = true  // Default: automatically convert to vertical format
      } = options;

      logger.info(`Starting clip processing for video ${videoRecordId}`);

      // Get video and transcript
      const video = await videoModel.findById(videoRecordId);
      if (!video) {
        throw new Error(`Video not found: ${videoRecordId}`);
      }

      if (!video.transcript_text || video.transcript_text.trim().length === 0) {
        throw new Error(`Video ${videoRecordId} has no transcript. Generate transcript first.`);
      }

      // Step 1: Generate clip suggestions
      logger.info('Step 1: Generating clip suggestions...');
      const clipSuggestions = await this.generateClipSuggestions(
        videoRecordId,
        video.transcript_text,
        { provider, maxClips }
      );

      if (clipSuggestions.length === 0) {
        return {
          success: false,
          message: 'No valid clip suggestions generated',
          clips: []
        };
      }

      // Step 2: Save clip suggestions
      logger.info('Step 2: Saving clip suggestions...');
      const clipIds = await this.saveClipSuggestions(videoRecordId, clipSuggestions, provider);

      const results = {
        success: true,
        videoId: videoRecordId,
        provider,
        generatedClips: clipSuggestions.length,
        savedClips: clipIds.length,
        clips: [],
        downloads: {
          attempted: 0,
          successful: 0,
          failed: 0
        },
        conversions: {
          attempted: 0,
          successful: 0,
          failed: 0
        }
      };

      // Step 3: Download clips (if enabled)
      if (downloadClips) {
        logger.info('Step 3: Downloading clips...');

        for (const clipId of clipIds) {
          results.downloads.attempted++;

          try {
            const downloadResult = await this.downloadClip(clipId);
            results.downloads.successful++;

            // Step 4: Convert to vertical (if enabled)
            if (convertToVertical) {
              results.conversions.attempted++;

              try {
                const conversionResult = await this.convertToVerticalFormat(clipId);
                results.conversions.successful++;

                results.clips.push({
                  clipId,
                  downloaded: true,
                  converted: true,
                  filePath: conversionResult.filePath
                });
              } catch (conversionError) {
                results.conversions.failed++;
                logger.warn(`Failed to convert clip ${clipId}:`, conversionError.message);

                results.clips.push({
                  clipId,
                  downloaded: true,
                  converted: false,
                  error: conversionError.message
                });
              }
            } else {
              results.clips.push({
                clipId,
                downloaded: true,
                converted: false,
                filePath: downloadResult.filePath
              });
            }

          } catch (downloadError) {
            results.downloads.failed++;
            logger.warn(`Failed to download clip ${clipId}:`, downloadError.message);

            results.clips.push({
              clipId,
              downloaded: false,
              error: downloadError.message
            });
          }
        }
      } else {
        // Just return the clip IDs
        results.clips = clipIds.map(clipId => ({ clipId, downloaded: false, converted: false }));
      }

      logger.info(`Clip processing completed for video ${videoRecordId}:`, {
        generated: results.generatedClips,
        downloaded: results.downloads.successful,
        converted: results.conversions.successful
      });

      return results;

    } catch (error) {
      logger.error(`Error processing clips for video ${videoRecordId}:`, error);
      throw error;
    }
  }

  /**
   * Delete clip and associated files
   * @param {number} clipId - Clip ID
   * @returns {Promise<Object>} Deletion result
   */
  async deleteClip(clipId) {
    try {
      const clipQuery = `SELECT * FROM video_clips WHERE id = $1`;
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        throw new Error(`Clip not found: ${clipId}`);
      }

      const clip = clipResult.rows[0];

      // Delete file if exists
      if (clip.file_path) {
        try {
          await fs.unlink(clip.file_path);
          logger.info(`Deleted clip file: ${clip.file_path}`);
        } catch (fileError) {
          logger.warn(`Could not delete clip file ${clip.file_path}:`, fileError.message);
        }
      }

      // Delete database record
      await database.query('DELETE FROM video_clips WHERE id = $1', [clipId]);

      logger.info(`Deleted clip ${clipId}`);

      return {
        success: true,
        clipId
      };

    } catch (error) {
      logger.error(`Error deleting clip ${clipId}:`, error);
      throw error;
    }
  }
}

module.exports = new ClipsService();
