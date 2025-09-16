const BaseModel = require('./BaseModel');
const { logger } = require('../utils');

/**
 * UserPreferences Model
 * Manages user preferences and settings
 */
class UserPreferences extends BaseModel {
  constructor() {
    super('user_preferences', 'id');

    this.fillable = [
      'users_id', 'theme', 'language', 'timezone', 'email_notifications',
      'push_notifications', 'marketing_emails', 'privacy_level', 'preferences_data',
      'airtable_id', 'marketing_communications', 'is_active', 'preference_value',
      'weekly_digest', 'llm'
    ];

    this.hidden = [
      // No sensitive data to hide in preferences
    ];

    this.casts = {
      'email_notifications': 'boolean',
      'push_notifications': 'boolean',
      'marketing_emails': 'boolean',
      'marketing_communications': 'boolean',
      'is_active': 'boolean',
      'weekly_digest': 'boolean',
      'preferences_data': 'json',
      'created_at': 'date',
      'updated_at': 'date'
    };

    // Default preferences for new users
    this.defaultPreferences = {
      theme: 'light',
      language: 'en',
      timezone: 'UTC',
      email_notifications: true,
      push_notifications: true,
      marketing_emails: false,
      marketing_communications: false,
      privacy_level: 'normal',
      weekly_digest: true,
      llm: 'gemini',
      is_active: true
    };
  }

