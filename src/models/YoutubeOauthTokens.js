const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * YouTube OAuth Tokens Model
 * Manages YouTube OAuth access and refresh tokens with encryption support
 * Provides secure token storage, refresh functionality, and channel management
 */
class YoutubeOauthTokens extends BaseModel {
  constructor() {
    super('youtube_oauth_tokens', 'id');
    
    this.fillable = [
      'users_id', 'access_token', 'refresh_token', 'expires_at', 'scope',
      'token_type', 'is_active', 'last_used', 'channel_id', 'encrypted_data',
      'encrypted_tokens', 'encryption_iv', 'encryption_algorithm',
      'channel_name', 'channel_thumbnail', 'last_refreshed', 'token_expires_at'
    ];
    
    // Hide sensitive token fields for security
    this.hidden = [
      'access_token', 'refresh_token', 'encrypted_tokens', 'encrypted_data', 'encryption_iv'
    ];
    
    this.casts = {
      'users_id': 'integer',
      'is_active': 'boolean',
      'expires_at': 'date',
      'last_used': 'date',
      'last_refreshed': 'date',
      'token_expires_at': 'date',
      'created_at': 'date',
      'updated_at': 'date'
    };
  }

  /**
   * Create a new YouTube OAuth token record
   * @param {object} tokenData - Token data
   * @returns {Promise<object>} Created token record
   */
  async createToken(tokenData) {
    try {
      // Set defaults for optional fields
      const data = {
        is_active: true,
        token_type: 'Bearer',
        encryption_algorithm: 'aes-256-cbc',
        ...tokenData
      };

      // Validate required fields
      this.validateTokenData(data);

      return await this.create(data);
    } catch (error) {
      logger.error('Error creating YouTube OAuth token:', error);
      throw error;
    }
  }

