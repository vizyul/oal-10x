const { google } = require('googleapis');
const axios = require('axios');
const { logger } = require('../utils');

class YouTubeMetadataService {
  constructor() {
    this.youtube = null;
    this.init();
  }

  /**
   * Initialize YouTube Data API service
   */
  init() {
    try {
      const { YOUTUBE_API_KEY } = process.env;

      if (!YOUTUBE_API_KEY) {
        logger.warn('YouTube API key not configured. Metadata extraction will be limited.');
        return;
      }

      this.youtube = google.youtube({
        version: 'v3',
        auth: YOUTUBE_API_KEY
      });

      logger.info('YouTube Metadata service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize YouTube Metadata service:', error);
    }
  }

  /**
   * Extract video metadata from YouTube URL
   * @param {string} videoUrl - YouTube video URL
   * @returns {Object} Video metadata
   */
  async extractVideoMetadata(videoUrl) {
    try {
      const videoId = this.extractVideoId(videoUrl);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // Normalize URL to standard format for consistent processing
      const normalizedUrl = `https://youtube.com/watch?v=${videoId}`;

      logger.info(`Extracting metadata for video: ${videoId}`);

      // Get video details from YouTube API
      const videoData = await this.getVideoDetails(videoId);

      // Get additional metadata
      // eslint-disable-next-line no-unused-vars
      const _thumbnails = await this.getVideoThumbnails(videoId);
      const stats = await this.getVideoStats(videoId);

      // Try to get captions/transcript if available
      let transcript = null;
      try {
        transcript = await this.getVideoTranscript(videoId);
      } catch (transcriptError) {
        logger.warn(`Could not fetch transcript for ${videoId}:`, transcriptError.message);
      }

      // Get channel information for handle
      let channelInfo = null;
      try {
        channelInfo = await this.getChannelInfo(videoData.snippet.channelId);
      } catch (channelError) {
        logger.warn(`Could not fetch channel info for ${videoData.snippet.channelId}:`, channelError.message);
      }

      const metadata = {
        videoId,
        url: normalizedUrl,
        title: videoData.snippet.title,
        description: videoData.snippet.description,
        channelId: videoData.snippet.channelId,
        channelTitle: videoData.snippet.channelTitle,
        channelHandle: channelInfo?.handle || null,
        publishedAt: videoData.snippet.publishedAt,
        duration: this.parseDuration(videoData.contentDetails.duration),
        thumbnails: this.formatThumbnails(videoData.snippet.thumbnails),
        highResThumbnail: this.getHighResThumbnailUrl(videoId, videoData.snippet.thumbnails),
        tags: (videoData.snippet.tags && videoData.snippet.tags.length > 0) ? videoData.snippet.tags : null,
        categoryId: videoData.snippet.categoryId,
        defaultLanguage: videoData.snippet.defaultLanguage,
        defaultAudioLanguage: videoData.snippet.defaultAudioLanguage,
        statistics: {
          viewCount: parseInt(stats.viewCount) || 0,
          likeCount: parseInt(stats.likeCount) || 0,
          commentCount: parseInt(stats.commentCount) || 0
        },
        transcript: transcript,
        extractedAt: new Date().toISOString()
      };

      logger.info(`Successfully extracted metadata for: ${metadata.title}`);
      return metadata;

    } catch (error) {
      logger.error('Error extracting video metadata:', error);
      throw new Error(`Failed to extract video metadata: ${error.message}`);
    }
  }

  /**
   * Validate YouTube video URL
   * @param {string} url - YouTube URL to validate
   * @returns {Object} Validation result
   */
  async validateVideoUrl(url) {
    try {
      const videoId = this.extractVideoId(url);
      if (!videoId) {
        return {
          valid: false,
          error: 'Invalid YouTube URL format'
        };
      }

      // Check if video exists and is accessible
      try {
        await this.getVideoDetails(videoId);
        return {
          valid: true,
          videoId: videoId
        };
      } catch (error) {
        if (error.message.includes('not found')) {
          return {
            valid: false,
            error: 'Video not found or is private'
          };
        }
        throw error;
      }

    } catch (error) {
      logger.error('Error validating video URL:', error);
      return {
        valid: false,
        error: 'Error checking video accessibility'
      };
    }
  }

