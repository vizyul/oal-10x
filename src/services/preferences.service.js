const { v4: uuidv4 } = require('uuid');
const database = require('./database.service');
const { logger } = require('../utils');

class PreferencesService {
  constructor() {
    this.tableName = 'user_preferences'; // PostgreSQL table name
  }

  /**
   * Get user preferences by user email
   * @param {string} userEmail - User's email address
   * @returns {Promise<Object|null>} User preferences or null if not found
   */
  async getUserPreferences(userEmail) {
    try {
      if (!database.pool) {
        throw new Error('PostgreSQL not configured');
      }

      // First find the user to get their ID
      const authService = require('./auth.service');
      const user = await authService.findUserByEmail(userEmail);
      
      if (!user) {
        return null;
      }

      // Find preferences by users_id foreign key
      const records = await database.findByField(
        this.tableName,
        'users_id',
        user.id
      );
        
      if (records.length === 0) {
        return null;
      }

      const record = records[0];
      
      // Handle both database service formatted records and direct PostgreSQL rows
      const fields = record.fields || record;
      
      return {
        id: record.id || fields.id,
        preferenceKey: fields.preference_key,
        userId: fields.users_id,
        userEmail: userEmail,
        themeMode: fields.theme_mode || 'light',
        emailNotifications: fields.email_notifications || false,
        marketingCommunications: fields.marketing_communications || false,
        weeklyDigest: fields.weekly_digest || false,
        aiProvider: fields.llm || 'gemini',
        createdAt: fields.created_at,
        updatedAt: fields.updated_at
      };
    } catch (error) {
      logger.error('Error getting user preferences:', error);
      throw error;
    }
  }

  /**
   * Create default preferences for a new user
   * @param {string} userEmail - User's email address
   * @returns {Promise<Object>} Created preferences
   */
  async createDefaultPreferences(userEmail) {
    try {
      if (!database.pool) {
        throw new Error('PostgreSQL not configured');
      }

      // Add stack trace to see WHERE this is being called from
      const stack = new Error().stack;
      logger.warn(`🚨 CREATING DEFAULT PREFERENCES for user: ${userEmail}`);
      logger.warn('🚨 Call stack:', stack);

      // First find the user to get their ID
      const authService = require('./auth.service');
      const user = await authService.findUserByEmail(userEmail);
      
      if (!user) {
        logger.error(`User not found when creating preferences: ${userEmail}`);
        throw new Error(`User not found: ${userEmail}`);
      }
      
      logger.info(`Found user for preferences: ${user.id}`);

      const preferenceKey = uuidv4();
      const now = new Date().toISOString();

      logger.info(`Creating default preferences for user: ${userEmail}`);

      const fields = {
        preference_key: preferenceKey,
        users_id: user.id, // Foreign key to users table
        theme_mode: 'light',
        email_notifications: true,
        marketing_communications: false,
        weekly_digest: true,
        llm: 'gemini', // Default LLM provider
        created_at: now,
        updated_at: now
      };

      logger.info('Attempting to create preferences record with fields:', fields);
      
      const record = await database.create(this.tableName, fields);
      
      logger.info('Successfully created preferences record:', record.id);

      if (!record) {
        throw new Error('Failed to create user preferences');
      }

      logger.info(`Created preferences for user ${userEmail} with key: ${preferenceKey}`);

      // Handle both database service formatted records and direct PostgreSQL rows
      const recordFields = record.fields || record;

      return {
        id: record.id || recordFields.id,
        preferenceKey: recordFields.preference_key,
        userId: recordFields.users_id,
        userEmail: userEmail,
        themeMode: recordFields.theme_mode,
        emailNotifications: recordFields.email_notifications,
        marketingCommunications: recordFields.marketing_communications,
        weeklyDigest: recordFields.weekly_digest,
        aiProvider: recordFields.ai_provider || 'gemini',
        createdAt: recordFields.created_at,
        updatedAt: recordFields.updated_at
      };
    } catch (error) {
      logger.error('Error creating default preferences:', error);
      throw error;
    }
  }

