const BaseModel = require('./BaseModel');
const database = require('../services/database.service');
const { logger } = require('../utils');
const crypto = require('crypto');

/**
 * Sessions Model
 * Manages user session data, authentication, and tracking
 */
class Sessions extends BaseModel {
  constructor() {
    super('sessions', 'id');
    
    this.fillable = [
      'users_id', 'session_id', 'session_data', 'ip_address', 'user_agent',
      'is_active', 'expires_at', 'device_info', 'location_data', 'device_type',
      'login_method', 'status', 'user_email', 'browser', 'os', 'last_activity_at',
      'location', 'timezone', 'duration', 'ended_at', 'last_accessed'
    ];
    
    this.hidden = [
      'session_data', 'device_info', 'location_data', 'ip_address'
    ];
    
    this.casts = {
      'is_active': 'boolean',
      'session_data': 'json',
      'device_info': 'json', 
      'location_data': 'json',
      'duration': 'decimal',
      'expires_at': 'date',
      'created_at': 'date',
      'updated_at': 'date',
      'last_accessed': 'date',
      'last_activity_at': 'date',
      'ended_at': 'date'
    };
  }

  /**
   * Generate a unique session ID
   * @returns {string} Unique session ID
   */
  generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Create a new session
   * @param {object} sessionData - Session data
   * @returns {Promise<object>} Created session
   */
  async createSession(sessionData) {
    try {
      // Generate session ID if not provided
      if (!sessionData.session_id) {
        sessionData.session_id = this.generateSessionId();
      }

      // Normalize data
      sessionData.login_method = this.normalizeLoginMethod(sessionData.login_method);
      sessionData.device_type = this.normalizeDeviceType(sessionData.device_type);
      sessionData.status = this.normalizeStatus(sessionData.status || 'active');
      sessionData.is_active = true;

      const session = await this.create(sessionData);
      logger.info(`Session created for user ${sessionData.users_id}: ${session.session_id}`);
      
      return session;
    } catch (error) {
      logger.error('Error creating session:', error);
      throw error;
    }
  }