  /**
   * Get user preferences by user ID
   * @param {number} userId - User ID
   * @returns {Promise<object|null>} User preferences or null
   */
  async getByUserId(userId) {
    try {
      const preferences = await this.findByField('users_id', userId);
      return preferences.length > 0 ? preferences[0] : null;
    } catch (error) {
      logger.error(`Error getting preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user preferences with defaults if none exist
   * @param {number} userId - User ID
   * @returns {Promise<object>} User preferences with defaults applied
   */
  async getWithDefaults(userId) {
    try {
      const preferences = await this.getByUserId(userId);

      if (!preferences) {
        // Return defaults if no preferences exist
        return {
          users_id: userId,
          ...this.defaultPreferences
        };
      }

      // Merge with defaults for any missing fields
      return {
        ...this.defaultPreferences,
        ...preferences
      };
    } catch (error) {
      logger.error(`Error getting preferences with defaults for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create or update user preferences
   * @param {number} userId - User ID
   * @param {object} preferencesData - Preferences data
   * @returns {Promise<object>} Created or updated preferences
   */
  async setUserPreferences(userId, preferencesData) {
    try {
      const existingPreferences = await this.getByUserId(userId);

      if (existingPreferences) {
        // Update existing preferences
        const updatedPreferences = await this.update(existingPreferences.id, {
          ...preferencesData,
          updated_at: new Date()
        });

        logger.info(`Updated preferences for user ${userId}`);
        return updatedPreferences;
      } else {
        // Create new preferences with defaults
        const newPreferences = await this.create({
          users_id: userId,
          ...this.defaultPreferences,
          ...preferencesData
        });

        logger.info(`Created preferences for user ${userId}`);
        return newPreferences;
      }
    } catch (error) {
      logger.error(`Error setting preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update specific preference field
   * @param {number} userId - User ID
   * @param {string} field - Preference field name
   * @param {*} value - New value
   * @returns {Promise<object>} Updated preferences
   */
  async updatePreference(userId, field, value) {
    try {
      if (!this.fillable.includes(field)) {
        throw new Error(`Invalid preference field: ${field}`);
      }

      const preferences = await this.getByUserId(userId);

      if (!preferences) {
        // Create preferences if they don't exist
        return await this.setUserPreferences(userId, { [field]: value });
      }

      // Update specific field
      const updated = await this.update(preferences.id, {
        [field]: value,
        updated_at: new Date()
      });

      logger.info(`Updated ${field} preference for user ${userId}`);
      return updated;
    } catch (error) {
      logger.error(`Error updating ${field} preference for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get notification preferences for a user
   * @param {number} userId - User ID
   * @returns {Promise<object>} Notification preferences
   */
  async getNotificationPreferences(userId) {
    try {
      const preferences = await this.getWithDefaults(userId);

      return {
        email_notifications: preferences.email_notifications,
        push_notifications: preferences.push_notifications,
        marketing_emails: preferences.marketing_emails,
        marketing_communications: preferences.marketing_communications,
        weekly_digest: preferences.weekly_digest
      };
    } catch (error) {
      logger.error(`Error getting notification preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update notification preferences
   * @param {number} userId - User ID
   * @param {object} notificationPrefs - Notification preferences
   * @returns {Promise<object>} Updated preferences
   */
  async updateNotificationPreferences(userId, notificationPrefs) {
    try {
      const allowedFields = [
        'email_notifications', 'push_notifications', 'marketing_emails',
        'marketing_communications', 'weekly_digest'
      ];

      // Filter to only allowed notification fields
      const filteredPrefs = Object.keys(notificationPrefs)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = notificationPrefs[key];
          return obj;
        }, {});

      return await this.setUserPreferences(userId, filteredPrefs);
    } catch (error) {
      logger.error(`Error updating notification preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get display preferences (theme, language, timezone)
   * @param {number} userId - User ID
   * @returns {Promise<object>} Display preferences
   */
  async getDisplayPreferences(userId) {
    try {
      const preferences = await this.getWithDefaults(userId);

      return {
        theme: preferences.theme,
        language: preferences.language,
        timezone: preferences.timezone
      };
    } catch (error) {
      logger.error(`Error getting display preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update display preferences
   * @param {number} userId - User ID
   * @param {object} displayPrefs - Display preferences
   * @returns {Promise<object>} Updated preferences
   */
  async updateDisplayPreferences(userId, displayPrefs) {
    try {
      const allowedFields = ['theme', 'language', 'timezone'];

      // Validate theme values
      if (displayPrefs.theme && !['light', 'dark', 'auto'].includes(displayPrefs.theme)) {
        throw new Error('Invalid theme value. Must be: light, dark, or auto');
      }

      // Validate language (basic validation - could be expanded)
      if (displayPrefs.language && displayPrefs.language.length !== 2) {
        throw new Error('Invalid language code. Must be 2-character code (e.g., en, es, fr)');
      }

      // Filter to only allowed display fields
      const filteredPrefs = Object.keys(displayPrefs)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = displayPrefs[key];
          return obj;
        }, {});

      return await this.setUserPreferences(userId, filteredPrefs);
    } catch (error) {
      logger.error(`Error updating display preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get AI preferences (LLM selection, etc.)
   * @param {number} userId - User ID
   * @returns {Promise<object>} AI preferences
   */
  async getAiPreferences(userId) {
    try {
      const preferences = await this.getWithDefaults(userId);

      return {
        llm: preferences.llm,
        privacy_level: preferences.privacy_level
      };
    } catch (error) {
      logger.error(`Error getting AI preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update AI preferences
   * @param {number} userId - User ID
   * @param {object} aiPrefs - AI preferences
   * @returns {Promise<object>} Updated preferences
   */
  async updateAiPreferences(userId, aiPrefs) {
    try {
      const allowedFields = ['llm', 'privacy_level'];

      // Validate LLM options
      if (aiPrefs.llm && !['gemini', 'chatgpt', 'auto'].includes(aiPrefs.llm)) {
        throw new Error('Invalid LLM value. Must be: gemini, chatgpt, or auto');
      }

      // Validate privacy level
      if (aiPrefs.privacy_level && !['minimal', 'normal', 'enhanced'].includes(aiPrefs.privacy_level)) {
        throw new Error('Invalid privacy level. Must be: minimal, normal, or enhanced');
      }

      // Filter to only allowed AI fields
      const filteredPrefs = Object.keys(aiPrefs)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = aiPrefs[key];
          return obj;
        }, {});

      return await this.setUserPreferences(userId, filteredPrefs);
    } catch (error) {
      logger.error(`Error updating AI preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Store custom preference data in JSONB field
   * @param {number} userId - User ID
   * @param {object} customData - Custom preferences data
   * @returns {Promise<object>} Updated preferences
   */
  async updateCustomData(userId, customData) {
    try {
      const preferences = await this.getByUserId(userId);

      let updatedData;
      if (preferences && preferences.preferences_data) {
        // Merge with existing data
        updatedData = {
          ...preferences.preferences_data,
          ...customData
        };
      } else {
        updatedData = customData;
      }

      return await this.setUserPreferences(userId, {
        preferences_data: updatedData
      });
    } catch (error) {
      logger.error(`Error updating custom preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Delete user preferences
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteUserPreferences(userId) {
    try {
      const preferences = await this.getByUserId(userId);

      if (preferences) {
        await this.delete(preferences.id);
        logger.info(`Deleted preferences for user ${userId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error deleting preferences for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user can receive marketing communications
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} Whether user accepts marketing
   */
  async canReceiveMarketing(userId) {
    try {
      const prefs = await this.getNotificationPreferences(userId);
      return prefs.marketing_emails || prefs.marketing_communications;
    } catch (error) {
      logger.error(`Error checking marketing preferences for user ${userId}:`, error);
      return false; // Default to not sending marketing on error
    }
  }

  /**
   * Bulk update preferences for multiple users (admin function)
   * @param {Array} updates - Array of {userId, preferences} objects
   * @returns {Promise<number>} Number of users updated
   */
  async bulkUpdatePreferences(updates) {
    try {
      let updatedCount = 0;

      for (const { userId, preferences } of updates) {
        try {
          await this.setUserPreferences(userId, preferences);
          updatedCount++;
        } catch (error) {
          logger.warn(`Failed to update preferences for user ${userId}:`, error);
        }
      }

      logger.info(`Bulk updated preferences for ${updatedCount} users`);
      return updatedCount;
    } catch (error) {
      logger.error('Error in bulk preferences update:', error);
      throw error;
    }
  }
}

module.exports = UserPreferences;