  /**
   * Get video details from YouTube API
   * @param {string} videoId - YouTube video ID
   * @returns {Object} Video details
   */
  async getVideoDetails(videoId) {
    try {
      if (!this.youtube) {
        throw new Error('YouTube API not configured');
      }

      const response = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics', 'status'],
        id: videoId
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video not found');
      }

      const video = response.data.items[0];

      // Check if video is available
      if (video.status.privacyStatus === 'private') {
        throw new Error('Video is private');
      }

      return video;

    } catch (error) {
      logger.error(`Error getting video details for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Get video thumbnails
   * @param {string} videoId - YouTube video ID
   * @returns {Array} Array of thumbnail objects
   */
  async getVideoThumbnails(videoId) {
    try {
      // YouTube thumbnails are predictable based on video ID
      const thumbnails = [
        {
          quality: 'default',
          url: `https://img.youtube.com/vi/${videoId}/default.jpg`,
          width: 120,
          height: 90
        },
        {
          quality: 'medium',
          url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          width: 320,
          height: 180
        },
        {
          quality: 'high',
          url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          width: 480,
          height: 360
        },
        {
          quality: 'standard',
          url: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
          width: 640,
          height: 480
        },
        {
          quality: 'maxres',
          url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          width: 1280,
          height: 720
        }
      ];

      // Verify which thumbnails actually exist
      const verifiedThumbnails = [];
      for (const thumbnail of thumbnails) {
        try {
          const response = await axios.head(thumbnail.url, { timeout: 5000 });
          if (response.status === 200) {
            verifiedThumbnails.push(thumbnail);
          }
        // eslint-disable-next-line no-unused-vars
        } catch (_error) {
          // Thumbnail doesn't exist, skip it
          logger.debug(`Thumbnail ${thumbnail.quality} not available for ${videoId}`);
        }
      }