  /**
   * Create preferences with specific updates applied
   * @param {string} userEmail - User's email address 
   * @param {Object} updates - Updates to apply to defaults
   * @returns {Promise<Object>} Created preferences
   */
  async createPreferencesWithUpdates(userEmail, updates) {
    try {
      if (!database.pool) {
        throw new Error('PostgreSQL not configured');
      }

      logger.info(`Creating preferences with updates for user: ${userEmail}`, updates);

      // First find the user to get their ID
      const authService = require('./auth.service');
      const user = await authService.findUserByEmail(userEmail);
      
      if (!user) {
        logger.error(`User not found when creating preferences: ${userEmail}`);
        throw new Error(`User not found: ${userEmail}`);
      }

      const preferenceKey = uuidv4();
      const now = new Date().toISOString();

      // Start with default values
      const fields = {
        preference_key: preferenceKey,
        users_id: user.id,
        theme_mode: 'light',
        email_notifications: true,
        marketing_communications: false,
        weekly_digest: true,
        llm: 'gemini',
        created_at: now,
        updated_at: now
      };

      // Apply updates to defaults
      if (updates.themeMode !== undefined) {
        fields.theme_mode = updates.themeMode;
      }
      if (updates.emailNotifications !== undefined) {
        fields.email_notifications = updates.emailNotifications;
      }
      if (updates.marketingCommunications !== undefined) {
        fields.marketing_communications = updates.marketingCommunications;
      }
      if (updates.weeklyDigest !== undefined) {
        fields.weekly_digest = updates.weeklyDigest;
      }
      if (updates.aiProvider !== undefined) {
        fields.llm = updates.aiProvider;
      }

      logger.info('Creating preferences record with fields:', fields);
      
      const record = await database.create(this.tableName, fields);
      
      if (!record) {
        throw new Error('Failed to create user preferences');
      }

      logger.info(`Created preferences for user ${userEmail} with key: ${preferenceKey}`);

      // Handle both database service formatted records and direct PostgreSQL rows
      const recordFields = record.fields || record;

      return {
        id: record.id || recordFields.id,
        preferenceKey: recordFields.preference_key,
        userId: recordFields.users_id,
        userEmail: userEmail,
        themeMode: recordFields.theme_mode,
        emailNotifications: recordFields.email_notifications,
        marketingCommunications: recordFields.marketing_communications,
        weeklyDigest: recordFields.weekly_digest,
        aiProvider: recordFields.ai_provider || 'gemini',
        createdAt: recordFields.created_at,
        updatedAt: recordFields.updated_at
      };
    } catch (error) {
      logger.error('Error creating preferences with updates:', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   * @param {string} userEmail - User's email address
   * @param {Object} updates - Preference updates
   * @returns {Promise<Object>} Updated preferences
   */
  async updateUserPreferences(userEmail, updates) {
    try {
      if (!database.pool) {
        throw new Error('PostgreSQL not configured');
      }

      // Update preferences for user

      // First, get the existing record
      const existingPrefs = await this.getUserPreferences(userEmail);
      
      if (!existingPrefs) {
        // Create preferences with the updates applied directly
        logger.info(`No existing preferences found for ${userEmail}, creating with updates`);
        return await this.createPreferencesWithUpdates(userEmail, updates);
      }

      const fields = {
        updated_at: new Date().toISOString()
      };

      // Map update fields to PostgreSQL column names
      if (updates.themeMode !== undefined) {
        fields.theme_mode = updates.themeMode;
      }
      if (updates.emailNotifications !== undefined) {
        fields.email_notifications = updates.emailNotifications;
      }
      if (updates.marketingCommunications !== undefined) {
        fields.marketing_communications = updates.marketingCommunications;
      }
      if (updates.weeklyDigest !== undefined) {
        fields.weekly_digest = updates.weeklyDigest;
      }
      if (updates.aiProvider !== undefined) {
        fields.llm = updates.aiProvider;
      }

      const record = await database.update(this.tableName, existingPrefs.id, fields);

      if (!record) {
        throw new Error('Failed to update preferences');
      }

      // Preferences updated successfully

      // Handle both database service formatted records and direct PostgreSQL rows
      const recordFields = record.fields || record;

      return {
        id: record.id || recordFields.id,
        preferenceKey: recordFields.preference_key,
        userId: recordFields.users_id,
        userEmail: userEmail,
        themeMode: recordFields.theme_mode,
        emailNotifications: recordFields.email_notifications,
        marketingCommunications: recordFields.marketing_communications,
        weeklyDigest: recordFields.weekly_digest,
        aiProvider: recordFields.ai_provider || 'gemini',
        createdAt: recordFields.created_at,
        updatedAt: recordFields.updated_at
      };
    } catch (error) {
      logger.error('Error updating user preferences:', error);
      throw error;
    }
  }

  /**
   * Get or create user preferences (ensures user always has preferences)
   * @param {string} userEmail - User's email address
   * @returns {Promise<Object>} User preferences
   */
  async getOrCreateUserPreferences(userEmail) {
    try {
      let preferences = await this.getUserPreferences(userEmail);
      
      if (!preferences) {
        logger.info(`No preferences found, creating defaults for: ${userEmail}`);
        preferences = await this.createDefaultPreferences(userEmail);
      }
      
      return preferences;
    } catch (error) {
      logger.error('Error getting or creating user preferences:', error);
      throw error;
    }
  }
}

module.exports = PreferencesService;