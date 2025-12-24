const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * Cloud Storage Credentials Model
 * Manages OAuth credentials for cloud storage providers (Google Drive, OneDrive, Dropbox)
 * Provides secure token storage with encryption support
 */
class CloudStorageCredentials extends BaseModel {
  constructor() {
    super('cloud_storage_credentials', 'id');

    this.fillable = [
      'users_id', 'provider', 'encrypted_tokens', 'encryption_iv', 'encryption_algorithm',
      'token_expires_at', 'last_refreshed', 'account_email', 'account_name', 'account_id',
      'root_folder_id', 'root_folder_path', 'folder_naming_pattern',
      'is_active', 'last_used', 'last_error', 'error_count'
    ];

    // Hide sensitive token fields for security
    this.hidden = [
      'encrypted_tokens', 'encryption_iv'
    ];

    this.casts = {
      'users_id': 'integer',
      'is_active': 'boolean',
      'error_count': 'integer',
      'token_expires_at': 'date',
      'last_refreshed': 'date',
      'last_used': 'date',
      'created_at': 'date',
      'updated_at': 'date'
    };

    // Valid cloud storage providers
    this.validProviders = ['google_drive', 'onedrive', 'dropbox'];
  }

  /**
   * Create or update cloud storage credentials (upsert)
   * If credentials exist for the user/provider, updates them; otherwise creates new
   * @param {object} credentialData - Credential data including encrypted tokens
   * @returns {Promise<object>} Created or updated credential record
   */
  async createCredentials(credentialData) {
    try {
      // Set defaults
      const data = {
        is_active: true,
        encryption_algorithm: 'aes-256-cbc',
        error_count: 0,
        ...credentialData
      };

      // Validate required fields and provider
      this.validateCredentialData(data);

      // Use upsert pattern to handle reconnection after disconnect
      const query = `
        INSERT INTO ${this.tableName} (
          users_id, provider, encrypted_tokens, encryption_iv, encryption_algorithm,
          token_expires_at, account_email, account_name, account_id, is_active, error_count
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (users_id, provider)
        DO UPDATE SET
          encrypted_tokens = EXCLUDED.encrypted_tokens,
          encryption_iv = EXCLUDED.encryption_iv,
          encryption_algorithm = EXCLUDED.encryption_algorithm,
          token_expires_at = EXCLUDED.token_expires_at,
          account_email = EXCLUDED.account_email,
          account_name = EXCLUDED.account_name,
          account_id = EXCLUDED.account_id,
          is_active = true,
          error_count = 0,
          last_error = NULL,
          last_refreshed = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const params = [
        data.users_id,
        data.provider,
        data.encrypted_tokens,
        data.encryption_iv,
        data.encryption_algorithm,
        data.token_expires_at || null,
        data.account_email || null,
        data.account_name || null,
        data.account_id || null,
        data.is_active,
        data.error_count
      ];

      const result = await database.query(query, params);
      return result.rows.length > 0 ? this.formatOutput(result.rows[0]) : null;
    } catch (error) {
      logger.error('Error creating cloud storage credentials:', error);
      throw error;
    }
  }

  /**
   * Update cloud storage credentials
   * @param {number} credentialId - Credential ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated credential record
   */
  async updateCredentials(credentialId, updateData) {
    try {
      // Update last_refreshed if tokens are being updated
      if (updateData.encrypted_tokens) {
        updateData.last_refreshed = new Date();
        updateData.error_count = 0; // Reset error count on successful token update
        updateData.last_error = null;
      }

      return await this.update(credentialId, updateData);
    } catch (error) {
      logger.error(`Error updating cloud storage credentials ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Get credential by ID with sensitive data (for internal use)
   * @param {number} credentialId - Credential ID
   * @param {boolean} includeSensitive - Whether to include encrypted tokens
   * @returns {Promise<object|null>} Credential object or null
   */
  async getCredential(credentialId, includeSensitive = false) {
    try {
      if (includeSensitive) {
        const query = `SELECT * FROM ${this.tableName} WHERE id = $1`;
        const result = await database.query(query, [credentialId]);
        return result.rows.length > 0 ? result.rows[0] : null;
      } else {
        return await this.findById(credentialId);
      }
    } catch (error) {
      logger.error(`Error getting cloud storage credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Find active credentials for a user
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of user credentials
   */
  async getUserCredentials(userId, options = {}) {
    try {
      const conditions = { users_id: userId };

      if (options.activeOnly !== false) {
        conditions.is_active = true;
      }

      if (options.provider) {
        conditions.provider = options.provider;
      }

      return await this.findAll(conditions, {
        orderBy: 'last_used DESC NULLS LAST',
        ...options
      });
    } catch (error) {
      logger.error(`Error getting cloud storage credentials for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Find credential for user and provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name (google_drive, onedrive, dropbox)
   * @param {boolean} includeSensitive - Whether to include encrypted tokens
   * @returns {Promise<object|null>} Credential object or null
   */
  async getUserProviderCredential(userId, provider, includeSensitive = false) {
    try {
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE users_id = $1 AND provider = $2 AND is_active = true
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await database.query(query, [userId, provider]);

      if (result.rows.length === 0) {
        return null;
      }

      return includeSensitive ? result.rows[0] : this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding credential for user ${userId} and provider ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Get credentials with sensitive data (for token operations)
   * @param {number} userId - User ID
   * @param {string} provider - Optional provider filter
   * @returns {Promise<Array>} Array of credentials with sensitive data
   */
  async getUserCredentialsWithSecrets(userId, provider = null) {
    try {
      let query = `
        SELECT * FROM ${this.tableName}
        WHERE users_id = $1 AND is_active = true
      `;
      const params = [userId];

      if (provider) {
        query += ` AND provider = $2`;
        params.push(provider);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await database.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting credentials with secrets for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user has valid credential for provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} True if user has valid credential
   */
  async hasValidCredential(userId, provider) {
    try {
      const query = `
        SELECT COUNT(*) as count FROM ${this.tableName}
        WHERE users_id = $1
        AND provider = $2
        AND is_active = true
        AND (token_expires_at IS NULL OR token_expires_at > CURRENT_TIMESTAMP)
      `;

      const result = await database.query(query, [userId, provider]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error(`Error checking valid credential for user ${userId}, provider ${provider}:`, error);
      return false;
    }
  }

  /**
   * Get credentials that need token refresh
   * @param {number} bufferMinutes - Minutes before expiry to consider for refresh
   * @returns {Promise<Array>} Array of credentials needing refresh
   */
  async getCredentialsNeedingRefresh(bufferMinutes = 10) {
    try {
      const query = `
        SELECT * FROM ${this.tableName}
        WHERE is_active = true
        AND encrypted_tokens IS NOT NULL
        AND (
          token_expires_at IS NULL
          OR token_expires_at <= CURRENT_TIMESTAMP + INTERVAL '${bufferMinutes} minutes'
        )
        ORDER BY token_expires_at ASC
      `;

      const result = await database.query(query);
      return result.rows;
    } catch (error) {
      logger.error('Error getting credentials needing refresh:', error);
      throw error;
    }
  }

  /**
   * Mark credential as used
   * @param {number} credentialId - Credential ID
   * @returns {Promise<object>} Updated credential
   */
  async markAsUsed(credentialId) {
    try {
      return await this.update(credentialId, {
        last_used: new Date()
      });
    } catch (error) {
      logger.error(`Error marking credential ${credentialId} as used:`, error);
      throw error;
    }
  }

  /**
   * Record an error for credential
   * @param {number} credentialId - Credential ID
   * @param {string} errorMessage - Error message
   * @returns {Promise<object>} Updated credential
   */
  async recordError(credentialId, errorMessage) {
    try {
      const query = `
        UPDATE ${this.tableName}
        SET last_error = $1,
            error_count = error_count + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;

      const result = await database.query(query, [errorMessage, credentialId]);
      return result.rows.length > 0 ? this.formatOutput(result.rows[0]) : null;
    } catch (error) {
      logger.error(`Error recording error for credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate credential
   * @param {number} credentialId - Credential ID
   * @returns {Promise<object>} Updated credential
   */
  async deactivateCredential(credentialId) {
    try {
      return await this.update(credentialId, {
        is_active: false
      });
    } catch (error) {
      logger.error(`Error deactivating credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate all credentials for a user and provider
   * @param {number} userId - User ID
   * @param {string} provider - Optional provider filter
   * @returns {Promise<number>} Number of credentials deactivated
   */
  async deactivateUserCredentials(userId, provider = null) {
    try {
      let query = `
        UPDATE ${this.tableName}
        SET is_active = false, updated_at = CURRENT_TIMESTAMP
        WHERE users_id = $1 AND is_active = true
      `;
      const params = [userId];

      if (provider) {
        query += ` AND provider = $2`;
        params.push(provider);
      }

      const result = await database.query(query, params);
      return result.rowCount || 0;
    } catch (error) {
      logger.error(`Error deactivating credentials for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update folder configuration
   * @param {number} credentialId - Credential ID
   * @param {object} folderConfig - Folder configuration
   * @returns {Promise<object>} Updated credential
   */
  async updateFolderConfig(credentialId, folderConfig) {
    try {
      const updateData = {};

      if (folderConfig.rootFolderId !== undefined) {
        updateData.root_folder_id = folderConfig.rootFolderId;
      }
      if (folderConfig.rootFolderPath !== undefined) {
        updateData.root_folder_path = folderConfig.rootFolderPath;
      }
      if (folderConfig.folderNamingPattern !== undefined) {
        updateData.folder_naming_pattern = folderConfig.folderNamingPattern;
      }

      return await this.update(credentialId, updateData);
    } catch (error) {
      logger.error(`Error updating folder config for credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Update account information
   * @param {number} credentialId - Credential ID
   * @param {object} accountInfo - Account information
   * @returns {Promise<object>} Updated credential
   */
  async updateAccountInfo(credentialId, accountInfo) {
    try {
      const updateData = {};

      if (accountInfo.email) updateData.account_email = accountInfo.email;
      if (accountInfo.name) updateData.account_name = accountInfo.name;
      if (accountInfo.id) updateData.account_id = accountInfo.id;

      return await this.update(credentialId, updateData);
    } catch (error) {
      logger.error(`Error updating account info for credential ${credentialId}:`, error);
      throw error;
    }
  }

  /**
   * Get credential statistics
   * @returns {Promise<object>} Statistics object
   */
  async getCredentialStats() {
    try {
      const query = `
        SELECT
          COUNT(*) as total_credentials,
          COUNT(*) FILTER (WHERE is_active = true) as active_credentials,
          COUNT(DISTINCT users_id) as unique_users,
          COUNT(*) FILTER (WHERE provider = 'google_drive') as google_drive_count,
          COUNT(*) FILTER (WHERE provider = 'onedrive') as onedrive_count,
          COUNT(*) FILTER (WHERE provider = 'dropbox') as dropbox_count,
          COUNT(*) FILTER (WHERE token_expires_at > CURRENT_TIMESTAMP) as valid_tokens,
          COUNT(*) FILTER (WHERE error_count > 0) as with_errors
        FROM ${this.tableName}
      `;

      const result = await database.query(query);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting credential statistics:', error);
      throw error;
    }
  }

  /**
   * Clean up expired/inactive credentials
   * @param {number} daysOld - Delete credentials older than this many days
   * @returns {Promise<number>} Number of credentials deleted
   */
  async cleanupOldCredentials(daysOld = 90) {
    try {
      const query = `
        DELETE FROM ${this.tableName}
        WHERE is_active = false
        AND updated_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
      `;

      const result = await database.query(query);
      const deletedCount = result.rowCount || 0;

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old cloud storage credentials`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('Error cleaning up old credentials:', error);
      throw error;
    }
  }

  /**
   * Validate credential data
   * @param {object} data - Data to validate
   * @throws {Error} Validation error
   */
  validateCredentialData(data) {
    // Check required fields
    if (!data.users_id) {
      throw new Error('users_id is required');
    }

    if (!data.provider) {
      throw new Error('provider is required');
    }

    // Validate provider
    if (!this.validProviders.includes(data.provider)) {
      throw new Error(`Invalid provider. Must be one of: ${this.validProviders.join(', ')}`);
    }

    // Require encrypted tokens
    if (!data.encrypted_tokens) {
      throw new Error('encrypted_tokens is required');
    }

    if (!data.encryption_iv) {
      throw new Error('encryption_iv is required');
    }

    // Validate user ID
    const userId = parseInt(data.users_id);
    if (isNaN(userId) || userId <= 0) {
      throw new Error('users_id must be a positive integer');
    }

    // Validate encryption algorithm
    if (data.encryption_algorithm && !['aes-256-cbc', 'aes-256-gcm'].includes(data.encryption_algorithm)) {
      throw new Error('encryption_algorithm must be aes-256-cbc or aes-256-gcm');
    }
  }
}

module.exports = new CloudStorageCredentials();