      return verifiedThumbnails;

    } catch (error) {
      logger.error(`Error getting thumbnails for ${videoId}:`, error);
      return [];
    }
  }

  /**
   * Get video statistics
   * @param {string} videoId - YouTube video ID
   * @returns {Object} Video statistics
   */
  async getVideoStats(videoId) {
    try {
      if (!this.youtube) {
        return {
          viewCount: '0',
          likeCount: '0',
          commentCount: '0'
        };
      }

      const response = await this.youtube.videos.list({
        part: ['statistics'],
        id: videoId
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Video statistics not found');
      }

      return response.data.items[0].statistics;

    } catch (error) {
      logger.error(`Error getting video stats for ${videoId}:`, error);
      return {
        viewCount: '0',
        likeCount: '0',
        commentCount: '0'
      };
    }
  }

  /**
   * Get video transcript/captions if available
   * @param {string} videoId - YouTube video ID
   * @returns {string|null} Video transcript
   */
  async getVideoTranscript(videoId) {
    try {
      if (!this.youtube) {
        return null;
      }

      // First, get caption tracks
      const captionsResponse = await this.youtube.captions.list({
        part: ['snippet'],
        videoId: videoId
      });

      if (!captionsResponse.data.items || captionsResponse.data.items.length === 0) {
        return null; // No captions available
      }

      // Find English captions or the first available
      let captionTrack = captionsResponse.data.items.find(item =>
        item.snippet.language === 'en' || item.snippet.language === 'en-US'
      );

      if (!captionTrack) {
        captionTrack = captionsResponse.data.items[0];
      }

      // Download the caption track
      const captionResponse = await this.youtube.captions.download({
        id: captionTrack.id,
        tfmt: 'srt' // SubRip format
      });

      return captionResponse.data;

    } catch (error) {
      logger.debug(`Captions not available for ${videoId}:`, error.message);
      return null;
    }
  }

  /**
   * Get channel information from channel ID
   * @param {string} channelId - YouTube channel ID
   * @returns {Object} Channel information
   */
  async getChannelInfo(channelId) {
    try {
      if (!this.youtube) {
        throw new Error('YouTube API not configured');
      }

      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'brandingSettings'],
        id: channelId
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error('Channel not found');
      }

      const channel = response.data.items[0];

      return {
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        handle: this.extractChannelHandle(channel.snippet.customUrl),
        publishedAt: channel.snippet.publishedAt,
        thumbnails: this.formatThumbnails(channel.snippet.thumbnails),
        statistics: {
          viewCount: parseInt(channel.statistics.viewCount) || 0,
          subscriberCount: parseInt(channel.statistics.subscriberCount) || 0,
          videoCount: parseInt(channel.statistics.videoCount) || 0
        },
        branding: {
          keywords: channel.brandingSettings?.channel?.keywords,
          unsubscribedTrailer: channel.brandingSettings?.channel?.unsubscribedTrailer
        }
      };

    } catch (error) {
      logger.error(`Error getting channel info for ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Search for videos by query
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} Array of video results
   */
  async searchVideos(query, options = {}) {
    try {
      if (!this.youtube) {
        throw new Error('YouTube API not configured');
      }

      const searchParams = {
        part: ['snippet'],
        q: query,
        type: 'video',
        maxResults: options.maxResults || 25,
        order: options.order || 'relevance',
        publishedAfter: options.publishedAfter,
        publishedBefore: options.publishedBefore,
        duration: options.duration, // short, medium, long
        videoDefinition: options.videoDefinition, // standard, high
        regionCode: options.regionCode || 'US'
      };

      // Remove undefined parameters
      Object.keys(searchParams).forEach(key => {
        if (searchParams[key] === undefined) {
          delete searchParams[key];
        }
      });

      const response = await this.youtube.search.list(searchParams);

      if (!response.data.items) {
        return [];
      }

      return response.data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        thumbnails: this.formatThumbnails(item.snippet.thumbnails)
      }));

    } catch (error) {
      logger.error('Error searching videos:', error);
      throw error;
    }
  }

  // Helper methods

  /**
   * Extract video ID from various YouTube URL formats
   * @param {string} url - YouTube URL
   * @returns {string|null} Video ID or null if invalid
   */
  extractVideoId(url) {
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\S*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})(?:\S*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\S*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([a-zA-Z0-9_-]{11})(?:\S*)?/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})(?:\S*)?/,  // Support for YouTube live URLs
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?:\S*)?/  // Support for YouTube Shorts
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   * @param {string} duration - YouTube duration string
   * @returns {number} Duration in seconds
   */
  parseDuration(duration) {
    if (!duration) return 0;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Format thumbnail data
   * @param {Object} thumbnails - YouTube thumbnails object
   * @returns {Array} Formatted thumbnails array
   */
  formatThumbnails(thumbnails) {
    if (!thumbnails) return [];

    return Object.entries(thumbnails).map(([quality, data]) => ({
      quality,
      url: data.url,
      width: data.width,
      height: data.height
    }));
  }

  /**
   * Get video category name from category ID
   * @param {string} categoryId - YouTube category ID
   * @returns {string} Category name
   */
  async getCategoryName(categoryId) {
    try {
      if (!this.youtube || !categoryId) {
        return 'Unknown';
      }

      const response = await this.youtube.videoCategories.list({
        part: ['snippet'],
        id: categoryId
      });

      if (response.data.items && response.data.items.length > 0) {
        return response.data.items[0].snippet.title;
      }

      return 'Unknown';

    } catch (error) {
      logger.error(`Error getting category name for ${categoryId}:`, error);
      return 'Unknown';
    }
  }

  /**
   * Format duration from seconds to human readable format
   * @param {number} seconds - Duration in seconds
   * @returns {string} Formatted duration (e.g., "4:13", "1:02:30")
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Clean and truncate description text
   * @param {string} description - Raw description
   * @param {number} maxLength - Maximum length
   * @returns {string} Cleaned description
   */
  cleanDescription(description, maxLength = 500) {
    if (!description) return '';

    // Remove excessive whitespace and newlines
    let cleaned = description.replace(/\n{3,}/g, '\n\n').trim();

    // Truncate if too long
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength).trim() + '...';
    }

    return cleaned;
  }

  /**
   * Extract channel handle from customUrl
   * @param {string} customUrl - YouTube channel custom URL
   * @returns {string|null} Channel handle (e.g., "@prophetdwight") or null
   */
  extractChannelHandle(customUrl) {
    if (!customUrl) return null;

    // Handle the new @handle format
    if (customUrl.startsWith('@')) {
      return customUrl;
    }

    // Handle legacy custom URLs (convert to @handle format)
    if (customUrl.startsWith('c/') || customUrl.startsWith('user/')) {
      const handlePart = customUrl.split('/').pop();
      return `@${handlePart}`;
    }

    // If it's already a clean handle without @, add it
    if (customUrl && !customUrl.includes('/')) {
      return `@${customUrl}`;
    }

    return null;
  }

  /**
   * Get the highest resolution thumbnail URL available
   * @param {string} videoId - YouTube video ID
   * @param {Object} thumbnails - YouTube thumbnails object
   * @returns {string} High resolution thumbnail URL
   */
  getHighResThumbnailUrl(videoId, thumbnails) {
    // Priority order: maxresdefault > sddefault > hqdefault > mqdefault > default
    const priorities = ['maxresdefault', 'standard', 'high', 'medium', 'default'];

    // First try to get from YouTube API thumbnails
    if (thumbnails) {
      for (const priority of priorities) {
        if (thumbnails[priority]) {
          return thumbnails[priority].url;
        }
      }
    }

    // Fallback to direct YouTube thumbnail URLs
    return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  }
}

module.exports = new YouTubeMetadataService();
