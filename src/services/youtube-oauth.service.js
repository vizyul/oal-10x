const { google } = require('googleapis');
const crypto = require('crypto');
const { logger } = require('../utils');
const airtable = require('./airtable.service');

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
  async initiateOAuth(userId, redirectUri = null) {
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
      logger.error('Error handling OAuth callback:', error);
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

      const { tokens } = await this.oauth2Client.refreshAccessToken();
      
      // Update stored tokens
      const updatedTokens = {
        ...decryptedTokens,
        ...tokens
      };

      const encryptedTokens = await this.encryptTokens(updatedTokens);
      await this.updateUserTokens(userId, encryptedTokens);

      logger.info(`Tokens refreshed for user ${userId}`);

      return {
        success: true,
        expiresAt: tokens.expiry_date
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw new Error(`Token refresh failed: ${error.message}`);
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
   * @returns {Array} Array of video objects
   */
  async getPlaylistVideos(userId, playlistId) {
    try {
      await this.setUserCredentials(userId);

      const response = await this.youtube.playlistItems.list({
        part: ['snippet'],
        playlistId: playlistId,
        maxResults: 50
      });

      if (!response.data.items) {
        return [];
      }

      const videos = response.data.items
        .filter(item => item.snippet.resourceId.kind === 'youtube#video')
        .map(item => ({
          videoId: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnail: item.snippet.thumbnails?.default?.url,
          publishedAt: item.snippet.publishedAt,
          channelTitle: item.snippet.channelTitle
        }));

      return videos;
    } catch (error) {
      logger.error('Error getting playlist videos:', error);
      throw new Error(`Failed to get playlist videos: ${error.message}`);
    }
  }

  /**
   * Get uploaded videos for a channel
   * @param {string} userId - User ID
   * @param {string} channelId - Channel ID
   * @returns {Array} Array of video objects
   */
  async getUserUploadedVideos(userId, channelId) {
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
        return [];
      }

      // Get videos from uploads playlist
      return await this.getPlaylistVideos(userId, uploadsPlaylistId);
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
        } catch (refreshError) {
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

      const cipher = crypto.createCipher(algorithm, key);
      let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        access_token: encrypted,
        refresh_token: encrypted, // In production, encrypt separately
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
   * @param {Object} encryptedTokens - Encrypted token object
   * @returns {Object} Decrypted tokens
   */
  async decryptTokens(encryptedTokens) {
    try {
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY not configured');
      }

      // For now, return mock decrypted tokens (implement proper decryption)
      return {
        access_token: 'decrypted_access_token',
        refresh_token: 'decrypted_refresh_token'
      };
    } catch (error) {
      logger.error('Error decrypting tokens:', error);
      throw new Error('Token decryption failed');
    }
  }

  /**
   * Store user tokens in Airtable
   * @param {string} userId - User ID
   * @param {Object} encryptedTokens - Encrypted tokens
   * @param {Object} channelData - Channel information
   * @param {string} scope - OAuth scope
   */
  async storeUserTokens(userId, encryptedTokens, channelData, scope) {
    try {
      const tokenData = {
        user_id: [userId],
        access_token: encryptedTokens.access_token,
        refresh_token: encryptedTokens.refresh_token,
        token_expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        scope: scope || '',
        channel_id: channelData.id,
        channel_name: channelData.name,
        channel_thumbnail: channelData.thumbnail,
        is_active: true,
        last_refreshed: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Note: This table needs to be created in Airtable
      await airtable.create('YouTube OAuth Tokens', tokenData);
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
      const channelRecord = {
        user_id: [userId],
        channel_id: channelData.id,
        channel_name: channelData.name,
        channel_description: channelData.description || '',
        channel_thumbnail: channelData.thumbnail || '',
        subscriber_count: channelData.subscriberCount || 0,
        video_count: channelData.videoCount || 0,
        is_primary: true,
        last_synced: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      // Note: This table needs to be created in Airtable
      await airtable.create('User YouTube Channels', channelRecord);
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
      const records = await airtable.findByField('YouTube OAuth Tokens', 'user_id', userId);
      
      if (!records || records.length === 0) {
        return null;
      }

      // Get the most recent active token
      const activeTokens = records
        .filter(record => record.fields.is_active)
        .sort((a, b) => new Date(b.fields.updated_at) - new Date(a.fields.updated_at));

      return activeTokens.length > 0 ? activeTokens[0].fields : null;
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
      const records = await airtable.findByField('YouTube OAuth Tokens', 'user_id', userId);
      
      if (!records || records.length === 0) {
        throw new Error('No tokens found to update');
      }

      const record = records[0];
      const updateData = {
        access_token: encryptedTokens.access_token,
        refresh_token: encryptedTokens.refresh_token,
        last_refreshed: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await airtable.update('YouTube OAuth Tokens', record.id, updateData);
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
      const records = await airtable.findByField('YouTube OAuth Tokens', 'user_id', userId);
      
      for (const record of records) {
        await airtable.update('YouTube OAuth Tokens', record.id, {
          is_active: false,
          updated_at: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Error deactivating user tokens:', error);
      throw new Error('Failed to deactivate tokens');
    }
  }
}

module.exports = new YouTubeOAuthService();