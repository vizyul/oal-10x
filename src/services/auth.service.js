const airtableService = require('./airtable.service');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils');

class AuthService {
  constructor() {
    this.tableName = 'Users'; // Airtable table name for users
  }

  /**
   * Create a new user in Airtable
   * @param {Object} userData - User data object
   * @returns {Promise<Object>} Created user object
   */
  async createUser(userData) {
    try {
      logger.info('Creating new user in Airtable');
      
      if (!airtableService.base) {
        logger.warn('Airtable not configured - cannot create user');
        throw new Error('Database not configured');
      }

      // Handle both camelCase format (regular signup) and Airtable field format (OAuth)
      let fields = {};
      
      // If userData has Airtable field names, use them directly
      if (userData['Email']) {
        // OAuth/direct Airtable format - copy all fields
        fields = { ...userData };
      } else {
        // Regular signup camelCase format
        fields = {
          'Email': userData.email,
          'Password': userData.password,
          'First Name': userData.firstName,
          'Last Name': userData.lastName,
          'Email Verified': userData.emailVerified,
          'Email Verification Token': userData.emailVerificationToken,
          'Email Verification Expires': userData.emailVerificationExpires,
          'Terms Accepted': userData.termsAccepted,
          'Privacy Accepted': userData.privacyAccepted,
          'Status': userData.status,
          'Created At': userData.createdAt,
          'Updated At': userData.updatedAt
        };
      }

      const record = await airtableService.create(this.tableName, fields);

      return this.formatUserRecord(record);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  /**
   * Find user by email address
   * @param {string} email - User email address
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUserByEmail(email) {
    try {
      // Finding user by email
      
      if (!airtableService.base) {
        logger.warn('Airtable not configured - returning null for user lookup');
        return null;
      }

      const records = await airtableService.findByField(
        this.tableName,
        'Email',
        email
      );

      if (records.length === 0) {
        return null;
      }

      return this.formatUserRecord(records[0]);
    } catch (error) {
      logger.error('Error finding user by email:', error.message || error);
      
      // If it's a table not found error, log it but don't crash
      if (error.message && error.message.includes('does not exist')) {
        logger.error(`Users table does not exist in Airtable base - please create it first`);
        return null;
      }
      
      // For other Airtable errors, also return null to avoid crashing
      logger.error('Airtable error - continuing without user lookup');
      return null;
    }
  }

  /**
   * Find user by Apple ID
   * @param {string} appleId - Apple user ID
   * @returns {Promise<Object|null>} User object or null
   */
  async findUserByAppleId(appleId) {
    try {
      logger.info(`Finding user by Apple ID: ${appleId}`);
      
      if (!airtableService.base) {
        logger.warn('Airtable not configured - returning null for Apple ID lookup');
        return null;
      }

      const records = await airtableService.findByField(
        this.tableName,
        'Apple ID',
        appleId
      );

      if (records.length === 0) {
        logger.info(`No user found with Apple ID: ${appleId}`);
        return null;
      }

      const user = this.formatUserRecord(records[0]);
      logger.info(`User found by Apple ID: ${user.email}`);
      
      return user;
    } catch (error) {
      logger.error('Error finding user by Apple ID:', error);
      throw new Error('Failed to find user by Apple ID');
    }
  }

  /**
   * Find most recent Apple user (fallback for Apple subsequent login issues)
   * @returns {Promise<Object|null>} Most recent Apple user or null
   */
  async findMostRecentAppleUser() {
    try {
      logger.info('Finding most recent Apple user as fallback');
      
      if (!airtableService.base) {
        logger.warn('Airtable not configured - returning null for Apple user lookup');
        return null;
      }

      // Get Apple users sorted by updated timestamp descending (most recent first)
      const records = await airtableService.base(this.tableName).select({
        filterByFormula: "AND({Registration Method} = 'apple', {Status} = 'active')",
        sort: [{ field: 'Updated At', direction: 'desc' }],
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        logger.info('No active Apple users found');
        return null;
      }

      const user = this.formatUserRecord(records[0]);
      logger.info(`Found most recent Apple user: ${user.email}`);
      
      return user;
    } catch (error) {
      logger.error('Error finding most recent Apple user:', error);
      throw new Error('Failed to find Apple user');
    }
  }

  /**
   * Find user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUserById(userId) {
    try {
      logger.info(`Finding user by ID: ${userId}`);
      
      if (!airtableService.base) {
        logger.warn('Airtable not configured - returning null for user lookup');
        return null;
      }

      const record = await airtableService.findById(this.tableName, userId);
      
      if (!record) {
        return null;
      }

      return this.formatUserRecord(record);
    } catch (error) {
      logger.error('Error finding user by ID:', error);
      throw new Error('Failed to find user');
    }
  }

  /**
   * Update user record
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user object
   */
  async updateUser(userId, updateData) {
    try {
      logger.info(`Updating user: ${userId}`);

      if (!airtableService.base) {
        logger.warn('Airtable not configured - cannot update user');
        throw new Error('Database not configured');
      }

      const mappedData = {};
      
      // Map common fields
      if (updateData.firstName) mappedData['First Name'] = updateData.firstName;
      if (updateData.lastName) mappedData['Last Name'] = updateData.lastName;
      if (updateData.email) mappedData['Email'] = updateData.email;
      if (updateData.password) mappedData['Password'] = updateData.password;
      if (updateData.emailVerified !== undefined) mappedData['Email Verified'] = updateData.emailVerified;
      if (updateData.emailVerificationToken) mappedData['Email Verification Token'] = updateData.emailVerificationToken;
      if (updateData.emailVerificationExpires) mappedData['Email Verification Expires'] = updateData.emailVerificationExpires;
      if (updateData.emailVerificationToken === null) mappedData['Email Verification Token'] = null;
      if (updateData.emailVerificationExpires === null) mappedData['Email Verification Expires'] = null;
      if (updateData.status) mappedData['Status'] = updateData.status;
      if (updateData.lastLoginAt) mappedData['Last Login At'] = updateData.lastLoginAt;
      if (updateData.termsAccepted !== undefined) mappedData['Terms Accepted'] = updateData.termsAccepted;
      if (updateData.privacyAccepted !== undefined) mappedData['Privacy Accepted'] = updateData.privacyAccepted;
      
      // Handle welcome email fields
      if (updateData['Welcome Email Sent'] !== undefined) mappedData['Welcome Email Sent'] = updateData['Welcome Email Sent'];
      if (updateData['Welcome Email Sent At']) mappedData['Welcome Email Sent At'] = updateData['Welcome Email Sent At'];
      
      // Handle OAuth ID fields
      if (updateData['Google ID']) mappedData['Google ID'] = updateData['Google ID'];
      if (updateData['Microsoft ID']) mappedData['Microsoft ID'] = updateData['Microsoft ID'];
      if (updateData['Apple ID']) mappedData['Apple ID'] = updateData['Apple ID'];
      
      // Handle subscription fields
      if (updateData.subscription_tier) mappedData['subscription_tier'] = updateData.subscription_tier;
      if (updateData.subscription_status) mappedData['subscription_status'] = updateData.subscription_status;
      
      // Always update the "Updated At" timestamp
      mappedData['Updated At'] = new Date().toISOString();

      const record = await airtableService.update(this.tableName, userId, mappedData);
      
      return this.formatUserRecord(record);
    } catch (error) {
      logger.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  /**
   * Verify email token and update user
   * @param {string} token - Email verification token
   * @returns {Promise<Object|null>} User object or null if token is invalid
   */
  async verifyEmailToken(token) {
    try {
      logger.info('Verifying email token');
      
      const records = await airtableService.findByField(
        this.tableName,
        'Email Verification Token',
        token
      );

      if (records.length === 0) {
        logger.warn('Email verification token not found');
        return null;
      }

      const user = this.formatUserRecord(records[0]);
      
      // Check if token is expired
      const now = new Date();
      const expiryDate = new Date(user.emailVerificationExpires);
      
      if (now > expiryDate) {
        logger.warn('Email verification token expired');
        return null;
      }

      // Update user to mark email as verified
      const updatedUser = await this.updateUser(user.id, {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        status: 'active'
      });

      logger.info(`Email verified for user: ${user.id}`);
      return updatedUser;
    } catch (error) {
      logger.error('Error verifying email token:', error);
      throw new Error('Failed to verify email token');
    }
  }

  /**
   * Delete user (soft delete by updating status)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Updated user object
   */
  async deleteUser(userId) {
    try {
      logger.info(`Deleting user: ${userId}`);
      
      const updatedUser = await this.updateUser(userId, {
        status: 'deleted'
      });

      return updatedUser;
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw new Error('Failed to delete user');
    }
  }

  /**
   * Format Airtable record to user object
   * @param {Object} record - Airtable record
   * @returns {Object} Formatted user object
   */
  formatUserRecord(record) {
    if (!record || !record.fields) {
      return null;
    }

    const fields = record.fields;
    
    
    return {
      id: record.id,
      email: fields['Email'],
      password: fields['Password'],
      firstName: fields['First Name'],
      lastName: fields['Last Name'],
      fullName: `${fields['First Name']} ${fields['Last Name']}`,
      emailVerified: fields['Email Verified'] || false,
      emailVerificationToken: fields['Email Verification Token'],
      emailVerificationExpires: fields['Email Verification Expires'],
      termsAccepted: fields['Terms Accepted'] || false,
      privacyAccepted: fields['Privacy Accepted'] || false,
      status: fields['Status'] || 'pending',
      createdAt: fields['Created At'],
      updatedAt: fields['Updated At'],
      lastLoginAt: fields['Last Login At'],
      googleId: fields['Google ID'],
      appleId: fields['Apple ID'],
      microsoftId: fields['Microsoft ID'],
      registrationMethod: fields['Registration Method'],
      welcomeEmailSent: fields['Welcome Email Sent'] || false,
      welcomeEmailSentAt: fields['Welcome Email Sent At'],
      subscription_tier: fields['subscription_tier'] || 'free',
      subscription_status: fields['subscription_status'] || 'none',
      stripe_customer_id: fields['stripe_customer_id']
    };
  }

  /**
   * Generate JWT token for user
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} JWT token
   */
  generateToken(userId, email, userData = null) {
    try {
      logger.info(`Generating JWT token for user: ${userId}`);
      
      const payload = { 
        userId: userId,
        email: email
      };
      
      // Include additional user data if provided (for newer tokens to avoid database lookups)
      if (userData) {
        payload.firstName = userData.firstName;
        payload.lastName = userData.lastName;
        payload.emailVerified = userData.emailVerified;
        payload.status = userData.status;
        payload.subscription_tier = userData.subscription_tier;
        payload.subscription_status = userData.subscription_status;
        payload.stripe_customer_id = userData.stripe_customer_id;
        
        logger.info(`JWT payload debug for ${email}:`, {
          firstName: userData.firstName,
          emailVerified: userData.emailVerified,
          status: userData.status,
          subscription_tier: userData.subscription_tier,
          subscription_status: userData.subscription_status
        });
      }
      
      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      return token;
    } catch (error) {
      logger.error('Error generating JWT token:', error);
      throw new Error('Failed to generate authentication token');
    }
  }

  /**
   * Get user statistics
   * @returns {Promise<Object>} User statistics
   */
  async getUserStats() {
    try {
      const allUsers = await airtableService.findAll(this.tableName);
      
      const stats = {
        total: allUsers.length,
        active: 0,
        pending: 0,
        verified: 0,
        unverified: 0
      };

      allUsers.forEach(record => {
        const user = this.formatUserRecord(record);
        
        if (user.status === 'active') stats.active++;
        if (user.status === 'pending_verification') stats.pending++;
        if (user.emailVerified) stats.verified++;
        if (!user.emailVerified) stats.unverified++;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw new Error('Failed to get user statistics');
    }
  }
}

module.exports = new AuthService();