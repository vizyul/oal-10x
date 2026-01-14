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

// Root folder for all app assets
const ROOT_FOLDER = 'thumbnails';

// Subfolder names within user folders
const SUBFOLDERS = {
    REFERENCE_IMAGES: 'reference_images'
};

const MAX_THUMBNAILS_PER_ASPECT_RATIO = 4;  // 4 per aspect ratio (8 total: 4 for 16:9 + 4 for 9:16)

class CloudinaryService {
    constructor() {
        this.isConfigured = !!(
            process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
        );

        // Cache of created folders to avoid redundant API calls
        this.createdFolders = new Set();

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
     * Ensure a folder exists in Cloudinary (creates parent folders if needed)
     * @param {string} folderPath - Full folder path (e.g., 'user_145/video_303')
     */
    async ensureFolderExists(folderPath) {
        if (!folderPath || this.createdFolders.has(folderPath)) {
            return; // Already created or no folder needed
        }

        // Create parent folders first (e.g., 'user_145' before 'user_145/video_303')
        const parts = folderPath.split('/');
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;

            if (this.createdFolders.has(currentPath)) {
                continue; // Already created
            }

            try {
                await cloudinary.api.create_folder(currentPath);
                this.createdFolders.add(currentPath);
                logger.info(`Created Cloudinary folder: ${currentPath}`);
            } catch (error) {
                // Folder might already exist - that's fine
                if (error.error && error.error.message && error.error.message.includes('already exists')) {
                    this.createdFolders.add(currentPath);
                } else if (error.message && error.message.includes('already exists')) {
                    this.createdFolders.add(currentPath);
                } else {
                    logger.warn(`Could not create Cloudinary folder ${currentPath}:`, error.message || error);
                    // Don't throw - upload can still work with virtual folder path
                }
            }
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
            folderPath,
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

            // Use provided folderPath or build default path
            // All assets go under ROOT_FOLDER (thumbnails/)
            // Structure: thumbnails/user_{userId}/video_{videoId}/ for thumbnails
            // Structure: thumbnails/user_{userId}/reference_images/ for reference images
            const finalFolderPath = folderPath || (videoId
                ? `${ROOT_FOLDER}/user_${userId}/video_${videoId}`
                : `${ROOT_FOLDER}/user_${userId}`);

            // Create actual folder in Cloudinary (not just virtual path)
            await this.ensureFolderExists(finalFolderPath);

            // Build the full public_id with folder path included
            // This ensures the URL structure matches the folder structure
            const fullPublicId = publicId
                ? `${finalFolderPath}/${publicId}`
                : null;  // Let Cloudinary auto-generate if no publicId provided

            // Use multiple folder parameters for compatibility with both folder modes:
            // - folder: Works in Fixed folder mode (legacy) - sets both storage and public_id prefix
            // - asset_folder: Works in Dynamic folder mode (since June 2024) - sets Media Library placement
            // - public_id with full path: Ensures URL structure in both modes
            const uploadOptions = {
                folder: finalFolderPath,        // For Fixed folder mode compatibility
                asset_folder: finalFolderPath,  // For Dynamic folder mode - Media Library placement
                resource_type: 'image',
                tags: ['viraltube', `user_${userId}`, ...tags],
                transformation
            };

            // NOTE: Upload presets can override folder settings, so we skip it when explicitly
            // specifying folders to ensure our folder structure is respected
            // If you need to use a preset, configure it to NOT set a folder

            if (fullPublicId) {
                // When we have a specific publicId, include full path and skip folder param
                // to avoid double-prefixing (folder + publicId would create folder/folder/publicId)
                delete uploadOptions.folder;
                uploadOptions.public_id = fullPublicId;
                uploadOptions.overwrite = true;
            }

            logger.info(`Cloudinary upload options: folder=${uploadOptions.folder || 'N/A'}, asset_folder=${finalFolderPath}, public_id=${fullPublicId || 'auto-generated'}`);

            const result = await cloudinary.uploader.upload(dataUri, uploadOptions);

            logger.info(`Cloudinary upload result: public_id=${result.public_id}, asset_folder=${result.asset_folder || 'N/A'}`);

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
     * Upload a thumbnail and enforce 4-thumbnail limit PER ASPECT RATIO
     * Each video can have up to 8 thumbnails total: 4 for 16:9 + 4 for 9:16
     * @param {string} base64Data - Base64 encoded thumbnail
     * @param {Object} options - Upload options with userId, videoId, aspectRatio
     * @param {Object} db - Database service for cleanup
     * @returns {Promise<Object>} Upload result
     */
    async uploadThumbnail(base64Data, options, db) {
        this.checkConfiguration();

        // eslint-disable-next-line no-unused-vars
        const { userId: _userId, videoId, aspectRatio = '16:9' } = options;

        // Check current thumbnail count for this video AND aspect ratio
        // Each aspect ratio (16:9 and 9:16) has its own limit of 4 thumbnails
        const existingThumbnails = await db.query(
            `SELECT id, cloudinary_public_id, created_at
             FROM video_thumbnails
             WHERE video_id = $1 AND aspect_ratio = $2
             ORDER BY created_at ASC`,
            [videoId, aspectRatio]
        );

        // If we have 4 or more for this aspect ratio, delete the oldest one(s) to make room
        if (existingThumbnails.rows.length >= MAX_THUMBNAILS_PER_ASPECT_RATIO) {
            const toDelete = existingThumbnails.rows.slice(
                0,
                existingThumbnails.rows.length - MAX_THUMBNAILS_PER_ASPECT_RATIO + 1
            );

            for (const thumb of toDelete) {
                try {
                    await this.deleteImage(thumb.cloudinary_public_id);
                    await db.query('DELETE FROM video_thumbnails WHERE id = $1', [thumb.id]);
                    logger.info(`Deleted oldest ${aspectRatio} thumbnail ${thumb.id} to maintain limit of ${MAX_THUMBNAILS_PER_ASPECT_RATIO} per aspect ratio`);
                } catch (deleteError) {
                    logger.error(`Failed to delete old thumbnail ${thumb.id}:`, deleteError);
                    // Continue with upload even if cleanup fails
                }
            }
        }

        // Upload the new thumbnail
        return this.uploadImage(base64Data, {
            ...options,
            tags: ['thumbnail', `video_${videoId}`, `ratio_${aspectRatio.replace(':', 'x')}`]
        });
    }

    /**
     * Upload a reference image for the user
     * @param {string} base64Data - Base64 encoded image
     * @param {Object} options - Upload options (userId, publicId)
     * @returns {Promise<Object>} Upload result
     */
    async uploadReferenceImage(base64Data, options) {
        this.checkConfiguration();

        const { userId, publicId } = options;

        // Folder structure: thumbnails/user_{userId}/reference_images/
        return this.uploadImage(base64Data, {
            userId,
            publicId,
            folderPath: `${ROOT_FOLDER}/user_${userId}/${SUBFOLDERS.REFERENCE_IMAGES}`,
            tags: ['reference', `user_${userId}`]
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
            // Folder structure: thumbnails/user_{userId}/video_{videoId}/
            const prefix = `${ROOT_FOLDER}/user_${userId}/video_${videoId}`;
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
            // Folder structure: thumbnails/user_{userId}/reference_images/
            const prefix = `${ROOT_FOLDER}/user_${userId}/${SUBFOLDERS.REFERENCE_IMAGES}`;
            const result = await cloudinary.api.delete_resources_by_prefix(prefix);
            logger.info(`Deleted all reference images for user ${userId}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete reference images for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Delete all assets for a user (reference images + all video thumbnails)
     * @param {number} userId - User ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteAllUserAssets(userId) {
        this.checkConfiguration();

        try {
            // Delete entire user folder: thumbnails/user_{userId}/
            const prefix = `${ROOT_FOLDER}/user_${userId}`;
            const result = await cloudinary.api.delete_resources_by_prefix(prefix);
            logger.info(`Deleted all assets for user ${userId}`);
            return result;
        } catch (error) {
            logger.error(`Failed to delete all assets for user ${userId}:`, error);
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
