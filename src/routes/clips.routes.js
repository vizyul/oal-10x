const express = require('express');
const router = express.Router();
const clipsController = require('../controllers/clips.controller');
const { authMiddleware } = require('../middleware');

// All clips routes require authentication
router.use(authMiddleware);

// Video clips routes
router.post('/videos/:videoId/clips/generate', clipsController.generateClips);
router.get('/videos/:videoId/clips', clipsController.getClips);

// Individual clip routes
router.get('/clips/:clipId', clipsController.getClipDetails);
router.post('/clips/:clipId/download', clipsController.downloadClip);
router.post('/clips/:clipId/convert-vertical', clipsController.convertToVertical);
router.delete('/clips/:clipId', clipsController.deleteClip);

module.exports = router;
