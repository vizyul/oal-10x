const { google } = require('googleapis');
const crypto = require('crypto');
const { logger } = require('../utils');
const { youtubeOauthTokens, userYoutubeChannels, user: userModel } = require('../models');

class YouTubeOAuthService {
  constructor() {
    this.oauth2Client = null;
    this.youtube = null;
    this.init();
  }

  /**
   * Initialize YouTube OAuth service
   */
  init() {
    try {
      const {
        YOUTUBE_CLIENT_ID,
        YOUTUBE_CLIENT_SECRET,
        YOUTUBE_REDIRECT_URI
      } = process.env;

      if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REDIRECT_URI) {
        logger.warn('YouTube OAuth credentials not configured. YouTube integration disabled.');
        return;
      }

      this.oauth2Client = new google.auth.OAuth2(
        YOUTUBE_CLIENT_ID,
        YOUTUBE_CLIENT_SECRET,
        YOUTUBE_REDIRECT_URI
      );

      this.youtube = google.youtube({
        version: 'v3',
        auth: this.oauth2Client
      });

      logger.info('YouTube OAuth service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize YouTube OAuth service:', error);
      throw error;
    }
  }

  /**
   * Initiate OAuth flow for user
   * @param {string} userId - User ID
   * @param {string} redirectUri - Custom redirect URI (optional)
   * @returns {Object} Authorization URL and state
   */
  async initiateOAuth(userId, _redirectUri = null) {
    try {
      if (!this.oauth2Client) {
        throw new Error('YouTube OAuth not configured');
      }

      // Generate state parameter to prevent CSRF attacks
      const state = crypto.randomBytes(32).toString('hex');

      // Store state temporarily (in production, use Redis or similar)
      // For now, we'll encode userId in the state for simplicity
      const stateData = {
        userId,
        timestamp: Date.now(),
        random: state
      };
      const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64');

      const scopes = [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.force-ssl'
      ];

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: encodedState,
        prompt: 'consent' // Force consent screen to ensure refresh token
      });

      logger.info(`OAuth initiated for user ${userId}`, { state: encodedState });

      return {
        authUrl,
        state: encodedState
      };
    } catch (error) {
      logger.error('Error initiating OAuth:', error);
      throw new Error('Failed to initiate YouTube OAuth');
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   * @param {string} code - Authorization code from Google
   * @param {string} state - State parameter from OAuth flow
   * @returns {Object} Token information and user channel data
   */
  async handleOAuthCallback(code, state) {
    try {
      if (!this.oauth2Client) {
        throw new Error('YouTube OAuth not configured');
      }

      // Decode and validate state
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, timestamp } = stateData;
      logger.info('Decoded OAuth state', { userId, userIdType: typeof userId, timestamp });

      // Validate user ID
      if (!userId || userId === 'undefined' || userId === 'null') {
        throw new Error('Invalid user ID in OAuth state');
      }

      // Check if state is not older than 10 minutes
      if (Date.now() - timestamp > 10 * 60 * 1000) {
        throw new Error('OAuth state expired');
      }

      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error('Failed to obtain access token');
      }

      this.oauth2Client.setCredentials(tokens);

      // Get user's channel information
      const channelResponse = await this.youtube.channels.list({
        part: ['snippet', 'statistics'],
        mine: true
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error('No YouTube channels found for this account');
      }

      const channel = channelResponse.data.items[0];
      const channelData = {
        id: channel.id,
        name: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        handle: channel.snippet.customUrl || null,
        subscriberCount: parseInt(channel.statistics?.subscriberCount) || 0,
        videoCount: parseInt(channel.statistics?.videoCount) || 0
      };

      // Encrypt and store tokens
      const encryptedTokens = await this.encryptTokens(tokens);

      // Store tokens in Airtable
      await this.storeUserTokens(userId, encryptedTokens, channelData, tokens.scope);

      // Store channel information
      await this.storeUserChannel(userId, channelData);

      logger.info(`OAuth completed for user ${userId}`, {
        channelId: channel.id,
        channelName: channel.snippet.title
      });

      return {
        success: true,
        channel: channelData,
        tokens: {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresAt: tokens.expiry_date
        }
      };
    } catch (error) {
      logger.error('Error handling OAuth callback:', error.message);
      logger.error('Full error stack:', error.stack);
      throw new Error(`OAuth callback failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token for user
   * @param {string} userId - User ID
   * @returns {Object} New token information
   */
  async refreshAccessToken(userId) {
    try {
      const tokenRecord = await this.getUserTokens(userId);
      if (!tokenRecord) {
        throw new Error('No tokens found for user');
      }

      const decryptedTokens = await this.decryptTokens(tokenRecord);

      if (!decryptedTokens.refresh_token) {
        throw new Error('No refresh token available');
      }

      this.oauth2Client.setCredentials({
        refresh_token: decryptedTokens.refresh_token
      });

      const refreshResult = await this.oauth2Client.refreshAccessToken();
      // Only log OAuth refresh in debug mode
      logger.debug('OAuth tokens refreshed successfully');

      // Google OAuth client returns credentials, not tokens
      let tokens;
      if (refreshResult?.tokens) {
        tokens = refreshResult.tokens;
      } else if (refreshResult?.credentials) {
        tokens = refreshResult.credentials;
      } else {
        throw new Error('No tokens or credentials returned from refresh');
      }

      // Update stored tokens
      const updatedTokens = {
        ...decryptedTokens,
        ...tokens
      };

      const encryptedTokens = await this.encryptTokens(updatedTokens);
      await this.updateUserTokens(userId, encryptedTokens);

      logger.debug(`Tokens refreshed for user ${userId}`);

      // tokens.expiry_date might be undefined, use a fallback
      const expiresAt = tokens.expiry_date || (Date.now() + 3600000); // Default to 1 hour from now

      return {
        success: true,
        expiresAt: expiresAt
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error.message || 'Unknown error');
      logger.error('Full refresh error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.substring(0, 500)
      });
      throw new Error(`Token refresh failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Get user's YouTube channels
   * @param {string} userId - User ID
   * @returns {Array} Array of channel objects
   */
  async getUserChannels(userId) {
    try {
      await this.setUserCredentials(userId);

      const response = await this.youtube.channels.list({
        part: ['snippet', 'statistics', 'brandingSettings'],
        mine: true
      });

      if (!response.data.items) {
        return [];
      }

      const channels = response.data.items.map(channel => ({
        id: channel.id,
        name: channel.snippet.title,
        description: channel.snippet.description,
        customUrl: channel.snippet.customUrl,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        subscriberCount: parseInt(channel.statistics?.subscriberCount) || 0,
        videoCount: parseInt(channel.statistics?.videoCount) || 0,
        viewCount: parseInt(channel.statistics?.viewCount) || 0,
        publishedAt: channel.snippet.publishedAt
      }));

      return channels;
    } catch (error) {
      logger.error('Error getting user channels:', error);
      throw new Error(`Failed to get channels: ${error.message}`);
    }
  }

  /**
   * Get playlists for a channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @returns {Array} Array of playlist objects
   */
  async getChannelPlaylists(userId, channelId) {
    try {
      await this.setUserCredentials(userId);

      const response = await this.youtube.playlists.list({
        part: ['snippet', 'contentDetails'],
        channelId: channelId,
        maxResults: 50
      });

      if (!response.data.items) {
        return [];
      }

      const playlists = response.data.items.map(playlist => ({
        id: playlist.id,
        title: playlist.snippet.title,
        description: playlist.snippet.description,
        thumbnail: playlist.snippet.thumbnails?.default?.url,
        itemCount: playlist.contentDetails.itemCount,
        publishedAt: playlist.snippet.publishedAt
      }));

      return playlists;
    } catch (error) {
      logger.error('Error getting channel playlists:', error);
      throw new Error(`Failed to get playlists: ${error.message}`);
    }
  }

  /**
   * Get videos from a playlist
   * @param {string} userId - User ID
   * @param {string} playlistId - Playlist ID
   * @param {string} pageToken - Optional pagination token for next page
   * @returns {Object} Object with videos array and pagination info
   */
  async getPlaylistVideos(userId, playlistId, pageToken = null) {
    try {
      await this.setUserCredentials(userId);

      const requestParams = {
        part: ['snippet'],
        playlistId: playlistId,
        maxResults: 50
      };

      // Add pagination token if provided
      if (pageToken) {
        requestParams.pageToken = pageToken;
      }

      const response = await this.youtube.playlistItems.list(requestParams);

      if (!response.data.items) {
        return [];
      }

      // Get video IDs for detailed info including duration
      const videoIds = response.data.items
        .filter(item => item.snippet.resourceId.kind === 'youtube#video')
        .map(item => item.snippet.resourceId.videoId);

      if (videoIds.length === 0) {
        return [];
      }

      // Get detailed video information including duration
      const videoDetailsResponse = await this.youtube.videos.list({
        part: ['snippet', 'contentDetails', 'statistics'],
        id: videoIds.join(',')
      });

      const videos = response.data.items
        .filter(item => item.snippet.resourceId.kind === 'youtube#video')
        .map(item => {
          const videoId = item.snippet.resourceId.videoId;
          const videoDetails = videoDetailsResponse.data.items?.find(v => v.id === videoId);

          return {
            id: videoId,
            videoId: videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            thumbnail: item.snippet.thumbnails?.default?.url || videoDetails?.snippet?.thumbnails?.default?.url,
            publishedAt: item.snippet.publishedAt,
            channelTitle: item.snippet.channelTitle,
            duration: videoDetails ? this.parseDuration(videoDetails.contentDetails.duration) : null,
            viewCount: videoDetails ? parseInt(videoDetails.statistics?.viewCount || 0) : 0
          };
        });

      // Return videos with pagination info
      return {
        videos: videos,
        nextPageToken: response.data.nextPageToken || null,
        totalResults: response.data.pageInfo?.totalResults || videos.length,
        resultsPerPage: response.data.pageInfo?.resultsPerPage || 50
      };
    } catch (error) {
      logger.error('Error getting playlist videos:', error);
      throw new Error(`Failed to get playlist videos: ${error.message}`);
    }
  }

  /**
   * Parse YouTube duration format (PT4M13S) to seconds
   * @param {string} duration - YouTube duration string
   * @returns {number} Duration in seconds
   */
  parseDuration(duration) {
    if (!duration) return null;

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;

    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Get uploaded videos for a channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @param {string} pageToken - Optional pagination token
   * @returns {Object} Object with videos array, nextPageToken, and totalResults
   */
  async getUserUploadedVideos(userId, channelId, pageToken = null) {
    try {
      await this.setUserCredentials(userId);

      // First get the uploads playlist ID
      const channelResponse = await this.youtube.channels.list({
        part: ['contentDetails'],
        id: channelId
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        throw new Error('Channel not found');
      }

      const uploadsPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      if (!uploadsPlaylistId) {
        return { videos: [], nextPageToken: null, totalResults: 0 };
      }

      // Get videos from uploads playlist
      return await this.getPlaylistVideos(userId, uploadsPlaylistId, pageToken);
    } catch (error) {
      logger.error('Error getting user uploaded videos:', error);
      throw new Error(`Failed to get uploaded videos: ${error.message}`);
    }
  }

  /**
   * Revoke OAuth access for user
   * @param {string} userId - User ID
   * @returns {Boolean} Success status
   */
  async revokeAccess(userId) {
    try {
      const tokenRecord = await this.getUserTokens(userId);
      if (!tokenRecord) {
        return true; // Already revoked
      }

      const decryptedTokens = await this.decryptTokens(tokenRecord);

      if (decryptedTokens.access_token) {
        // Revoke token with Google
        await this.oauth2Client.revokeToken(decryptedTokens.access_token);
      }

      // Mark tokens as inactive in database
      await this.deactivateUserTokens(userId);

      logger.info(`OAuth access revoked for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error revoking access:', error);
      throw new Error(`Failed to revoke access: ${error.message}`);
    }
  }

  /**
   * Validate user tokens
   * @param {string} userId - User ID
   * @returns {Object} Validation result
   */
  async validateTokens(userId) {
    try {
      const tokenRecord = await this.getUserTokens(userId);
      if (!tokenRecord || !tokenRecord.is_active) {
        return { valid: false, reason: 'No active tokens' };
      }

      const now = new Date();
      const expiresAt = new Date(tokenRecord.token_expires_at);

      if (now >= expiresAt) {
        // Try to refresh
        try {
          await this.refreshAccessToken(userId);
          return { valid: true, refreshed: true };
        // eslint-disable-next-line no-unused-vars
        } catch (_refreshError) {
          return { valid: false, reason: 'Token expired and refresh failed' };
        }
      }

      return { valid: true, refreshed: false };
    } catch (error) {
      logger.error('Error validating tokens:', error);
      return { valid: false, reason: error.message };
    }
  }

  // Helper methods

  /**
   * Convert user ID to PostgreSQL integer ID
   * @param {*} userId - User ID (can be Airtable record ID or integer)
   * @returns {Promise<number>} PostgreSQL integer user ID
   */
  async resolveUserId(userId) {
    if (!userId || userId === 'undefined' || userId === 'null') {
      throw new Error('Invalid user ID: user ID is null or undefined');
    }

    // If it's already an integer, return it
    const parsed = parseInt(userId);
    if (!isNaN(parsed) && userId.toString() === parsed.toString()) {
      return parsed;
    }

    // If it starts with 'rec', it's an Airtable record ID - look up the PostgreSQL ID
    if (userId.toString().startsWith('rec')) {
      const user = await userModel.findByAirtableId(userId);
      if (!user) {
        throw new Error(`No PostgreSQL user found for Airtable ID: ${userId}`);
      }
      return user.id;
    }

    throw new Error(`Invalid user ID format: ${userId}`);
  }

  /**
   * Set user credentials for API calls
   * @param {string} userId - User ID
   */
  async setUserCredentials(userId) {
    const validation = await this.validateTokens(userId);
    if (!validation.valid) {
      throw new Error(`Invalid tokens: ${validation.reason}`);
    }

    const tokenRecord = await this.getUserTokens(userId);
    const decryptedTokens = await this.decryptTokens(tokenRecord);

    this.oauth2Client.setCredentials({
      access_token: decryptedTokens.access_token,
      refresh_token: decryptedTokens.refresh_token
    });
  }

  /**
   * Encrypt tokens for secure storage
   * @param {Object} tokens - Token object
   * @returns {Object} Encrypted tokens
   */
  async encryptTokens(tokens) {
    try {
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key || key.length !== 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be 32 characters long');
      }

      const algorithm = 'aes-256-cbc';
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'utf8'), iv);
      let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted_tokens: encrypted,
        iv: iv.toString('hex'),
        algorithm
      };
    } catch (error) {
      logger.error('Error encrypting tokens:', error);
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt tokens from storage
   * @param {Object} encryptedData - Encrypted token object
   * @returns {Object} Decrypted tokens
   */
  async decryptTokens(encryptedData) {
    try {
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY not configured');
      }

      // Handle both formats: direct database record and encryption object
      const encryptedTokens = encryptedData.encrypted_tokens;
      const ivHex = encryptedData.encryption_iv || encryptedData.iv;
      const algorithm = encryptedData.encryption_algorithm || encryptedData.algorithm || 'aes-256-cbc';

      if (!encryptedTokens || !ivHex) {
        throw new Error('Invalid encrypted data format - missing encrypted_tokens or IV');
      }

      const iv = Buffer.from(ivHex, 'hex');

      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'utf8'), iv);
      let decrypted = decipher.update(encryptedTokens, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Error decrypting tokens:', error);
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Store user tokens in PostgreSQL (upsert: update if exists, create if not)
   * @param {string} userId - User ID
   * @param {Object} encryptedTokens - Encrypted tokens
   * @param {Object} channelData - Channel information
   * @param {string} scope - OAuth scope
   */
  async storeUserTokens(userId, encryptedTokens, channelData, scope) {
    try {
      const resolvedUserId = await this.resolveUserId(userId);

      // Check if tokens already exist for this user and channel
      const existingToken = await youtubeOauthTokens.findUserChannelToken(resolvedUserId, channelData.id);

      const tokenData = {
        users_id: resolvedUserId,
        encrypted_tokens: encryptedTokens.encrypted_tokens,
        encryption_iv: encryptedTokens.iv,
        encryption_algorithm: encryptedTokens.algorithm,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        scope: scope || '',
        channel_id: channelData.id,
        channel_name: channelData.name,
        channel_thumbnail: channelData.thumbnail,
        is_active: true,
        last_refreshed: new Date().toISOString()
      };

      let result;
      if (existingToken) {
        // Update existing record
        result = await youtubeOauthTokens.updateToken(existingToken.id, tokenData);
        logger.debug(`Tokens updated in PostgreSQL for user ${userId}`);
      } else {
        // Create new record
        result = await youtubeOauthTokens.createToken(tokenData);
        logger.debug(`Tokens created in PostgreSQL for user ${userId}`);
      }

      return result;
    } catch (error) {
      logger.error('Error storing user tokens:', error);
      throw new Error('Failed to store tokens');
    }
  }

  /**
   * Store user channel information
   * @param {string} userId - User ID
   * @param {Object} channelData - Channel information
   */
  async storeUserChannel(userId, channelData) {
    try {
      const resolvedUserId = await this.resolveUserId(userId);

      // Check if channel already exists
      const existingChannel = await userYoutubeChannels.findByChannelId(channelData.id);

      const channelRecord = {
        users_id: resolvedUserId,
        channel_id: channelData.id,
        channel_name: channelData.name,
        channel_description: channelData.description || '',
        channel_thumbnail: channelData.thumbnail || '',
        channel_handle: channelData.handle || null,
        subscriber_count: channelData.subscriberCount || 0,
        video_count: channelData.videoCount || 0,
        is_primary: true,
        last_synced: new Date().toISOString()
      };

      let result;
      if (existingChannel) {
        // Update existing channel
        result = await userYoutubeChannels.updateChannel(existingChannel.id, channelRecord);
        logger.debug(`Channel updated in PostgreSQL for user ${userId}`);
      } else {
        // Create new channel
        result = await userYoutubeChannels.createChannel(channelRecord);
        logger.debug(`Channel created in PostgreSQL for user ${userId}`);
      }

      return result;
    } catch (error) {
      logger.error('Error storing user channel:', error);
      throw new Error('Failed to store channel information');
    }
  }

  /**
   * Get user tokens from database
   * @param {string} userId - User ID
   * @returns {Object|null} Token record
   */
  async getUserTokens(userId) {
    try {
      // Get tokens from PostgreSQL
      const resolvedUserId = await this.resolveUserId(userId);
      const tokens = await youtubeOauthTokens.getUserTokensWithSecrets(resolvedUserId);

      if (!tokens || tokens.length === 0) {
        return null;
      }

      // Get the most recent active token
      const activeTokens = tokens
        .filter(record => record.is_active)
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

      return activeTokens.length > 0 ? activeTokens[0] : null;
    } catch (error) {
      logger.error('Error getting user tokens:', error);
      return null;
    }
  }

  /**
   * Update user tokens
   * @param {string} userId - User ID
   * @param {Object} encryptedTokens - Updated encrypted tokens
   */
  async updateUserTokens(userId, encryptedTokens) {
    try {
      const resolvedUserId = await this.resolveUserId(userId);
      const tokens = await youtubeOauthTokens.getUserTokens(resolvedUserId, { activeOnly: true });

      if (!tokens || tokens.length === 0) {
        throw new Error('No tokens found to update');
      }

      const record = tokens[0];
      const updateData = {
        encrypted_tokens: encryptedTokens.encrypted_tokens,
        encryption_iv: encryptedTokens.iv,
        encryption_algorithm: encryptedTokens.algorithm,
        last_refreshed: new Date().toISOString()
      };

      await youtubeOauthTokens.updateToken(record.id, updateData);
    } catch (error) {
      logger.error('Error updating user tokens:', error);
      throw new Error('Failed to update tokens');
    }
  }

  /**
   * Deactivate user tokens
   * @param {string} userId - User ID
   */
  async deactivateUserTokens(userId) {
    try {
      const resolvedUserId = await this.resolveUserId(userId);
      await youtubeOauthTokens.deactivateUserTokens(resolvedUserId);
    } catch (error) {
      logger.error('Error deactivating user tokens:', error);
      throw new Error('Failed to deactivate tokens');
    }
  }
}

module.exports = new YouTubeOAuthService();