  /**
   * Find session by session ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<object|null>} Session or null
   */
  async findBySessionId(sessionId) {
    try {
      const sessions = await this.findByField('session_id', sessionId);
      return sessions.length > 0 ? sessions[0] : null;
    } catch (error) {
      logger.error(`Error finding session by ID ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Find active sessions for a user
   * @param {number} userId - User ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} Active sessions
   */
  async findActiveByUserId(userId, options = {}) {
    try {
      const conditions = {
        users_id: userId,
        is_active: true,
        status: 'active'
      };

      return await this.findAll(conditions, {
        orderBy: 'last_activity_at DESC',
        ...options
      });
    } catch (error) {
      logger.error(`Error finding active sessions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Update session activity
   * @param {string} sessionId - Session ID
   * @param {object} activityData - Activity data
   * @returns {Promise<object>} Updated session
   */
  async updateActivity(sessionId, activityData = {}) {
    try {
      const session = await this.findBySessionId(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const updateData = {
        last_activity_at: new Date(),
        last_accessed: new Date(),
        updated_at: new Date(),
        ...activityData
      };

      // Calculate duration if session has a start time
      if (session.created_at) {
        const durationSeconds = Math.floor((new Date() - new Date(session.created_at)) / 1000);
        updateData.duration = this.secondsToDecimalDuration(durationSeconds);
      }

      return await this.update(session.id, updateData);
    } catch (error) {
      logger.error(`Error updating session activity ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * End a session
   * @param {string} sessionId - Session ID
   * @param {string} endReason - Reason for ending (optional)
   * @returns {Promise<object>} Updated session
   */
  async endSession(sessionId, endReason = 'user_logout') {
    try {
      const session = await this.findBySessionId(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const now = new Date();
      const durationSeconds = session.created_at ? 
        Math.floor((now - new Date(session.created_at)) / 1000) : 0;

      const updateData = {
        is_active: false,
        status: 'logged_out',
        ended_at: now,
        duration: this.secondsToDecimalDuration(durationSeconds),
        updated_at: now
      };

      const updatedSession = await this.update(session.id, updateData);
      logger.info(`Session ended: ${sessionId} (${endReason})`);
      
      return updatedSession;
    } catch (error) {
      logger.error(`Error ending session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup expired sessions
   * @param {number} maxAgeHours - Maximum age in hours (default: 24)
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  async cleanupExpiredSessions(maxAgeHours = 24) {
    try {
      const cutoffTime = new Date();
      cutoffTime.setHours(cutoffTime.getHours() - maxAgeHours);

      const query = `
        UPDATE ${this.tableName} 
        SET is_active = false, 
            status = 'expired',
            ended_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE is_active = true 
        AND (last_activity_at < $1 OR created_at < $1)
        RETURNING id
      `;

      const result = await database.query(query, [cutoffTime]);
      const cleanedCount = result.rows.length;

      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} expired sessions older than ${maxAgeHours} hours`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired sessions:', error);
      throw error;
    }
  }

  /**
   * Get session statistics for a user
   * @param {number} userId - User ID
   * @param {number} days - Number of days to look back (default: 30)
   * @returns {Promise<object>} Session statistics
   */
  async getUserSessionStats(userId, days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sessions,
          COUNT(CASE WHEN ended_at IS NOT NULL THEN 1 END) as completed_sessions,
          AVG(duration) as avg_duration_hours,
          MAX(duration) as max_duration_hours,
          COUNT(DISTINCT DATE(created_at)) as active_days
        FROM ${this.tableName}
        WHERE users_id = $1 
        AND created_at >= $2
      `;

      const result = await database.query(query, [userId, startDate]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting session stats for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Normalize login method to ensure PostgreSQL compatibility
   * @param {string} method - Original login method
   * @returns {string} Normalized login method
   */
  normalizeLoginMethod(method) {
    const methodMap = {
      'email_signup': 'email',
      'google_signup': 'google',
      'apple_signup': 'apple',
      'microsoft_signup': 'microsoft',
      'social': 'email'
    };

    return methodMap[method] || method || 'email';
  }

  /**
   * Normalize device type to ensure PostgreSQL compatibility
   * @param {string} deviceType - Original device type
   * @returns {string} Normalized device type
   */
  normalizeDeviceType(deviceType) {
    const deviceMap = {
      'Desktop': 'desktop',
      'Mobile': 'mobile',
      'Tablet': 'tablet'
    };

    return deviceMap[deviceType] || 'desktop';
  }

  /**
   * Normalize status to ensure PostgreSQL compatibility
   * @param {string} status - Original status
   * @returns {string} Normalized status
   */
  normalizeStatus(status) {
    const statusMap = {
      'active': 'active',
      'expired': 'expired',
      'logged_out': 'logged_out'
    };

    return statusMap[status] || 'active';
  }

  /**
   * Convert seconds to DECIMAL(5,2) hours.minutes format
   * @param {number} seconds - Duration in seconds
   * @returns {number} Duration in hours.minutes format (e.g., 2.30 = 2h 30m)
   */
  secondsToDecimalDuration(seconds) {
    if (!seconds || seconds <= 0) return 0.00;

    const totalMinutes = Math.floor(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // Format as decimal: hours + (minutes/100)
    // This allows easy aggregation in PostgreSQL
    return parseFloat((hours + (minutes / 100)).toFixed(2));
  }

  /**
   * Get active session count for a user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of active sessions
   */
  async getActiveSessionCount(userId) {
    try {
      const query = `
        SELECT COUNT(*) as count 
        FROM ${this.tableName} 
        WHERE users_id = $1 AND is_active = true AND status = 'active'
      `;

      const result = await database.query(query, [userId]);
      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(`Error getting active session count for user ${userId}:`, error);
      return 0;
    }
  }

  /**
   * Find sessions by IP address (for security analysis)
   * @param {string} ipAddress - IP address
   * @param {object} options - Query options
   * @returns {Promise<Array>} Sessions from IP
   */
  async findByIpAddress(ipAddress, options = {}) {
    try {
      return await this.findByField('ip_address', ipAddress, options);
    } catch (error) {
      logger.error(`Error finding sessions by IP ${ipAddress}:`, error);
      throw error;
    }
  }
}

module.exports = Sessions;