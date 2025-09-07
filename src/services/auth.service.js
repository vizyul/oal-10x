const database = require('./database.service');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils');

class AuthService {
  constructor() {
    this.tableName = 'users'; // PostgreSQL table name for users
  }

  /**
   * Create a new user in PostgreSQL
   * @param {Object} userData - User data object
   * @returns {Promise<Object>} Created user object
   */
  async createUser(userData) {
    try {
      logger.info('Creating new user in PostgreSQL');

      // Map fields to PostgreSQL column names
      let fields = {};
      
      // If userData has Airtable field names (OAuth), map them
      if (userData['Email']) {
        fields = {
          email: userData['Email'],
          password: userData['Password'],
          first_name: userData['First Name'],
          last_name: userData['Last Name'],
          email_verified: userData['Email Verified'] || false,
          email_verification_token: userData['Email Verification Token'],
          email_verification_expires: userData['Email Verification Expires'],
          terms_accepted: userData['Terms Accepted'] || false,
          privacy_accepted: userData['Privacy Accepted'] || false,
          status: userData['Status'] || 'pending',
          google_id: userData['Google ID'],
          microsoft_id: userData['Microsoft ID'], 
          apple_id: userData['Apple ID'],
          registration_method: userData['Registration Method'],
          subscription_tier: userData['subscription_tier'] || 'free',
          subscription_status: userData['subscription_status'] || 'none',
          stripe_customer_id: userData['stripe_customer_id']
        };
      } else {
        // Regular signup camelCase format
        fields = {
          email: userData.email,
          password: userData.password,
          first_name: userData.firstName,
          last_name: userData.lastName,
          email_verified: userData.emailVerified || false,
          email_verification_token: userData.emailVerificationToken,
          email_verification_expires: userData.emailVerificationExpires,
          terms_accepted: userData.termsAccepted || false,
          privacy_accepted: userData.privacyAccepted || false,
          status: userData.status || 'pending',
          subscription_tier: userData.subscription_tier || 'free',
          subscription_status: userData.subscription_status || 'none'
        };
      }

      const record = await database.create(this.tableName, fields);

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
      const records = await database.findByField(
        this.tableName,
        'email',
        email
      );

      if (records.length === 0) {
        return null;
      }

      return this.formatUserRecord(records[0]);
    } catch (error) {
      logger.error('Error finding user by email:', error.message || error);
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

      const records = await database.findByField(
        this.tableName,
        'apple_id',
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

      // Use raw SQL to get Apple users sorted by updated timestamp descending
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE registration_method = 'apple' AND status = 'active'
        ORDER BY updated_at DESC 
        LIMIT 1
      `;
      
      const result = await database.query(query);

      if (result.rows.length === 0) {
        logger.info('No active Apple users found');
        return null;
      }

      const user = this.formatUserRecord(database.formatRecord(result.rows[0]));
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

      const record = await database.findById(this.tableName, userId);
      
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

      const mappedData = {};
      
      // Map common fields to PostgreSQL column names
      if (updateData.firstName) mappedData.first_name = updateData.firstName;
      if (updateData.lastName) mappedData.last_name = updateData.lastName;
      if (updateData.email) mappedData.email = updateData.email;
      if (updateData.password) mappedData.password = updateData.password;
      if (updateData.emailVerified !== undefined) mappedData.email_verified = updateData.emailVerified;
      if (updateData.emailVerificationToken) mappedData.email_verification_token = updateData.emailVerificationToken;
      if (updateData.emailVerificationExpires) mappedData.email_verification_expires = updateData.emailVerificationExpires;
      if (updateData.emailVerificationToken === null) mappedData.email_verification_token = null;
      if (updateData.emailVerificationExpires === null) mappedData.email_verification_expires = null;
      if (updateData.status) mappedData.status = updateData.status;
      if (updateData.lastLoginAt) mappedData.last_login_at = updateData.lastLoginAt;
      if (updateData.termsAccepted !== undefined) mappedData.terms_accepted = updateData.termsAccepted;
      if (updateData.privacyAccepted !== undefined) mappedData.privacy_accepted = updateData.privacyAccepted;
      
      // Handle welcome email fields
      if (updateData['Welcome Email Sent'] !== undefined) mappedData.welcome_email_sent = updateData['Welcome Email Sent'];
      if (updateData['Welcome Email Sent At']) mappedData.welcome_email_sent_at = updateData['Welcome Email Sent At'];
      
      // Handle OAuth ID fields
      if (updateData['Google ID']) mappedData.google_id = updateData['Google ID'];
      if (updateData['Microsoft ID']) mappedData.microsoft_id = updateData['Microsoft ID'];
      if (updateData['Apple ID']) mappedData.apple_id = updateData['Apple ID'];
      
      // Handle subscription fields
      if (updateData.subscription_tier) mappedData.subscription_tier = updateData.subscription_tier;
      if (updateData.subscription_status) mappedData.subscription_status = updateData.subscription_status;

      const record = await database.update(this.tableName, userId, mappedData);
      
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
      
      const records = await database.findByField(
        this.tableName,
        'email_verification_token',
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
   * Format PostgreSQL record to user object
   * @param {Object} record - PostgreSQL record
   * @returns {Object} Formatted user object
   */
  formatUserRecord(record) {
    if (!record) {
      return null;
    }

    // Handle both direct PostgreSQL rows and formatted database service records
    const fields = record.fields || record;
    
    return {
      id: record.id || fields.id,
      email: fields.email,
      password: fields.password,
      firstName: fields.first_name,
      lastName: fields.last_name,
      fullName: `${fields.first_name || ''} ${fields.last_name || ''}`.trim(),
      emailVerified: fields.email_verified || false,
      emailVerificationToken: fields.email_verification_token,
      emailVerificationExpires: fields.email_verification_expires,
      termsAccepted: fields.terms_accepted || false,
      privacyAccepted: fields.privacy_accepted || false,
      status: fields.status || 'pending',
      createdAt: fields.created_at,
      updatedAt: fields.updated_at,
      lastLoginAt: fields.last_login_at,
      googleId: fields.google_id,
      appleId: fields.apple_id,
      microsoftId: fields.microsoft_id,
      registrationMethod: fields.registration_method,
      welcomeEmailSent: fields.welcome_email_sent || false,
      welcomeEmailSentAt: fields.welcome_email_sent_at,
      subscription_tier: fields.subscription_tier || 'free',
      subscription_status: fields.subscription_status || 'none',
      stripe_customer_id: fields.stripe_customer_id
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
      const allUsers = await database.findAll(this.tableName);
      
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