const clipsService = require('../services/clips.service');
const { video: videoModel } = require('../models');
const { logger } = require('../utils');

class ClipsController {
  /**
   * Generate clip suggestions for a video
   * POST /api/videos/:videoId/clips/generate
   */
  async generateClips(req, res, next) {
    try {
      const { videoId } = req.params;
      const {
        provider = 'gemini',
        maxClips = 10,
        downloadClips = true,  // Default: automatically download clips
        convertToVertical = true  // Default: automatically convert to vertical
      } = req.body;

      const userId = req.user?.id;

      logger.info(`Generating clips for video ${videoId} (user: ${userId})`);

      // Verify video ownership
      const video = await videoModel.getVideoByIdAndUser(videoId, userId);
      if (!video) {
        return res.status(404).json({
          success: false,
          error: 'Video not found or access denied'
        });
      }

      // Check if video has transcript
      if (!video.transcript_text || video.transcript_text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Video has no transcript. Please generate a transcript first.'
        });
      }

      // Process clips
      const result = await clipsService.processVideoClips(videoId, {
        provider,
        maxClips,
        downloadClips,
        convertToVertical
      });

      res.json({
        success: true,
        message: `Generated ${result.generatedClips} clip suggestions`,
        ...result
      });

    } catch (error) {
      logger.error('Error in generateClips:', error);
      next(error);
    }
  }

  /**
   * Get all clips for a video
   * GET /api/videos/:videoId/clips
   */
  async getClips(req, res, next) {
    try {
      const { videoId } = req.params;
      const {
        status,
        minRelevance = 0,
        limit = 100
      } = req.query;

      const userId = req.user?.id;

      // Verify video ownership
      const video = await videoModel.getVideoByIdAndUser(videoId, userId);
      if (!video) {
        return res.status(404).json({
          success: false,
          error: 'Video not found or access denied'
        });
      }

      const clips = await clipsService.getClipsByVideo(videoId, {
        status,
        minRelevance: parseFloat(minRelevance),
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        videoId,
        count: clips.length,
        clips
      });

    } catch (error) {
      logger.error('Error in getClips:', error);
      next(error);
    }
  }

  /**
   * Download a specific clip
   * POST /api/clips/:clipId/download
   */
  async downloadClip(req, res, next) {
    try {
      const { clipId } = req.params;
      const userId = req.user?.id;

      logger.info(`Downloading clip ${clipId} (user: ${userId})`);

      // Verify clip ownership via video
      const clipQuery = `
        SELECT vc.*, v.users_id
        FROM video_clips vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1
      `;

      const database = require('../services/database.service');
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Clip not found'
        });
      }

      const clip = clipResult.rows[0];

      if (clip.users_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Download clip
      const result = await clipsService.downloadClip(clipId);

      res.json({
        success: true,
        message: 'Clip downloaded successfully',
        ...result
      });

    } catch (error) {
      logger.error('Error in downloadClip:', error);
      next(error);
    }
  }

  /**
   * Convert clip to vertical format
   * POST /api/clips/:clipId/convert-vertical
   */
  async convertToVertical(req, res, next) {
    try {
      const { clipId } = req.params;
      const userId = req.user?.id;

      logger.info(`Converting clip ${clipId} to vertical format (user: ${userId})`);

      // Verify clip ownership
      const clipQuery = `
        SELECT vc.*, v.users_id
        FROM video_clips vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1
      `;

      const database = require('../services/database.service');
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Clip not found'
        });
      }

      const clip = clipResult.rows[0];

      if (clip.users_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      if (!clip.file_path) {
        return res.status(400).json({
          success: false,
          error: 'Clip has no downloaded file. Download it first.'
        });
      }

      // Convert clip
      const result = await clipsService.convertToVerticalFormat(clipId);

      res.json({
        success: true,
        message: 'Clip converted to vertical format successfully',
        ...result
      });

    } catch (error) {
      logger.error('Error in convertToVertical:', error);
      next(error);
    }
  }

  /**
   * Delete a clip
   * DELETE /api/clips/:clipId
   */
  async deleteClip(req, res, next) {
    try {
      const { clipId } = req.params;
      const userId = req.user?.id;

      logger.info(`Deleting clip ${clipId} (user: ${userId})`);

      // Verify clip ownership
      const clipQuery = `
        SELECT vc.*, v.users_id
        FROM video_clips vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1
      `;

      const database = require('../services/database.service');
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Clip not found'
        });
      }

      const clip = clipResult.rows[0];

      if (clip.users_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Delete clip
      const result = await clipsService.deleteClip(clipId);

      res.json({
        success: true,
        message: 'Clip deleted successfully',
        ...result
      });

    } catch (error) {
      logger.error('Error in deleteClip:', error);
      next(error);
    }
  }

  /**
   * Get clip details
   * GET /api/clips/:clipId
   */
  async getClipDetails(req, res, next) {
    try {
      const { clipId } = req.params;
      const userId = req.user?.id;

      // Get clip with video info
      const clipQuery = `
        SELECT vc.*, v.users_id, v.video_title, v.youtube_url, v.videoid
        FROM video_clips vc
        JOIN videos v ON vc.video_id = v.id
        WHERE vc.id = $1
      `;

      const database = require('../services/database.service');
      const clipResult = await database.query(clipQuery, [clipId]);

      if (clipResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Clip not found'
        });
      }

      const clip = clipResult.rows[0];

      if (clip.users_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      res.json({
        success: true,
        clip
      });

    } catch (error) {
      logger.error('Error in getClipDetails:', error);
      next(error);
    }
  }
}

module.exports = new ClipsController();
