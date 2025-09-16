const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * User YouTube Channels Model
 * Manages user's YouTube channels with sync operations and metrics tracking
 * Provides channel management, statistics, and synchronization functionality
 */
class UserYoutubeChannels extends BaseModel {
  constructor() {
    super('user_youtube_channels', 'id');

    this.fillable = [
      'users_id', 'channel_id', 'channel_name', 'channel_handle', 'subscriber_count',
      'is_active', 'channel_data', 'last_sync', 'channel_description',
      'channel_thumbnail', 'is_primary', 'video_count', 'last_synced'
    ];

    this.hidden = [];

    this.casts = {
      'users_id': 'integer',
      'subscriber_count': 'integer',
      'video_count': 'integer',
      'is_active': 'boolean',
      'is_primary': 'boolean',
      'channel_data': 'json',
      'last_sync': 'date',
      'last_synced': 'date',
      'created_at': 'date',
      'updated_at': 'date'
    };
  }

  /**
   * Create a new user YouTube channel
   * @param {object} channelData - Channel data
   * @returns {Promise<object>} Created channel record
   */
  async createChannel(channelData) {
    try {
      // Set defaults for optional fields
      const data = {
        is_active: true,
        is_primary: false,
        subscriber_count: 0,
        video_count: 0,
        ...channelData
      };

      // Validate required fields
      this.validateChannelData(data);

      // If this is marked as primary, ensure no other primary exists for user
      if (data.is_primary && data.users_id) {
        await this.ensureSinglePrimary(data.users_id, null);
      }

      return await this.create(data);
    } catch (error) {
      logger.error('Error creating user YouTube channel:', error);
      throw error;
    }
  }

