const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');
const crypto = require('crypto');

/**
 * ApiKeys Model
 * Manages API key generation, validation, and usage tracking
 */
class ApiKeys extends BaseModel {
  constructor() {
    super('api_keys', 'id');

    this.fillable = [
      'users_id', 'key_id', 'api_key', 'name', 'description', 'permissions',
      'rate_limit', 'rate_limit_window', 'is_active', 'expires_at',
      'last_used', 'usage_count'
    ];

    this.hidden = [
      'api_key' // Never expose the actual API key in JSON output
    ];

    this.casts = {
      'is_active': 'boolean',
      'permissions': 'array',
      'rate_limit': 'integer',
      'usage_count': 'integer',
      'expires_at': 'date',
      'last_used': 'date',
      'created_at': 'date',
      'updated_at': 'date'
    };
  }

  /**
   * Generate a unique API key
   * @param {string} prefix - Optional prefix (default: 'oal')
   * @returns {object} Key object with key_id and api_key
   */
  generateApiKey(prefix = 'oal') {
    const keyId = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const keySecret = crypto.randomBytes(32).toString('hex');

    return {
      key_id: keyId,
      api_key: `${prefix}_${keyId}_${keySecret}`
    };
  }

  /**
   * Create a new API key for a user
   * @param {number} userId - User ID
   * @param {object} keyData - API key data
   * @returns {Promise<object>} Created API key
   */
  async createApiKey(userId, keyData = {}) {
    try {
      // Generate key if not provided
      const generatedKey = this.generateApiKey();

      const apiKeyData = {
        users_id: userId,
        key_id: generatedKey.key_id,
        api_key: generatedKey.api_key,
        name: keyData.name || 'Default API Key',
        description: keyData.description || null,
        permissions: keyData.permissions || ['read'],
        rate_limit: keyData.rate_limit || 1000,
        rate_limit_window: keyData.rate_limit_window || 'hour',
        is_active: true,
        expires_at: keyData.expires_at || null,
        usage_count: 0
      };

      const apiKey = await this.create(apiKeyData);
      logger.info(`API key created for user ${userId}: ${apiKey.key_id}`);

      // Return with the actual API key for one-time display
      return {
        ...apiKey,
        api_key: generatedKey.api_key // Include for initial response only
      };
    } catch (error) {
      logger.error('Error creating API key:', error);
      throw error;
    }
  }