  /**
   * Update an existing YouTube OAuth token
   * @param {number} tokenId - Token ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated token record
   */
  async updateToken(tokenId, updateData) {
    try {
      // Update last_refreshed if tokens are being updated
      if (updateData.access_token || updateData.refresh_token || updateData.encrypted_tokens) {
        updateData.last_refreshed = new Date();
      }

      return await this.update(tokenId, updateData);
    } catch (error) {
      logger.error(`Error updating YouTube OAuth token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a YouTube OAuth token
   * @param {number} tokenId - Token ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteToken(tokenId) {
    try {
      return await this.delete(tokenId);
    } catch (error) {
      logger.error(`Error deleting YouTube OAuth token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Get token by ID (includes sensitive data for internal use)
   * @param {number} tokenId - Token ID
   * @param {boolean} includeSensitive - Whether to include sensitive token data
   * @returns {Promise<object|null>} Token object or null
   */
  async getToken(tokenId, includeSensitive = false) {
    try {
      if (includeSensitive) {
        // Use raw query to bypass hidden fields
        const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
        const result = await database.query(query, [tokenId]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } else {
        return await this.findById(tokenId);
      }
    } catch (error) {
      logger.error(`Error getting YouTube OAuth token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Find active tokens for a user
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of user tokens
   */
  async getUserTokens(userId, options = {}) {
    try {
      const conditions = { users_id: userId };
      
      if (options.activeOnly !== false) {
        conditions.is_active = true;
      }
      
      return await this.findAll(conditions, {
        orderBy: 'created_at DESC',
        ...options
      });
    } catch (error) {
      logger.error(`Error getting YouTube OAuth tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find token by channel ID
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<object|null>} Token object or null
   */
  async findByChannelId(channelId) {
    try {
      const tokens = await this.findByField('channel_id', channelId);
      return tokens.length > 0 ? tokens[0] : null;
    } catch (error) {
      logger.error(`Error finding token by channel ID ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Find active token for user and channel
   * @param {number} userId - User ID
   * @param {string} channelId - YouTube channel ID
   * @returns {Promise<object|null>} Token object or null
   */
  async findUserChannelToken(userId, channelId) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE users_id = $1 AND channel_id = $2 AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const result = await database.query(query, [userId, channelId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding token for user ${userId} and channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's active tokens with sensitive data (for token refresh)
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Array of tokens with sensitive data
   */
  async getUserTokensWithSecrets(userId) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE users_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `;
      
      const result = await database.query(query, [userId]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting user tokens with secrets for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has valid YouTube OAuth token
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} True if user has valid token
   */
  async hasValidToken(userId) {
    try {
      const query = `
        SELECT COUNT(*) as count FROM ${this.tableName} 
        WHERE users_id = $1 
        AND is_active = true 
        AND (token_expires_at IS NULL OR token_expires_at > CURRENT_TIMESTAMP)
      `;
      
      const result = await database.query(query, [userId]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error(`Error checking valid token for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Get tokens that need refresh (expired or expiring soon)
   * @param {number} bufferMinutes - Minutes before expiry to consider for refresh
   * @returns {Promise<Array>} Array of tokens needing refresh
   */
  async getTokensNeedingRefresh(bufferMinutes = 10) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE is_active = true 
        AND refresh_token IS NOT NULL
        AND (
          token_expires_at IS NULL 
          OR token_expires_at <= CURRENT_TIMESTAMP + INTERVAL '${bufferMinutes} minutes'
        )
        ORDER BY token_expires_at ASC
      `;
      
      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting tokens needing refresh:', error);
      throw error;
    }
  }

  /**
   * Mark token as used (update last_used timestamp)
   * @param {number} tokenId - Token ID
   * @returns {Promise<object>} Updated token
   */
  async markAsUsed(tokenId) {
    try {
      return await this.update(tokenId, { 
        last_used: new Date() 
      });
    } catch (error) {
      logger.error(`Error marking token ${tokenId} as used:`, error);
      throw error;
    }
  }

  /**
   * Deactivate token
   * @param {number} tokenId - Token ID
   * @returns {Promise<object>} Updated token
   */
  async deactivateToken(tokenId) {
    try {
      return await this.update(tokenId, { 
        is_active: false 
      });
    } catch (error) {
      logger.error(`Error deactivating token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate all tokens for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of tokens deactivated
   */
  async deactivateUserTokens(userId) {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1 AND is_active = true
      `;
      
      const result = await database.query(query, [userId]);
      return result.rowCount || 0;
    } catch (error) {
      logger.error(`Error deactivating tokens for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update channel information for token
   * @param {number} tokenId - Token ID
   * @param {object} channelInfo - Channel information
   * @returns {Promise<object>} Updated token
   */
  async updateChannelInfo(tokenId, channelInfo) {
    try {
      const updateData = {};
      
      if (channelInfo.channelId) updateData.channel_id = channelInfo.channelId;
      if (channelInfo.channelName) updateData.channel_name = channelInfo.channelName;
      if (channelInfo.channelThumbnail) updateData.channel_thumbnail = channelInfo.channelThumbnail;
      
      return await this.update(tokenId, updateData);
    } catch (error) {
      logger.error(`Error updating channel info for token ${tokenId}:`, error);
      throw error;
    }
  }

  /**
   * Get token statistics
   * @returns {Promise<object>} Statistics object
   */
  async getTokenStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_tokens,
          COUNT(*) FILTER (WHERE is_active = true) as active_tokens,
          COUNT(DISTINCT users_id) as unique_users,
          COUNT(DISTINCT channel_id) FILTER (WHERE channel_id IS NOT NULL) as unique_channels,
          COUNT(*) FILTER (WHERE token_expires_at > CURRENT_TIMESTAMP) as valid_tokens,
          COUNT(*) FILTER (WHERE token_expires_at <= CURRENT_TIMESTAMP + INTERVAL '1 day') as expiring_soon
        FROM ${this.tableName}
      `;
      
      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting token statistics:', error);
      throw error;
    }
  }

  /**
   * Clean up expired tokens
   * @param {number} daysOld - Delete tokens older than this many days
   * @returns {Promise<number>} Number of tokens deleted
   */
  async cleanupExpiredTokens(daysOld = 90) {
    try {
      const query = `
        DELETE FROM ${this.tableName} 
        WHERE is_active = false 
        AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
      `;
      
      const result = await database.query(query);
      const deletedCount = result.rowCount || 0;
      
      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired YouTube OAuth tokens`);
      }
      
      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up expired tokens:', error);
      throw error;
    }
  }

  /**
   * Search tokens by channel name
   * @param {string} searchTerm - Search term
   * @param {object} options - Search options
   * @returns {Promise<Array>} Array of matching tokens
   */
  async searchByChannelName(searchTerm, options = {}) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE channel_name ILIKE $1
        ${options.activeOnly !== false ? 'AND is_active = true' : ''}
        ORDER BY channel_name ASC, created_at DESC
        ${options.limit ? `LIMIT ${parseInt(options.limit)}` : ''}
      `;
      
      const searchPattern = `%${searchTerm}%`;
      const result = await database.query(query, [searchPattern]);
      
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error searching tokens by channel name "${searchTerm}":`, error);
      throw error;
    }
  }

  /**
   * Validate token data
   * @param {object} tokenData - Data to validate
   * @param {boolean} isCreate - Whether this is for creation (requires all fields)
   * @throws {Error} Validation error
   */
  validateTokenData(tokenData, isCreate = true) {
    if (isCreate) {
      // Check required fields for creation
      if (!tokenData.users_id) {
        throw new Error('users_id is required');
      }
      
      // Require either encrypted tokens or individual tokens
      if (!tokenData.encrypted_tokens && !tokenData.access_token) {
        throw new Error('Either encrypted_tokens or access_token is required');
      }
    }
    
    // Validate user ID
    if (tokenData.users_id !== undefined) {
      const userId = parseInt(tokenData.users_id);
      if (isNaN(userId) || userId <= 0) {
        throw new Error('users_id must be a positive integer');
      }
    }
    
    // Validate dates
    const dateFields = ['expires_at', 'last_used', 'last_refreshed', 'token_expires_at'];
    for (const field of dateFields) {
      if (tokenData[field] !== undefined && tokenData[field] !== null) {
        const date = new Date(tokenData[field]);
        if (isNaN(date.getTime())) {
          throw new Error(`${field} must be a valid date`);
        }
      }
    }
    
    // Validate encryption algorithm
    if (tokenData.encryption_algorithm && !['aes-256-cbc', 'aes-256-gcm'].includes(tokenData.encryption_algorithm)) {
      throw new Error('encryption_algorithm must be aes-256-cbc or aes-256-gcm');
    }
  }
}

module.exports = YoutubeOauthTokens;