  /**
   * Update an existing user YouTube channel
   * @param {number} channelId - Channel ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated channel record
   */
  async updateChannel(channelId, updateData) {
    try {
      // If setting as primary, ensure no other primary exists for user
      if (updateData.is_primary === true) {
        const channel = await this.findById(channelId);
        if (channel && channel.users_id) {
          await this.ensureSinglePrimary(channel.users_id, channelId);
        }
      }

      // Update sync timestamps if data is being updated
      if (updateData.subscriber_count !== undefined || updateData.video_count !== undefined) {
        updateData.last_synced = new Date();
      }

      return await this.update(channelId, updateData);
    } catch (error) {
      logger.error(`Error updating user YouTube channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a user YouTube channel
   * @param {number} channelId - Channel ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteChannel(channelId) {
    try {
      return await this.delete(channelId);
    } catch (error) {
      logger.error(`Error deleting user YouTube channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's YouTube channels
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of user channels
   */
  async getUserChannels(userId, options = {}) {
    try {
      const conditions = { users_id: userId };

      if (options.activeOnly !== false) {
        conditions.is_active = true;
      }

      return await this.findAll(conditions, {
        orderBy: 'is_primary DESC, created_at DESC',
        ...options
      });
    } catch (error) {
      logger.error(`Error getting YouTube channels for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user's primary YouTube channel
   * @param {number} userId - User ID
   * @returns {Promise<object|null>} Primary channel or null
   */
  async getUserPrimaryChannel(userId) {
    try {
      const channels = await this.findAll({
        users_id: userId,
        is_primary: true,
        is_active: true
      });
      return channels.length > 0 ? channels[0] : null;
    } catch (error) {
      logger.error(`Error getting primary channel for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find channel by YouTube channel ID
   * @param {string} youtubeChannelId - YouTube channel ID
   * @returns {Promise<object|null>} Channel object or null
   */
  async findByChannelId(youtubeChannelId) {
    try {
      const channels = await this.findByField('channel_id', youtubeChannelId);
      return channels.length > 0 ? channels[0] : null;
    } catch (error) {
      logger.error(`Error finding channel by ID ${youtubeChannelId}:`, error);
      throw error;
    }
  }

  /**
   * Find channel by handle
   * @param {string} channelHandle - YouTube channel handle (e.g., @username)
   * @returns {Promise<object|null>} Channel object or null
   */
  async findByHandle(channelHandle) {
    try {
      const channels = await this.findByField('channel_handle', channelHandle);
      return channels.length > 0 ? channels[0] : null;
    } catch (error) {
      logger.error(`Error finding channel by handle ${channelHandle}:`, error);
      throw error;
    }
  }

  /**
   * Find user's channel by YouTube channel ID
   * @param {number} userId - User ID
   * @param {string} youtubeChannelId - YouTube channel ID
   * @returns {Promise<object|null>} Channel object or null
   */
  async findUserChannel(userId, youtubeChannelId) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE users_id = $1 AND channel_id = $2
        LIMIT 1
      `;

      const result = await database.query(query, [userId, youtubeChannelId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding user channel for user ${userId} and channel ${youtubeChannelId}:`, error);
      throw error;
    }
  }

  /**
   * Set channel as primary for user
   * @param {number} channelId - Channel ID
   * @returns {Promise<object>} Updated channel
   */
  async setPrimary(channelId) {
    try {
      const channel = await this.findById(channelId);
      if (!channel) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Ensure no other primary exists for this user
      await this.ensureSinglePrimary(channel.users_id, channelId);

      return await this.update(channelId, { is_primary: true });
    } catch (error) {
      logger.error(`Error setting channel ${channelId} as primary:`, error);
      throw error;
    }
  }

  /**
   * Sync channel data with YouTube API
   * @param {number} channelId - Channel ID
   * @param {object} syncData - Data from YouTube API
   * @returns {Promise<object>} Updated channel
   */
  async syncChannelData(channelId, syncData) {
    try {
      const updateData = {
        last_synced: new Date(),
        ...syncData
      };

      // Map YouTube API data to our fields
      if (syncData.statistics) {
        if (syncData.statistics.subscriberCount) {
          updateData.subscriber_count = parseInt(syncData.statistics.subscriberCount);
        }
        if (syncData.statistics.videoCount) {
          updateData.video_count = parseInt(syncData.statistics.videoCount);
        }
      }

      if (syncData.snippet) {
        if (syncData.snippet.title) {
          updateData.channel_name = syncData.snippet.title;
        }
        if (syncData.snippet.description) {
          updateData.channel_description = syncData.snippet.description;
        }
        if (syncData.snippet.thumbnails?.default?.url) {
          updateData.channel_thumbnail = syncData.snippet.thumbnails.default.url;
        }
      }

      // Store full API response in channel_data
      updateData.channel_data = syncData;

      return await this.update(channelId, updateData);
    } catch (error) {
      logger.error(`Error syncing channel data for ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Get channels that need syncing
   * @param {number} hoursOld - Sync channels older than this many hours
   * @returns {Promise<Array>} Array of channels needing sync
   */
  async getChannelsNeedingSync(hoursOld = 24) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE is_active = true 
        AND (
          last_synced IS NULL 
          OR last_synced < CURRENT_TIMESTAMP - INTERVAL '${hoursOld} hours'
        )
        ORDER BY last_synced ASC NULLS FIRST
      `;

      const result = await database.query(query);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error('Error getting channels needing sync:', error);
      throw error;
    }
  }

  /**
   * Deactivate channel
   * @param {number} channelId - Channel ID
   * @returns {Promise<object>} Updated channel
   */
  async deactivateChannel(channelId) {
    try {
      return await this.update(channelId, {
        is_active: false,
        is_primary: false
      });
    } catch (error) {
      logger.error(`Error deactivating channel ${channelId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate all channels for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of channels deactivated
   */
  async deactivateUserChannels(userId) {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_active = false, is_primary = false, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1 AND is_active = true
      `;

      const result = await database.query(query, [userId]);
      return result.rowCount || 0;
    } catch (error) {
      logger.error(`Error deactivating channels for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Search channels by name
   * @param {string} searchTerm - Search term
   * @param {object} options - Search options
   * @returns {Promise<Array>} Array of matching channels
   */
  async searchByName(searchTerm, options = {}) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE (
          channel_name ILIKE $1 
          OR channel_handle ILIKE $1
        )
        ${options.activeOnly !== false ? 'AND is_active = true' : ''}
        ${options.userId ? 'AND users_id = $2' : ''}
        ORDER BY 
          CASE WHEN channel_name ILIKE $1 THEN 1 ELSE 2 END,
          subscriber_count DESC, 
          created_at DESC
        ${options.limit ? `LIMIT ${parseInt(options.limit)}` : ''}
      `;

      const searchPattern = `%${searchTerm}%`;
      const params = options.userId ? [searchPattern, options.userId] : [searchPattern];

      const result = await database.query(query, params);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error searching channels by name "${searchTerm}":`, error);
      throw error;
    }
  }

  /**
   * Get channel statistics
   * @returns {Promise<object>} Statistics object
   */
  async getChannelStats() {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_channels,
          COUNT(*) FILTER (WHERE is_active = true) as active_channels,
          COUNT(DISTINCT users_id) as unique_users,
          COUNT(*) FILTER (WHERE is_primary = true) as primary_channels,
          COALESCE(SUM(subscriber_count), 0) as total_subscribers,
          COALESCE(SUM(video_count), 0) as total_videos,
          COALESCE(AVG(subscriber_count), 0) as avg_subscribers,
          COUNT(*) FILTER (WHERE last_synced > CURRENT_TIMESTAMP - INTERVAL '24 hours') as recently_synced
        FROM ${this.tableName}
      `;

      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting channel statistics:', error);
      throw error;
    }
  }

  /**
   * Get top channels by subscriber count
   * @param {number} limit - Number of top channels to return
   * @returns {Promise<Array>} Array of top channels
   */
  async getTopChannels(limit = 10) {
    try {
      return await this.findAll({ is_active: true }, {
        orderBy: 'subscriber_count DESC',
        limit: limit
      });
    } catch (error) {
      logger.error('Error getting top channels:', error);
      throw error;
    }
  }

  /**
   * Bulk sync channels
   * @param {Array} channelsData - Array of channel sync data
   * @returns {Promise<Array>} Array of sync results
   */
  async bulkSyncChannels(channelsData) {
    try {
      const results = [];

      for (const channelData of channelsData) {
        try {
          if (channelData.id && channelData.syncData) {
            const result = await this.syncChannelData(channelData.id, channelData.syncData);
            results.push({ success: true, channelId: channelData.id, result });
          }
        } catch (error) {
          results.push({
            success: false,
            channelId: channelData.id,
            error: error.message
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('Error in bulk sync channels:', error);
      throw error;
    }
  }

  /**
   * Ensure only one primary channel exists for a user
   * @param {number} userId - User ID
   * @param {number} excludeChannelId - Channel ID to exclude from update (the one being set as primary)
   * @returns {Promise<void>}
   */
  async ensureSinglePrimary(userId, excludeChannelId = null) {
    try {
      let query = `
        UPDATE ${this.tableName} 
        SET is_primary = false, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1 AND is_primary = true
      `;
      const params = [userId];

      if (excludeChannelId) {
        query += ' AND id != $2';
        params.push(excludeChannelId);
      }

      await database.query(query, params);
    } catch (error) {
      logger.error(`Error ensuring single primary for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Validate channel data
   * @param {object} channelData - Data to validate
   * @param {boolean} isCreate - Whether this is for creation (requires all fields)
   * @throws {Error} Validation error
   */
  validateChannelData(channelData, isCreate = true) {
    if (isCreate) {
      // Check required fields for creation
      if (!channelData.users_id) {
        throw new Error('users_id is required');
      }

      if (!channelData.channel_id && !channelData.channel_name) {
        throw new Error('Either channel_id or channel_name is required');
      }
    }

    // Validate user ID
    if (channelData.users_id !== undefined) {
      const userId = parseInt(channelData.users_id);
      if (isNaN(userId) || userId <= 0) {
        throw new Error('users_id must be a positive integer');
      }
    }

    // Validate counts
    if (channelData.subscriber_count !== undefined) {
      const count = parseInt(channelData.subscriber_count);
      if (isNaN(count) || count < 0) {
        throw new Error('subscriber_count must be a non-negative integer');
      }
    }

    if (channelData.video_count !== undefined) {
      const count = parseInt(channelData.video_count);
      if (isNaN(count) || count < 0) {
        throw new Error('video_count must be a non-negative integer');
      }
    }

    // Validate channel handle format
    if (channelData.channel_handle && !channelData.channel_handle.startsWith('@')) {
      throw new Error('channel_handle must start with @');
    }

    // Validate dates
    const dateFields = ['last_sync', 'last_synced'];
    for (const field of dateFields) {
      if (channelData[field] !== undefined && channelData[field] !== null) {
        const date = new Date(channelData[field]);
        if (isNaN(date.getTime())) {
          throw new Error(`${field} must be a valid date`);
        }
      }
    }
  }
}

module.exports = UserYoutubeChannels;
