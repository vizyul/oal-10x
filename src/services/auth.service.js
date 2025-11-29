// const database = require('./database.service'); // TODO: Remove if not needed
const { user: UserModel } = require('../models');
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

      // Hash password if provided
      const bcrypt = require('bcryptjs');
      let hashedPassword = null;
      if (userData.password || userData['Password']) {
        const plainPassword = userData.password || userData['Password'];
        hashedPassword = await bcrypt.hash(plainPassword, 12);
      }

      // Map fields to PostgreSQL column names
      let fields = {};

      // If userData has Airtable field names (OAuth), map them
      if (userData['Email']) {
        fields = {
          email: userData['Email'],
          password: hashedPassword,
          first_name: userData['First Name'],
          last_name: userData['Last Name'],
          email_verified: userData['Email Verified'] || false,
          email_verification_token: userData['Email Verification Token'],
          email_verification_expires: userData['Email Verification Expires'],
          terms_accepted: userData['Terms Accepted'] || false,
          privacy_accepted: userData['Privacy Accepted'] || false,
          status: userData['Status'] || 'pending',
          oauth_provider: userData['OAuth Provider'],
          oauth_id: userData['OAuth ID'],
          registration_method: userData['Registration Method'],
          subscription_tier: userData['subscription_tier'] || 'free',
          subscription_status: userData['subscription_status'] || 'none',
          stripe_customer_id: userData['stripe_customer_id']
        };
      } else {
        // Regular signup camelCase format
        fields = {
          email: userData.email,
          password: hashedPassword,
          first_name: userData.firstName || userData.first_name,
          last_name: userData.lastName || userData.last_name,
          email_verified: userData.emailVerified || false,
          email_verification_token: userData.emailVerificationToken,
          email_verification_expires: userData.emailVerificationExpires,
          terms_accepted: userData.termsAccepted || false,
          privacy_accepted: userData.privacyAccepted || false,
          status: userData.status || 'pending',
          registration_method: userData.registration_method || 'email',
          subscription_tier: userData.subscription_tier || 'free',
          subscription_status: userData.subscription_status || 'none'
        };
      }

      const record = await UserModel.createUser(fields);

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
      const foundUser = await UserModel.findByEmail(email);

      if (!foundUser) {
        return null;
      }

      return this.formatUserRecord(foundUser);
    } catch (error) {
      logger.error('Error finding user by email:', error.message || error);
      return null;
    }
  }

  /**
   * Find user by email address (including verification fields for signup/verification)
   * @param {string} email - User email address
   * @returns {Promise<Object|null>} User object with verification fields or null if not found
   */
  async findUserByEmailForVerification(email) {
    try {
      // Use the method that returns raw data (doesn't hide verification fields)
      const foundUser = await UserModel.findByEmailWithPassword(email);

      if (!foundUser) {
        return null;
      }

      // Format the record but preserve verification fields
      const formatted = this.formatUserRecord(foundUser);
      // Add back the verification fields that were hidden
      formatted.emailVerificationToken = foundUser.email_verification_token;
      formatted.emailVerificationExpires = foundUser.email_verification_expires;

      return formatted;
    } catch (error) {
      logger.error('Error finding user by email for verification:', error.message || error);
      return null;
    }
  }

  /**
   * Find user by email address (including password for authentication)
   * @param {string} email - User email address
   * @returns {Promise<Object|null>} User object with password or null if not found
   */
  async findUserByEmailForAuth(email) {
    try {
      const foundUser = await UserModel.findByEmailWithPassword(email);

      if (!foundUser) {
        return null;
      }

      return this.formatUserRecord(foundUser);
    } catch (error) {
      logger.error('Error finding user by email for auth:', error.message || error);
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

      // Find user by OAuth credentials
      const foundUser = await UserModel.findByOAuth('apple', appleId);

      if (!foundUser) {
        logger.info(`No user found with Apple ID: ${appleId}`);
        return null;
      }

      const userRecord = this.formatUserRecord(foundUser);
      logger.info(`User found by Apple ID: ${userRecord.email}`);

      return userRecord;
    } catch (error) {
      logger.error('Error finding user by Apple ID:', error);
      throw new Error('Failed to find user by Apple ID');
    }
  }

  // REMOVED: findMostRecentAppleUser() function
  // This was a serious security vulnerability that could log users into wrong accounts.
  // Apple OAuth now properly fails when user identification is not possible.

  /**
   * Find user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUserById(userId) {
    try {
      logger.info(`Finding user by ID: ${userId}`);

      const foundUser = await UserModel.findById(userId);

      if (!foundUser) {
        return null;
      }

      return this.formatUserRecord(foundUser);
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
      if (updateData.emailVerificationToken !== undefined) mappedData.email_verification_token = updateData.emailVerificationToken;
      if (updateData.emailVerificationExpires !== undefined) mappedData.email_verification_expires = updateData.emailVerificationExpires;
      if (updateData.status) mappedData.status = updateData.status;
      if (updateData.lastLoginAt) mappedData.last_login = updateData.lastLoginAt;
      if (updateData.termsAccepted !== undefined) mappedData.terms_accepted = updateData.termsAccepted;
      if (updateData.privacyAccepted !== undefined) mappedData.privacy_accepted = updateData.privacyAccepted;

      // Handle welcome email fields
      if (updateData['Welcome Email Sent'] !== undefined) mappedData.welcome_email_sent = updateData['Welcome Email Sent'];
      if (updateData['Welcome Email Sent At']) mappedData.welcome_email_sent_at = updateData['Welcome Email Sent At'];

      // Handle OAuth ID fields - map to normalized oauth columns
      if (updateData['Google ID']) {
        mappedData.oauth_provider = 'google';
        mappedData.oauth_id = updateData['Google ID'];
      }
      if (updateData['Microsoft ID']) {
        mappedData.oauth_provider = 'microsoft';
        mappedData.oauth_id = updateData['Microsoft ID'];
      }
      if (updateData['Apple ID']) {
        mappedData.oauth_provider = 'apple';
        mappedData.oauth_id = updateData['Apple ID'];
      }

      // Handle subscription fields
      if (updateData.subscription_tier) mappedData.subscription_tier = updateData.subscription_tier;
      if (updateData.subscription_status) mappedData.subscription_status = updateData.subscription_status;

      // Handle affiliate fields
      if (updateData.referred_by_code !== undefined) mappedData.referred_by_code = updateData.referred_by_code;
      if (updateData.affiliate_code !== undefined) mappedData.affiliate_code = updateData.affiliate_code;
      if (updateData.is_affiliate !== undefined) mappedData.is_affiliate = updateData.is_affiliate;
      if (updateData.affiliate_status !== undefined) mappedData.affiliate_status = updateData.affiliate_status;
      if (updateData.affiliate_joined_at !== undefined) mappedData.affiliate_joined_at = updateData.affiliate_joined_at;
      if (updateData.refgrow_affiliate_id !== undefined) mappedData.refgrow_affiliate_id = updateData.refgrow_affiliate_id;

      const record = await UserModel.updateUser(userId, mappedData);

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

      const foundUser = await UserModel.findByField('email_verification_token', token);

      if (!foundUser) {
        logger.warn('Email verification token not found');
        return null;
      }

      const userRecord = this.formatUserRecord(foundUser);

      // Check if token is expired
      const now = new Date();
      const expiryDate = new Date(userRecord.emailVerificationExpires);

      if (now > expiryDate) {
        logger.warn('Email verification token expired');
        return null;
      }

      // Update user to mark email as verified
      const updatedUser = await this.updateUser(userRecord.id, {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
        status: 'active'
      });

      logger.info(`Email verified for user: ${updatedUser.id}`);
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
      role: fields.role || 'user',
      createdAt: fields.created_at,
      updatedAt: fields.updated_at,
      lastLoginAt: fields.last_login, // Use existing last_login column
      oauthProvider: fields.oauth_provider,
      oauthId: fields.oauth_id,
      // Legacy compatibility - derive individual provider IDs from oauth fields
      googleId: fields.oauth_provider === 'google' ? fields.oauth_id : null,
      appleId: fields.oauth_provider === 'apple' ? fields.oauth_id : null,
      microsoftId: fields.oauth_provider === 'microsoft' ? fields.oauth_id : null,
      registrationMethod: fields.oauth_provider || 'email', // Default to email if no oauth
      welcomeEmailSent: fields.welcome_email_sent || false,
      welcomeEmailSentAt: fields.welcome_email_sent_at,
      subscription_tier: fields.subscription_tier || 'free',
      subscription_status: fields.subscription_status || 'none',
      stripe_customer_id: fields.stripe_customer_id,
      free_video_used: fields.free_video_used || false
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
        payload.role = userData.role;
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
      const allUsers = await UserModel.findAll();

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

  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password (plain text)
   * @returns {Promise<Object|null>} User object if authentication successful, null otherwise
   */
  async authenticateUser(email, password) {
    try {
      logger.info(`Authenticating user: ${email}`);

      // Find user by email
      const user = await this.findUserByEmail(email);
      if (!user) {
        logger.info(`User not found: ${email}`);
        return null;
      }

      // Check if password is set (for OAuth users, password might be null)
      if (!user.password) {
        logger.info(`User ${email} has no password (OAuth user)`);
        return null;
      }

      // Verify password using bcrypt
      const bcrypt = require('bcryptjs');
      const isValid = await bcrypt.compare(password, user.password);

      if (!isValid) {
        logger.info(`Invalid password for user: ${email}`);
        return null;
      }

      logger.info(`User authenticated successfully: ${email}`);
      return user;
    } catch (error) {
      logger.error('Error authenticating user:', error);
      throw new Error('Failed to authenticate user');
    }
  }

  /**
   * Create OAuth user with normalized provider fields
   * @param {Object} userData - OAuth user data
   * @returns {Promise<Object>} Created user object
   */
  async createOAuthUser(userData) {
    let fields = null;
    try {
      logger.info(`Creating OAuth user: ${userData.email} via ${userData.oauth_provider}`);

      // Ensure we have the required OAuth fields
      if (!userData.oauth_provider || !userData.oauth_id) {
        throw new Error('OAuth provider and ID are required');
      }

      // Prepare user data with OAuth normalization
      fields = {
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        oauth_provider: userData.oauth_provider, // Normalized field
        oauth_id: userData.oauth_id, // Normalized field
        email_verified: userData.email_verified || true, // OAuth users typically have verified emails
        status: userData.status || 'active',
        registration_method: userData.oauth_provider, // Set registration method to the OAuth provider
        subscription_tier: userData.subscription_tier || 'free'
      };

      const createdUser = await UserModel.createUser(fields);
      logger.info(`OAuth user created successfully: ${createdUser.email}`);

      return this.formatUserRecord(createdUser);
    } catch (error) {
      logger.error('Error creating OAuth user:', error);
      logger.error('OAuth user data was:', userData);
      if (fields) {
        logger.error('Database fields were:', fields);
      }
      throw new Error(`Failed to create OAuth user: ${error.message}`);
    }
  }

  /**
   * Find user by OAuth provider and ID
   * @param {string} provider - OAuth provider (google, apple, microsoft)
   * @param {string} oauthId - OAuth ID from provider
   * @returns {Promise<Object|null>} User object or null if not found
   */
  async findUserByOAuth(provider, oauthId) {
    try {
      logger.info(`Finding user by OAuth: ${provider}:${oauthId}`);

      const foundUser = await UserModel.findByOAuth(provider, oauthId);

      if (!foundUser) {
        logger.info(`No user found with OAuth ${provider}:${oauthId}`);
        return null;
      }

      const userRecord = this.formatUserRecord(foundUser);
      logger.info(`User found by OAuth: ${userRecord.email}`);

      return userRecord;
    } catch (error) {
      logger.error('Error finding user by OAuth:', error);
      throw new Error('Failed to find user by OAuth credentials');
    }
  }
}

module.exports = new AuthService();
