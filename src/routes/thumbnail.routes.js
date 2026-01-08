/**
 * Thumbnail API Routes
 * Handles all thumbnail generation endpoints
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();
const thumbnailController = require('../controllers/thumbnail.controller');
const { authMiddleware } = require('../middleware');

// Configure multer for file uploads (memory storage for base64 conversion)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Accept only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// All routes require authentication
router.use(authMiddleware);

// Get options (styles, expressions, categories)
router.get('/options', thumbnailController.getOptions.bind(thumbnailController));

// Reference images
router.get('/reference-images', thumbnailController.getReferenceImages.bind(thumbnailController));
router.post('/reference-images', upload.single('image'), thumbnailController.uploadReferenceImage.bind(thumbnailController));
router.delete('/reference-images/:id', thumbnailController.deleteReferenceImage.bind(thumbnailController));
router.post('/reference-images/:id/default', thumbnailController.setDefaultReferenceImage.bind(thumbnailController));

// Character profiles (for consistent AI generation)
router.get('/character-profiles', thumbnailController.getCharacterProfiles.bind(thumbnailController));
router.get('/character-profiles/options', thumbnailController.getCharacterProfileOptions.bind(thumbnailController));
router.get('/character-profiles/:id', thumbnailController.getCharacterProfile.bind(thumbnailController));
router.post('/character-profiles', thumbnailController.createCharacterProfile.bind(thumbnailController));
router.put('/character-profiles/:id', thumbnailController.updateCharacterProfile.bind(thumbnailController));
router.delete('/character-profiles/:id', thumbnailController.deleteCharacterProfile.bind(thumbnailController));
router.post('/character-profiles/:id/default', thumbnailController.setDefaultCharacterProfile.bind(thumbnailController));

// Job status (for async generation tracking)
router.get('/jobs/:jobId', thumbnailController.getJobStatus.bind(thumbnailController));

// Video thumbnails
router.get('/videos/:videoId', thumbnailController.getVideoThumbnails.bind(thumbnailController));
router.post('/videos/:videoId/generate', thumbnailController.generateThumbnails.bind(thumbnailController));
router.post('/videos/:videoId/regenerate', thumbnailController.regenerateThumbnails.bind(thumbnailController));

// Individual thumbnail operations
router.post('/:thumbnailId/refine', thumbnailController.refineThumbnail.bind(thumbnailController));
router.post('/:thumbnailId/select', thumbnailController.selectThumbnail.bind(thumbnailController));
router.post('/:thumbnailId/download', thumbnailController.downloadThumbnail.bind(thumbnailController));
router.delete('/:thumbnailId', thumbnailController.deleteThumbnail.bind(thumbnailController));

module.exports = router;
