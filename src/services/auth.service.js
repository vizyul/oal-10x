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
      logger.info(`Finding user by email: ${email}`);
      
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
      registrationMethod: fields['Registration Method']
    };
  }

  /**
   * Generate JWT token for user
   * @param {string} userId - User ID
   * @param {string} email - User email
   * @returns {string} JWT token
   */
  generateToken(userId, email) {
    try {
      logger.info(`Generating JWT token for user: ${userId}`);
      
      const token = jwt.sign(
        { 
          userId: userId,
          email: email
        },
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