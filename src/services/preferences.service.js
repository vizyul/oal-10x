const { v4: uuidv4 } = require('uuid');
const airtableService = require('./airtable.service');
const { logger } = require('../utils');

class PreferencesService {
  constructor() {
    this.tableName = 'User_Preferences';
    this.base = airtableService.base;
  }

  /**
   * Get user preferences by user email
   * @param {string} userEmail - User's email address
   * @returns {Promise<Object|null>} User preferences or null if not found
   */
  async getUserPreferences(userEmail) {
    try {
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Getting preferences for user: ${userEmail}`);

      // First find the user to get their record ID
      const authService = require('./auth.service');
      const user = await authService.findUserByEmail(userEmail);
      
      if (!user) {
        logger.warn(`User not found: ${userEmail}`);
        return null;
      }

      logger.info(`Looking for preferences with User field = '${user.id}'`);
      
      // Try different query approaches for linked fields
      logger.info(`Trying multiple query approaches for user: ${user.id}`);
      
      // Approach 1: Direct string comparison
      let records = await this.base(this.tableName)
        .select({
          filterByFormula: `{User} = '${user.id}'`,
          maxRecords: 5
        })
        .firstPage();
        
      logger.info(`Approach 1 - Direct string: Found ${records.length} records`);
      
      if (records.length === 0) {
        // Approach 2: FIND function for array search
        records = await this.base(this.tableName)
          .select({
            filterByFormula: `FIND('${user.id}', ARRAYJOIN(User, ','))`,
            maxRecords: 5
          })
          .firstPage();
          
        logger.info(`Approach 2 - FIND in array: Found ${records.length} records`);
      }
      
      if (records.length === 0) {
        // Approach 3: No filter, then check manually
        const allRecords = await this.base(this.tableName).select({ maxRecords: 20 }).firstPage();
        logger.info(`Approach 3 - Manual check: Found ${allRecords.length} total records`);
        
        allRecords.forEach((record, i) => {
          logger.info(`Record ${i + 1}: User field =`, record.fields.User, `(type: ${typeof record.fields.User})`);
        });
        
        records = allRecords.filter(record => {
          const userField = record.fields.User;
          if (Array.isArray(userField)) {
            return userField.includes(user.id);
          }
          return userField === user.id;
        });
        
        logger.info(`Approach 3 - After manual filter: Found ${records.length} records`);
      }
        
      logger.info(`Found ${records.length} existing preference records for ${userEmail}`);

      if (records.length === 0) {
        logger.info(`No preferences found for user: ${userEmail}`);
        return null;
      }

      const record = records[0];
      return {
        id: record.id,
        preferenceKey: record.fields['Preference Key'],
        userId: record.fields['User'] ? record.fields['User'][0] : user.id,
        userEmail: userEmail,
        themeMode: record.fields['Theme Mode'] || 'light',
        emailNotifications: record.fields['Email Notifications'] || false,
        marketingCommunications: record.fields['Marketing Communications'] || false,
        weeklyDigest: record.fields['Weekly Digest'] || false,
        createdAt: record.fields['Created At'],
        updatedAt: record.fields['Updated At']
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
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      // Add stack trace to see WHERE this is being called from
      const stack = new Error().stack;
      logger.warn(`🚨 CREATING DEFAULT PREFERENCES for user: ${userEmail}`);
      logger.warn(`🚨 Call stack:`, stack);

      // First find the user to get their record ID
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
        'Preference Key': preferenceKey,
        'User': [user.id], // Link to Users table record
        'Theme Mode': 'light',
        'Email Notifications': true,
        'Marketing Communications': false,
        'Weekly Digest': true,
        'Created At': now,
        'Updated At': now
      };

      logger.info(`Attempting to create preferences record with fields:`, fields);
      
      const records = await this.base(this.tableName).create([{ fields }]);
      
      logger.info(`Successfully created preferences record:`, records.length > 0 ? records[0].id : 'none');

      if (records.length === 0) {
        throw new Error('Failed to create user preferences');
      }

      const record = records[0];
      logger.info(`Created preferences for user ${userEmail} with key: ${preferenceKey}`);

      return {
        id: record.id,
        preferenceKey: record.fields['Preference Key'],
        userId: record.fields['User'] ? record.fields['User'][0] : user.id,
        userEmail: userEmail,
        themeMode: record.fields['Theme Mode'],
        emailNotifications: record.fields['Email Notifications'],
        marketingCommunications: record.fields['Marketing Communications'],
        weeklyDigest: record.fields['Weekly Digest'],
        createdAt: record.fields['Created At'],
        updatedAt: record.fields['Updated At']
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
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Creating preferences with updates for user: ${userEmail}`, updates);

      // First find the user to get their record ID
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
        'Preference Key': preferenceKey,
        'User': [user.id],
        'Theme Mode': 'light',
        'Email Notifications': true,
        'Marketing Communications': false,
        'Weekly Digest': true,
        'Created At': now,
        'Updated At': now
      };

