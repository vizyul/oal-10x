/**
 * Cloudinary Service
 * Handles all image upload, retrieval, and deletion operations for thumbnails
 */

const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const FOLDERS = {
    THUMBNAILS: 'thumbnails',
    REFERENCE_IMAGES: 'reference_images'
};

const MAX_THUMBNAILS_PER_VIDEO = 4;

class CloudinaryService {
    constructor() {
        this.isConfigured = !!(
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        );

        if (this.isConfigured) {
            logger.info('Cloudinary service initialized successfully');
        } else {
            logger.warn('Cloudinary not fully configured. Image features will be disabled.');
        }
    }

    /**
     * Check if Cloudinary is configured
     */
    checkConfiguration() {
        if (!this.isConfigured) {
            throw new Error('Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
        }
    }

    /**
     * Upload a base64 image to Cloudinary
     * @param {string} base64Data - Base64 encoded image (with or without data URI prefix)
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Cloudinary upload result
     */
    async uploadImage(base64Data, options = {}) {
        this.checkConfiguration();

        const {
            folder = FOLDERS.THUMBNAILS,
            userId,
            videoId,
            publicId,
            tags = [],
            transformation = []
        } = options;

        try {
            // Ensure base64 has proper data URI prefix
            const dataUri = base64Data.startsWith('data:')
                ? base64Data
                : `data:image/png;base64,${base64Data}`;

            // Build folder path: thumbnails/user_{id}/video_{id}/
            const folderPath = videoId
                ? `${folder}/user_${userId}/video_${videoId}`
                : `${folder}/user_${userId}`;

            const uploadOptions = {
                folder: folderPath,
                resource_type: 'image',
                tags: ['viraltube', `user_${userId}`, ...tags],
                transformation
            };

            // Add upload preset if configured
            if (process.env.CLOUDINARY_UPLOAD_PRESET) {
                uploadOptions.upload_preset = process.env.CLOUDINARY_UPLOAD_PRESET;
            }

            if (publicId) {
                uploadOptions.public_id = publicId;
                uploadOptions.overwrite = true;
            }

            const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

            logger.info(`Image uploaded to Cloudinary: ${result.public_id}`);

            return {
                publicId: result.public_id,
                url: result.url,
                secureUrl: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes,
                createdAt: result.created_at
            };
        } catch (error) {
            logger.error('Cloudinary upload failed:', error);
            throw new Error(`Failed to upload image: ${error.message}`);
        }
    }

    /**
     * Upload a thumbnail and enforce 4-thumbnail limit
     * @param {string} base64Data - Base64 encoded thumbnail
     * @param {Object} options - Upload options with userId, videoId
     * @param {Object} db - Database service for cleanup
     * @returns {Promise<Object>} Upload result
     */
    async uploadThumbnail(base64Data, options, db) {
        this.checkConfiguration();

        const { userId, videoId } = options;

        // Check current thumbnail count for this video
        const existingThumbnails = await db.query(
            `SELECT id, cloudinary_public_id, created_at
             FROM video_thumbnails
             WHERE video_id = $1
             ORDER BY created_at ASC`,
            [videoId]
        );

        // If we have 4 or more, delete the oldest one(s) to make room
        if (existingThumbnails.rows.length >= MAX_THUMBNAILS_PER_VIDEO) {
            const toDelete = existingThumbnails.rows.slice(
                0,
                existingThumbnails.rows.length - MAX_THUMBNAILS_PER_VIDEO + 1
            );

            for (const thumb of toDelete) {
                try {
                    await this.deleteImage(thumb.cloudinary_public_id);
                    await db.query('DELETE FROM video_thumbnails WHERE id = $1', [thumb.id]);
                    logger.info(`Deleted oldest thumbnail ${thumb.id} to maintain limit of ${MAX_THUMBNAILS_PER_VIDEO}`);
                } catch (deleteError) {
                    logger.error(`Failed to delete old thumbnail ${thumb.id}:`, deleteError);
                    // Continue with upload even if cleanup fails
                }
            }
        }

        // Upload the new thumbnail
        return this.uploadImage(base64Data, {
            ...options,
            folder: FOLDERS.THUMBNAILS,
            tags: ['thumbnail', `video_${videoId}`]
        });
    }

    /**
     * Upload a reference image for the user
     * @param {string} base64Data - Base64 encoded image
     * @param {Object} options - Upload options
     * @returns {Promise<Object>} Upload result
     */
    async uploadReferenceImage(base64Data, options) {
        this.checkConfiguration();

        return this.uploadImage(base64Data, {
            ...options,
            folder: FOLDERS.REFERENCE_IMAGES,
            tags: ['reference']
        });
    }

    /**
     * Delete an image from Cloudinary
     * @param {string} publicId - The public ID of the image to delete
     * @returns {Promise<Object>} Deletion result
     */
    async deleteImage(publicId) {
        this.checkConfiguration();

        try {
            const result = await cloudinary.uploader.destroy(publicId);
            logger.info(`Image deleted from Cloudinary: ${publicId}, result: ${result.result}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete image ${publicId}:`, error);
            throw error;
        }
    }

    /**
     * Delete all thumbnails for a video
     * @param {number} userId - User ID
     * @param {number} videoId - Video ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteVideoThumbnails(userId, videoId) {
        this.checkConfiguration();

        try {
            const prefix = `${FOLDERS.THUMBNAILS}/user_${userId}/video_${videoId}`;
            const result = await cloudinary.api.delete_resources_by_prefix(prefix);
            logger.info(`Deleted all thumbnails for video ${videoId}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete thumbnails for video ${videoId}:`, error);
            throw error;
        }
    }

    /**
     * Delete all reference images for a user
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteUserReferenceImages(userId) {
        this.checkConfiguration();

        try {
            const prefix = `${FOLDERS.REFERENCE_IMAGES}/user_${userId}`;
            const result = await cloudinary.api.delete_resources_by_prefix(prefix);
            logger.info(`Deleted all reference images for user ${userId}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete reference images for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Get optimized URL with transformations
     * @param {string} publicId - The public ID of the image
     * @param {Object} options - Transformation options
     * @returns {string} Optimized URL
     */
    getOptimizedUrl(publicId, options = {}) {
        this.checkConfiguration();

        const {
            width,
            height,
            crop = 'fill',
            quality = 'auto',
            format = 'auto'
        } = options;

        const transformation = [
            { quality, fetch_format: format }
        ];

        if (width || height) {
            transformation.unshift({ width, height, crop });
        }

        return cloudinary.url(publicId, {
            transformation,
            secure: true
        });
    }

    /**
     * Get thumbnail URL optimized for YouTube (1280x720)
     * @param {string} publicId - The public ID of the thumbnail
     * @returns {string} YouTube-optimized URL
     */
    getYouTubeThumbnailUrl(publicId) {
        return this.getOptimizedUrl(publicId, {
            width: 1280,
            height: 720,
            crop: 'fill',
            quality: 'auto:best'
        });
    }

    /**
     * Get thumbnail URL for preview (smaller size)
     * @param {string} publicId - The public ID of the thumbnail
     * @returns {string} Preview URL
     */
    getPreviewUrl(publicId) {
        return this.getOptimizedUrl(publicId, {
            width: 480,
            height: 270,
            crop: 'fill',
            quality: 'auto:good'
        });
    }

    /**
     * Get image info from Cloudinary
     * @param {string} publicId - The public ID of the image
     * @returns {Promise<Object>} Image info
     */
    async getImageInfo(publicId) {
        this.checkConfiguration();

        try {
            const result = await cloudinary.api.resource(publicId);
            return {
                publicId: result.public_id,
                url: result.url,
                secureUrl: result.secure_url,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes,
                createdAt: result.created_at
            };
        } catch (error) {
            logger.error(`Failed to get image info for ${publicId}:`, error);
            throw error;
        }
    }

    /**
     * List all images in a folder
     * @param {string} folder - Folder path
     * @param {Object} options - List options
     * @returns {Promise<Array>} List of images
     */
    async listImages(folder, options = {}) {
        this.checkConfiguration();

        const { maxResults = 100 } = options;

        try {
            const result = await cloudinary.api.resources({
                type: 'upload',
                prefix: folder,
                max_results: maxResults
            });

            return result.resources.map(resource => ({
                publicId: resource.public_id,
                url: resource.url,
                secureUrl: resource.secure_url,
                width: resource.width,
                height: resource.height,
                format: resource.format,
                bytes: resource.bytes,
                createdAt: resource.created_at
            }));
        } catch (error) {
            logger.error(`Failed to list images in folder ${folder}:`, error);
            throw error;
        }
    }

    /**
     * Get usage statistics
     * @returns {Promise<Object>} Usage stats
     */
    async getUsageStats() {
        this.checkConfiguration();

        try {
            const result = await cloudinary.api.usage();
            return {
                storage: {
                    used: result.storage.usage,
                    limit: result.storage.limit,
                    usedPercent: (result.storage.usage / result.storage.limit) * 100
                },
                bandwidth: {
                    used: result.bandwidth.usage,
                    limit: result.bandwidth.limit,
                    usedPercent: (result.bandwidth.usage / result.bandwidth.limit) * 100
                },
                transformations: {
                    used: result.transformations.usage,
                    limit: result.transformations.limit,
                    usedPercent: (result.transformations.usage / result.transformations.limit) * 100
                }
            };
        } catch (error) {
            logger.error('Failed to get Cloudinary usage stats:', error);
            throw error;
        }
    }
}

module.exports = new CloudinaryService();