  /**
   * Find API key by key_id (safe lookup without exposing full key)
   * @param {string} keyId - Key ID
   * @returns {Promise<object|null>} API key or null
   */
  async findByKeyId(keyId) {
    try {
      const keys = await this.findByField('key_id', keyId);
      return keys.length > 0 ? keys[0] : null;
    } catch (error) {
      logger.error(`Error finding API key by ID ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Validate an API key and return associated data
   * @param {string} apiKey - Full API key string
   * @returns {Promise<object|null>} API key data or null if invalid
   */
  async validateApiKey(apiKey) {
    try {
      // Extract key_id from API key format: prefix_keyid_secret
      const keyParts = apiKey.split('_');
      if (keyParts.length !== 3) {
        return null;
      }

      const keyId = keyParts[1];
      const keyRecord = await this.findByKeyId(keyId);

      if (!keyRecord || !keyRecord.is_active) {
        return null;
      }

      // Check if key is expired
      if (keyRecord.expires_at && new Date() > new Date(keyRecord.expires_at)) {
        logger.warn(`Expired API key used: ${keyId}`);
        return null;
      }

      // Validate the full API key matches
      if (keyRecord.api_key !== apiKey) {
        logger.warn(`Invalid API key attempted: ${keyId}`);
        return null;
      }

      // Update usage tracking
      await this.recordUsage(keyRecord.id);

      // Return key data without the actual API key
      const { api_key: _, ...safeKeyData } = keyRecord;
      return safeKeyData;
    } catch (error) {
      logger.error('Error validating API key:', error);
      return null;
    }
  }

  /**
   * Record API key usage
   * @param {number} keyId - API key ID
   * @returns {Promise<void>}
   */
  async recordUsage(keyId) {
    try {
      const updateData = {
        last_used: new Date(),
        updated_at: new Date()
      };

      // Increment usage count using raw SQL for atomic operation
      const query = `
        UPDATE ${this.tableName} 
        SET usage_count = COALESCE(usage_count, 0) + 1,
            last_used = $2,
            updated_at = $3
        WHERE id = $1
      `;

      await database.query(query, [keyId, updateData.last_used, updateData.updated_at]);
    } catch (error) {
      logger.error(`Error recording API key usage ${keyId}:`, error);
      // Don't throw - usage tracking shouldn't break API functionality
    }
  }

  /**
   * Get all API keys for a user (without exposing actual keys)
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} User's API keys
   */
  async getUserApiKeys(userId, options = {}) {
    try {
      return await this.findAll({ users_id: userId }, {
        orderBy: 'created_at DESC',
        ...options
      });
    } catch (error) {
      logger.error(`Error getting API keys for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get active API keys for a user
   * @param {number} userId - User ID
   * @returns {Promise<Array>} Active API keys
   */
  async getActiveUserApiKeys(userId) {
    try {
      const conditions = {
        users_id: userId,
        is_active: true
      };

      // Also check for non-expired keys
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE users_id = $1 
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        ORDER BY created_at DESC
      `;

      const result = await database.query(query, [userId]);
      return result.rows.map(row => this.formatOutput(row));
    } catch (error) {
      logger.error(`Error getting active API keys for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Revoke an API key
   * @param {number} keyId - API key ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<object>} Updated API key
   */
  async revokeApiKey(keyId, userId) {
    try {
      // Verify ownership
      const keyRecord = await this.findById(keyId);
      if (!keyRecord || keyRecord.users_id !== userId) {
        throw new Error('API key not found or access denied');
      }

      const updatedKey = await this.update(keyId, {
        is_active: false,
        updated_at: new Date()
      });

      logger.info(`API key revoked: ${keyRecord.key_id} by user ${userId}`);
      return updatedKey;
    } catch (error) {
      logger.error(`Error revoking API key ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Update API key permissions
   * @param {number} keyId - API key ID
   * @param {number} userId - User ID (for authorization)
   * @param {Array} permissions - New permissions array
   * @returns {Promise<object>} Updated API key
   */
  async updatePermissions(keyId, userId, permissions) {
    try {
      // Verify ownership
      const keyRecord = await this.findById(keyId);
      if (!keyRecord || keyRecord.users_id !== userId) {
        throw new Error('API key not found or access denied');
      }

      const updatedKey = await this.update(keyId, {
        permissions: permissions,
        updated_at: new Date()
      });

      logger.info(`API key permissions updated: ${keyRecord.key_id}`);
      return updatedKey;
    } catch (error) {
      logger.error(`Error updating API key permissions ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Get API key usage statistics
   * @param {number} keyId - API key ID
   * @param {number} userId - User ID (for authorization)
   * @returns {Promise<object>} Usage statistics
   */
  async getUsageStats(keyId, userId) {
    try {
      const keyRecord = await this.findById(keyId);
      if (!keyRecord || keyRecord.users_id !== userId) {
        throw new Error('API key not found or access denied');
      }

      const daysSinceCreated = keyRecord.created_at ?
        Math.ceil((new Date() - new Date(keyRecord.created_at)) / (1000 * 60 * 60 * 24)) : 0;

      const daysSinceLastUsed = keyRecord.last_used ?
        Math.ceil((new Date() - new Date(keyRecord.last_used)) / (1000 * 60 * 60 * 24)) : null;

      return {
        key_id: keyRecord.key_id,
        usage_count: keyRecord.usage_count || 0,
        days_since_created: daysSinceCreated,
        days_since_last_used: daysSinceLastUsed,
        is_active: keyRecord.is_active,
        permissions: keyRecord.permissions || [],
        rate_limit: keyRecord.rate_limit,
        expires_at: keyRecord.expires_at
      };
    } catch (error) {
      logger.error(`Error getting usage stats for API key ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Check if API key has specific permission
   * @param {object} keyData - API key data from validation
   * @param {string} permission - Permission to check
   * @returns {boolean} Whether key has permission
   */
  hasPermission(keyData, permission) {
    if (!keyData || !keyData.permissions) {
      return false;
    }

    // Check for wildcard or specific permission
    return keyData.permissions.includes('*') || keyData.permissions.includes(permission);
  }

  /**
   * Cleanup expired API keys
   * @returns {Promise<number>} Number of keys cleaned up
   */
  async cleanupExpiredKeys() {
    try {
      const query = `
        UPDATE ${this.tableName} 
        SET is_active = false,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true 
        AND expires_at IS NOT NULL 
        AND expires_at < CURRENT_TIMESTAMP
        RETURNING id
      `;

      const result = await database.query(query);
      const cleanedCount = result.rows.length;

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired API keys`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired API keys:', error);
      throw error;
    }
  }
}

module.exports = ApiKeys;