      // Apply updates to defaults
      if (updates.themeMode !== undefined) {
        fields['Theme Mode'] = updates.themeMode;
      }
      if (updates.emailNotifications !== undefined) {
        fields['Email Notifications'] = updates.emailNotifications;
      }
      if (updates.marketingCommunications !== undefined) {
        fields['Marketing Communications'] = updates.marketingCommunications;
      }
      if (updates.weeklyDigest !== undefined) {
        fields['Weekly Digest'] = updates.weeklyDigest;
      }

      logger.info(`Creating preferences record with fields:`, fields);
      
      const records = await this.base(this.tableName).create([{ fields }]);
      
      if (records.length === 0) {
        throw new Error('Failed to create user preferences');
      }

      const record = records[0];
      logger.info(`Created preferences for user ${userEmail} with key: ${preferenceKey}`);

      return {
        id: record.id,
        preferenceKey: record.fields['Preference Key'],
        userId: record.fields['User'] ? record.fields['User'][0] : user.id,
        userEmail: userEmail,
        themeMode: record.fields['Theme Mode'],
        emailNotifications: record.fields['Email Notifications'],
        marketingCommunications: record.fields['Marketing Communications'],
        weeklyDigest: record.fields['Weekly Digest'],
        createdAt: record.fields['Created At'],
        updatedAt: record.fields['Updated At']
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
      if (!this.base) {
        throw new Error('Airtable not configured');
      }

      logger.info(`Updating preferences for user: ${userEmail}`, { updates });

      // First, get the existing record
      const existingPrefs = await this.getUserPreferences(userEmail);
      
      if (!existingPrefs) {
        // Create preferences with the updates applied directly
        logger.info(`No existing preferences found for ${userEmail}, creating with updates`);
        return await this.createPreferencesWithUpdates(userEmail, updates);
      }

      const fields = {
        'Updated At': new Date().toISOString()
      };

      // Map update fields to Airtable field names
      if (updates.themeMode !== undefined) {
        fields['Theme Mode'] = updates.themeMode;
      }
      if (updates.emailNotifications !== undefined) {
        fields['Email Notifications'] = updates.emailNotifications;
      }
      if (updates.marketingCommunications !== undefined) {
        fields['Marketing Communications'] = updates.marketingCommunications;
      }
      if (updates.weeklyDigest !== undefined) {
        fields['Weekly Digest'] = updates.weeklyDigest;
      }

      const records = await this.base(this.tableName).update([
        {
          id: existingPrefs.id,
          fields
        }
      ]);

      if (records.length === 0) {
        throw new Error('Failed to update preferences');
      }

      const record = records[0];
      logger.info(`Updated preferences for user: ${userEmail}`);

      return {
        id: record.id,
        preferenceKey: record.fields['Preference Key'],
        userId: record.fields['user'] ? record.fields['user'][0] : null,
        userEmail: userEmail,
        themeMode: record.fields['Theme Mode'],
        emailNotifications: record.fields['Email Notifications'],
        marketingCommunications: record.fields['Marketing Communications'],
        weeklyDigest: record.fields['Weekly Digest'],
        createdAt: record.fields['Created At'],
        updatedAt: record.fields['Updated At']
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