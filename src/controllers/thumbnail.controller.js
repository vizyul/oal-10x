/**
 * Thumbnail Controller
 * Handles all thumbnail generation API requests
 */

const thumbnailService = require('../services/thumbnail-generator.service');
const cloudinaryService = require('../services/cloudinary.service');
const database = require('../services/database.service');
const { logger } = require('../utils');

class ThumbnailController {
    /**
     * GET /api/thumbnails/options
     * Get available styles, expressions, and categories
     */
    async getOptions(req, res) {
        try {
            const options = await thumbnailService.getOptions();
            res.json({ success: true, data: options });
        } catch (error) {
            logger.error('Failed to get thumbnail options:', error);
            res.status(500).json({ success: false, error: 'Failed to load options' });
        }
    }

    /**
     * GET /api/thumbnails/usage
     * Get thumbnail usage summary (limits and current usage for both aspect ratios)
     */
    async getUsageSummary(req, res) {
        try {
            const summary = await thumbnailService.getThumbnailUsageSummary(req.user.id);
            if (!summary) {
                return res.status(404).json({ success: false, error: 'Usage data not found' });
            }
            res.json({ success: true, data: summary });
        } catch (error) {
            logger.error('Failed to get thumbnail usage summary:', error);
            res.status(500).json({ success: false, error: 'Failed to load usage summary' });
        }
    }

    /**
     * GET /api/thumbnails/reference-images
     * Get user's reference images
     */
    async getReferenceImages(req, res) {
        try {
            const images = await thumbnailService.getReferenceImages(req.user.id);
            res.json({ success: true, data: images });
        } catch (error) {
            logger.error('Failed to get reference images:', error);
            res.status(500).json({ success: false, error: 'Failed to load reference images' });
        }
    }

