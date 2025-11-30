const express = require('express');
const { ApifyClient } = require('apify-client');
const { logger } = require('../utils');

const router = express.Router();

/**
 * Internal API endpoint to generate YouTube video transcripts using Apify
 * POST /api/transcript/generate
 *
 * Body: { videoId, videoUrl }
 *
 * This replaces the external call to io.ourailegacy.com/api/appify/get-transcript
 */
router.post('/generate', async (req, res) => {
  const { videoId, videoUrl } = req.body;

  if (!videoId || !videoUrl) {
    return res.status(400).json({
      success: false,
      message: 'videoId and videoUrl are required'
    });
  }

  const apifyToken = process.env.APIFY_TOKEN;

  if (!apifyToken) {
    logger.error('APIFY_TOKEN not configured');
    return res.status(500).json({
      success: false,
      message: 'Transcript service not configured'
    });
  }

  try {
    logger.info(`Generating transcript for video: ${videoId}`);

    // Initialize the ApifyClient with API token
    const client = new ApifyClient({
      token: apifyToken,
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

    // Run the Apify actor for YouTube transcript extraction
    const run = await client.actor('1s7eXiaukVuOr4Ueg').call(input);

    // Fetch results from the run's dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      logger.warn(`No transcript data returned for video: ${videoId}`);
      return res.status(404).json({
        success: false,
        message: 'No transcript available for this video'
      });
    }

    // Get the transcript from the first item
    const transcript = items[0];

    logger.info(`Transcript generated successfully for video: ${videoId}`);

    res.status(200).json({
      success: true,
      transcript
    });

  } catch (error) {
    logger.error(`Error generating transcript for video ${videoId}:`, error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate transcript',
      error: error.message
    });
  }
});

module.exports = router;
