const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');

/**
 * User Model
 * Manages user data and provides user lookup operations
 */
class User extends BaseModel {
  constructor() {
    super('users', 'id');
    
    this.fillable = [
      'email', 'first_name', 'last_name', 'password', 'status', 'role',
      'oauth_provider', 'oauth_id', 'email_verified', 'profile_image_url',
      'phone', 'date_of_birth', 'gender', 'location', 'bio', 'website_url',
      'social_links', 'preferences', 'metadata', 'stripe_customer_id',
      'subscription_status', 'subscription_plan', 'subscription_tier',
      'trial_end', 'two_factor_enabled', 'api_key_hash', 'session_token',
      'magic_link_token', 'monthly_usage_limit', 'airtable_id'
    ];
    
    this.hidden = [
      'password', 'api_key_hash', 'session_token', 'magic_link_token',
      'email_verification_token', 'email_verification_expires'
    ];
    
    this.casts = {
      'email_verified': 'boolean',
      'two_factor_enabled': 'boolean',
      'social_links': 'json',
      'preferences': 'json',
      'metadata': 'json',
      'date_of_birth': 'date',
      'trial_end': 'date',
      'last_login': 'date',
      'created_at': 'date',
      'updated_at': 'date'
    };
  }

  /**
   * Find user by email address
   * @param {string} email - Email address
   * @returns {Promise<object|null>} User object or null
   */
  async findByEmail(email) {
    try {
      const users = await this.findByField('email', email);
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error(`Error finding user by email ${email}:`, error);
      throw error;
    }
  }

  /**
   * Find user by email (including password for authentication)
   * @param {string} email - User email
   * @returns {Promise<object|null>} User object with password or null
   */
  async findByEmailWithPassword(email) {
    try {
      if (!email) {
        throw new Error('Email is required');
      }

      const query = `SELECT * FROM ${this.tableName} WHERE email = $1`;
      const result = await database.query(query, [email]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Return raw data without hiding password field
      return result.rows[0];
    } catch (error) {
      logger.error(`Error finding user by email with password ${email}:`, error);
      throw error;
    }
  }

  /**
   * Find user by Airtable ID
   * @param {string} airtableId - Airtable record ID (starts with 'rec')
   * @returns {Promise<object|null>} User object or null
   */
  async findByAirtableId(airtableId) {
    try {
      const users = await this.findByField('airtable_id', airtableId);
      return users.length > 0 ? users[0] : null;
    } catch (error) {
      logger.error(`Error finding user by Airtable ID ${airtableId}:`, error);
      throw error;
    }
  }

  /**
   * Find user by OAuth provider and ID
   * @param {string} provider - OAuth provider (google, apple, microsoft)
   * @param {string} oauthId - OAuth provider user ID
   * @returns {Promise<object|null>} User object or null
   */
  async findByOAuth(provider, oauthId) {
    try {
      const query = `
        SELECT * FROM ${this.tableName} 
        WHERE oauth_provider = $1 AND oauth_id = $2
      `;
      const result = await database.query(query, [provider, oauthId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding user by OAuth ${provider}:${oauthId}:`, error);
      throw error;
    }
  }

  /**
   * Convert any user identifier to PostgreSQL user ID
   * Handles Airtable IDs, email addresses, and PostgreSQL IDs
   * @param {string|number} userId - User identifier
   * @returns {Promise<number|null>} PostgreSQL user ID or null
   */
  async resolveUserId(userId) {
    try {
      // If it's already a PostgreSQL integer ID
      if (typeof userId === 'number' || (typeof userId === 'string' && /^\d+$/.test(userId))) {
        const pgUserId = parseInt(userId);
        // Verify the user exists
        const user = await this.findById(pgUserId);
        return user ? pgUserId : null;
      }
      
      // If it's an Airtable record ID
      if (typeof userId === 'string' && userId.startsWith('rec')) {
        const user = await this.findByAirtableId(userId);
        return user ? user.id : null;
      }
      
      // If it's an email address
      if (typeof userId === 'string' && userId.includes('@')) {
        const user = await this.findByEmail(userId);
        return user ? user.id : null;
      }
      
      logger.warn(`Unrecognized userId format: ${userId} (type: ${typeof userId})`);
      return null;
    } catch (error) {
      logger.error(`Error resolving user ID ${userId}:`, error);
      return null;
    }
  }

  /**
   * Get user with their active subscription
   * @param {number} userId - PostgreSQL user ID
   * @returns {Promise<object|null>} User with subscription info or null
   */
  async findWithActiveSubscription(userId) {
    try {
      const query = `
        SELECT u.*, 
               us.id as subscription_id,
               us.stripe_subscription_id,
               us.plan_name,
               us.subscription_tier,
               us.status as subscription_status,
               us.current_period_start,
               us.current_period_end,
               us.trial_start,
               us.trial_end
        FROM ${this.tableName} u
        LEFT JOIN user_subscriptions us ON u.id = us.users_id 
          AND us.status IN ('active', 'trialing', 'past_due')
        WHERE u.id = $1
        ORDER BY us.created_at DESC
        LIMIT 1
      `;
      
      const result = await database.query(query, [userId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return this.formatOutput(result.rows[0]);
    } catch (error) {
      logger.error(`Error finding user with subscription ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new user
   * @param {object} userData - User data
   * @returns {Promise<object>} Created user
   */
  async createUser(userData) {
    try {
      return await this.create(userData);
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Update user information
   * @param {number} userId - User ID
   * @param {object} updateData - Data to update
   * @returns {Promise<object>} Updated user
   */
  async updateUser(userId, updateData) {
    try {
      return await this.update(userId, updateData);
    } catch (error) {
      logger.error(`Error updating user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get user profile (without sensitive data)
   * @param {number} userId - User ID
   * @returns {Promise<object|null>} User profile or null
   */
  async getProfile(userId) {
    try {
      const user = await this.findById(userId);
      if (!user) {
        return null;
      }
      
      // Remove sensitive fields for profile view
      const profile = { ...user };
      this.hidden.forEach(field => {
        delete profile[field];
      });
      
      return profile;
    } catch (error) {
      logger.error(`Error getting user profile ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Check if user exists by email
   * @param {string} email - Email address
   * @returns {Promise<boolean>} True if user exists
   */
  async emailExists(email) {
    try {
      const user = await this.findByEmail(email);
      return !!user;
    } catch (error) {
      logger.error(`Error checking if email exists ${email}:`, error);
      return false;
    }
  }

  /**
   * Get all active users (for admin purposes)
   * @param {object} options - Query options
   * @returns {Promise<Array>} Array of active users
   */
  async getActiveUsers(options = {}) {
    try {
      return await this.findAll({ status: 'active' }, options);
    } catch (error) {
      logger.error('Error getting active users:', error);
      throw error;
    }
  }
}

module.exports = User;