    /**
     * POST /api/thumbnails/reference-images
     * Upload a new reference image
     */
    async uploadReferenceImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No image provided' });
            }

            const base64 = req.file.buffer.toString('base64');
            const dataUri = `data:${req.file.mimetype};base64,${base64}`;

            const result = await thumbnailService.uploadReferenceImage(req.user.id, dataUri, {
                displayName: req.body.displayName || req.file.originalname,
                mimeType: req.file.mimetype
            });

            res.json({ success: true, data: result });
        } catch (error) {
            logger.error('Failed to upload reference image:', error);
            res.status(500).json({ success: false, error: 'Failed to upload image' });
        }
    }

    /**
     * DELETE /api/thumbnails/reference-images/:id
     * Delete a reference image
     */
    async deleteReferenceImage(req, res) {
        try {
            await thumbnailService.deleteReferenceImage(req.params.id, req.user.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete reference image:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/thumbnails/reference-images/:id/default
     * Set a reference image as default
     */
    async setDefaultReferenceImage(req, res) {
        try {
            await thumbnailService.setDefaultReferenceImage(req.params.id, req.user.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to set default reference image:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /api/thumbnails/videos/:videoId
     * Get all thumbnails for a video
     */
    async getVideoThumbnails(req, res) {
        try {
            const thumbnails = await thumbnailService.getVideoThumbnails(
                req.params.videoId,
                req.user.id
            );
            res.json({ success: true, data: thumbnails });
        } catch (error) {
            logger.error('Failed to get video thumbnails:', error);
            res.status(500).json({ success: false, error: 'Failed to load thumbnails' });
        }
    }

    /**
     * POST /api/thumbnails/videos/:videoId/generate
     * Generate 4 thumbnail variations
     */
    async generateThumbnails(req, res) {
        try {
            const {
                topic,
                subTopic,
                expressionKey,
                aspectRatio,
                categoryKey,
                referenceImageIds,
                characterAnchor,
                creativeTitles
            } = req.body;

            // Validate required fields
            if (!topic || !expressionKey || !referenceImageIds?.length) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: topic, expressionKey, referenceImageIds'
                });
            }

            // Check thumbnail generation limits based on subscription tier
            const selectedAspectRatio = aspectRatio || '16:9';
            const limitCheck = await thumbnailService.checkThumbnailLimit(req.user.id, selectedAspectRatio);

            if (!limitCheck.canGenerate) {
                logger.info(`Thumbnail generation blocked for user ${req.user.id}: ${limitCheck.reason}`);
                return res.status(403).json({
                    success: false,
                    error: limitCheck.reason,
                    requiresUpgrade: limitCheck.requiresUpgrade || false,
                    usage: limitCheck.usage,
                    limit: limitCheck.limit
                });
            }

            // Create a job for tracking
            const jobResult = await database.query(
                `INSERT INTO thumbnail_generation_jobs (
                    video_id, users_id, topic, sub_topic, expression_category,
                    aspect_ratio, content_category, reference_image_ids, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
                RETURNING id`,
                [
                    req.params.videoId, req.user.id, topic, subTopic,
                    expressionKey, aspectRatio || '16:9', categoryKey,
                    JSON.stringify(referenceImageIds)
                ]
            );

            const jobId = jobResult.rows[0].id;

            logger.info(`Starting thumbnail generation job ${jobId} for video ${req.params.videoId}`, {
                creativeTitles: creativeTitles,
                topic: topic
            });

            // Start generation asynchronously
            thumbnailService.generateThumbnails({
                userId: req.user.id,
                videoId: parseInt(req.params.videoId),
                topic,
                subTopic,
                expressionKey,
                aspectRatio: aspectRatio || '16:9',
                categoryKey,
                referenceImageIds,
                characterAnchor,
                jobId,
                creativeTitles: creativeTitles || false
            }).catch(error => {
                logger.error(`Thumbnail generation job ${jobId} failed:`, error);
                database.query(
                    `UPDATE thumbnail_generation_jobs
                     SET status = 'failed', error_message = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE id = $2`,
                    [error.message, jobId]
                );
            });

            res.json({
                success: true,
                jobId,
                message: 'Thumbnail generation started. Poll /api/thumbnails/jobs/:jobId for status.'
            });
        } catch (error) {
            logger.error('Failed to start thumbnail generation:', error);
            res.status(500).json({ success: false, error: 'Failed to start generation' });
        }
    }

    /**
     * POST /api/thumbnails/videos/:videoId/regenerate
     * Regenerate thumbnails with updated parameters
     * Only deletes existing thumbnails of the SAME aspect ratio
     * Keeps up to 8 thumbnails total (4 for 16:9 and 4 for 9:16)
     */
    async regenerateThumbnails(req, res) {
        try {
            const videoId = parseInt(req.params.videoId);
            const userId = req.user.id;
            const aspectRatio = req.body.aspectRatio || '16:9';

            // Check thumbnail generation limits BEFORE deleting existing thumbnails
            const limitCheck = await thumbnailService.checkThumbnailLimit(userId, aspectRatio);

            if (!limitCheck.canGenerate) {
                logger.info(`Thumbnail regeneration blocked for user ${userId}: ${limitCheck.reason}`);
                return res.status(403).json({
                    success: false,
                    error: limitCheck.reason,
                    requiresUpgrade: limitCheck.requiresUpgrade || false,
                    usage: limitCheck.usage,
                    limit: limitCheck.limit
                });
            }

            // Only delete existing thumbnails with the same aspect ratio
            const existingThumbnails = await database.query(
                `SELECT id, cloudinary_public_id FROM video_thumbnails
                 WHERE video_id = $1 AND users_id = $2 AND aspect_ratio = $3`,
                [videoId, userId, aspectRatio]
            );

            if (existingThumbnails.rows.length > 0) {
                logger.info(`Deleting ${existingThumbnails.rows.length} existing ${aspectRatio} thumbnails for video ${videoId}`);

                // Delete from Cloudinary
                for (const thumb of existingThumbnails.rows) {
                    try {
                        await cloudinaryService.deleteImage(thumb.cloudinary_public_id);
                    } catch (cloudErr) {
                        logger.warn(`Failed to delete thumbnail from Cloudinary: ${thumb.cloudinary_public_id}`, cloudErr.message);
                    }
                }

                // Delete from database
                await database.query(
                    `DELETE FROM video_thumbnails
                     WHERE video_id = $1 AND users_id = $2 AND aspect_ratio = $3`,
                    [videoId, userId, aspectRatio]
                );

                logger.info(`Deleted existing ${aspectRatio} thumbnails for video ${videoId}`);
            }

            // Now generate new thumbnails
            return this.generateThumbnails(req, res);
        } catch (error) {
            logger.error('Failed to regenerate thumbnails:', error);
            res.status(500).json({ success: false, error: 'Failed to regenerate thumbnails' });
        }
    }

    /**
     * POST /api/thumbnails/:thumbnailId/refine
     * Edit/refine an existing thumbnail
     */
    async refineThumbnail(req, res) {
        try {
            const { instruction } = req.body;

            if (!instruction) {
                return res.status(400).json({
                    success: false,
                    error: 'Refinement instruction is required'
                });
            }

            const refined = await thumbnailService.refineThumbnail({
                thumbnailId: req.params.thumbnailId,
                userId: req.user.id,
                instruction
            });

            res.json({ success: true, data: refined });
        } catch (error) {
            logger.error('Failed to refine thumbnail:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/thumbnails/:thumbnailId/select
     * Select a thumbnail as active for its video
     */
    async selectThumbnail(req, res) {
        try {
            const result = await thumbnailService.selectThumbnail(
                req.params.thumbnailId,
                req.user.id
            );
            res.json({ success: true, data: result });
        } catch (error) {
            logger.error('Failed to select thumbnail:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * DELETE /api/thumbnails/:thumbnailId
     * Delete a specific thumbnail
     */
    async deleteThumbnail(req, res) {
        try {
            await thumbnailService.deleteThumbnail(req.params.thumbnailId, req.user.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete thumbnail:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * GET /api/thumbnails/jobs/:jobId
     * Get job status for async generation
     */
    async getJobStatus(req, res) {
        try {
            const result = await database.query(
                `SELECT * FROM thumbnail_generation_jobs WHERE id = $1 AND users_id = $2`,
                [req.params.jobId, req.user.id]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Job not found' });
            }

            const job = result.rows[0];

            // Debug logging
            logger.info(`Job ${job.id} status: ${job.status}, progress: ${job.progress}, thumbnail_ids: ${JSON.stringify(job.generated_thumbnail_ids)}`);

            // Include generated thumbnails (even while processing for incremental display)
            let thumbnails = [];
            if (job.generated_thumbnail_ids?.length) {
                const thumbResult = await database.query(
                    `SELECT t.*, s.name as style_display_name
                     FROM video_thumbnails t
                     LEFT JOIN thumbnail_styles s ON t.style_name = s.key
                     WHERE t.id = ANY($1)
                     ORDER BY t.generation_order`,
                    [job.generated_thumbnail_ids]
                );
                thumbnails = thumbResult.rows;
            }

            res.json({
                success: true,
                data: {
                    ...job,
                    thumbnails
                }
            });
        } catch (error) {
            logger.error('Failed to get job status:', error);
            res.status(500).json({ success: false, error: 'Failed to get job status' });
        }
    }

    /**
     * POST /api/thumbnails/:thumbnailId/download
     * Get download URL for thumbnail
     */
    async downloadThumbnail(req, res) {
        try {
            const thumbResult = await database.query(
                `SELECT cloudinary_secure_url, topic, style_name
                 FROM video_thumbnails WHERE id = $1 AND users_id = $2`,
                [req.params.thumbnailId, req.user.id]
            );

            if (thumbResult.rows.length === 0) {
                return res.status(404).json({ success: false, error: 'Thumbnail not found' });
            }

            res.json({
                success: true,
                downloadUrl: thumbResult.rows[0].cloudinary_secure_url
            });
        } catch (error) {
            logger.error('Failed to get download URL:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    // ==========================================
    // Character Profile Endpoints
    // ==========================================

    /**
     * GET /api/thumbnails/character-profiles
     * Get all character profiles for the user
     */
    async getCharacterProfiles(req, res) {
        try {
            const profiles = await thumbnailService.getCharacterProfiles(req.user.id);
            res.json({ success: true, data: profiles });
        } catch (error) {
            logger.error('Failed to get character profiles:', error);
            res.status(500).json({ success: false, error: 'Failed to load character profiles' });
        }
    }

    /**
     * GET /api/thumbnails/character-profiles/options
     * Get dropdown options for character profile fields
     */
    async getCharacterProfileOptions(req, res) {
        try {
            const options = await thumbnailService.getCharacterProfileOptions();
            res.json({ success: true, data: options });
        } catch (error) {
            logger.error('Failed to get character profile options:', error);
            res.status(500).json({ success: false, error: 'Failed to load options' });
        }
    }

    /**
     * GET /api/thumbnails/character-profiles/:id
     * Get a specific character profile
     */
    async getCharacterProfile(req, res) {
        try {
            const profile = await thumbnailService.getCharacterProfile(req.params.id, req.user.id);
            if (!profile) {
                return res.status(404).json({ success: false, error: 'Character profile not found' });
            }
            res.json({ success: true, data: profile });
        } catch (error) {
            logger.error('Failed to get character profile:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/thumbnails/character-profiles
     * Create a new character profile
     */
    async createCharacterProfile(req, res) {
        try {
            const profile = await thumbnailService.createCharacterProfile(req.user.id, req.body);
            res.status(201).json({ success: true, data: profile });
        } catch (error) {
            logger.error('Failed to create character profile:', error);
            res.status(500).json({ success: false, error: 'Failed to create character profile' });
        }
    }

    /**
     * PUT /api/thumbnails/character-profiles/:id
     * Update a character profile
     */
    async updateCharacterProfile(req, res) {
        try {
            const profile = await thumbnailService.updateCharacterProfile(
                req.params.id,
                req.user.id,
                req.body
            );
            res.json({ success: true, data: profile });
        } catch (error) {
            logger.error('Failed to update character profile:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * DELETE /api/thumbnails/character-profiles/:id
     * Delete a character profile
     */
    async deleteCharacterProfile(req, res) {
        try {
            await thumbnailService.deleteCharacterProfile(req.params.id, req.user.id);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to delete character profile:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * POST /api/thumbnails/character-profiles/:id/default
     * Set a character profile as default
     */
    async setDefaultCharacterProfile(req, res) {
        try {
            const profile = await thumbnailService.setDefaultCharacterProfile(req.params.id, req.user.id);
            res.json({ success: true, data: profile });
        } catch (error) {
            logger.error('Failed to set default character profile:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}

module.exports = new ThumbnailController();
