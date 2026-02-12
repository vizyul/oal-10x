/**
 * Thumbnails Web Routes
 * Handles page routes for the Thumbnail Studio
 */

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware');
const database = require('../services/database.service');
const thumbnailService = require('../services/thumbnail-generator.service');

// Thumbnail Studio page - no video selected
router.get('/studio', authMiddleware, async (req, res) => {
    try {
        res.render('thumbnails/studio', {
            title: 'Thumbnail Studio - AmplifyContent.ai',
            description: 'Create AI-powered thumbnails for your videos',
            user: req.user,
            subscription: req.subscriptionInfo,
            videoId: null,
            videoTitle: '',
            showHeader: true,
            showFooter: true,
            showNav: true,
            additionalCSS: ['/css/thumbnail-studio-page.css'],
            additionalJS: ['/js/thumbnail-studio-page.js']
        });
    } catch (error) {
        console.error('Thumbnail studio page error:', error);
        res.status(500).render('errors/500', {
            title: 'Error',
            user: req.user,
            subscription: req.subscriptionInfo
        });
    }
});

// Thumbnail Studio page - with specific video
router.get('/studio/:videoId', authMiddleware, async (req, res) => {
    try {
        const { videoId } = req.params;

        // Get video details
        let videoTitle = '';
        let thumbnailTopic = '';
        let thumbnailSubtopic = '';
        try {
            const videoResult = await database.query(
                'SELECT video_title, thumbnail_topic, thumbnail_subtopic FROM videos WHERE id = $1 AND users_id = $2',
                [videoId, req.user.id]
            );
            if (videoResult.rows.length > 0) {
                videoTitle = videoResult.rows[0].video_title || '';
                thumbnailTopic = videoResult.rows[0].thumbnail_topic || '';
                thumbnailSubtopic = videoResult.rows[0].thumbnail_subtopic || '';
            }
        } catch (dbError) {
            console.error('Error fetching video:', dbError);
        }

        // Get thumbnail usage for this video
        let thumbnailUsage = null;
        try {
            thumbnailUsage = await thumbnailService.getThumbnailUsageSummary(req.user.id, parseInt(videoId));
        } catch (usageError) {
            console.error('Error fetching thumbnail usage:', usageError);
        }

        res.render('thumbnails/studio', {
            title: `Thumbnail Studio - ${videoTitle || 'AmplifyContent.ai'}`,
            description: 'Create AI-powered thumbnails for your videos',
            user: req.user,
            subscription: req.subscriptionInfo,
            videoId: videoId,
            videoTitle: videoTitle,
            thumbnailTopic: thumbnailTopic,
            thumbnailSubtopic: thumbnailSubtopic,
            thumbnailUsage: JSON.stringify(thumbnailUsage),
            showHeader: true,
            showFooter: true,
            showNav: true,
            additionalCSS: ['/css/thumbnail-studio-page.css'],
            additionalJS: ['/js/thumbnail-studio-page.js']
        });
    } catch (error) {
        console.error('Thumbnail studio page error:', error);
        res.status(500).render('errors/500', {
            title: 'Error',
            user: req.user,
            subscription: req.subscriptionInfo
        });
    }
});

module.exports = router;
