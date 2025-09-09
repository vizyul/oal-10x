const database = require('./database.service');
const { logger } = require('../utils');
const crypto = require('crypto');

class SessionService {
  constructor() {
    this.tableName = 'sessions'; // PostgreSQL table name
  }

  /**
   * Generate a unique session ID
   * @returns {string} Unique session ID
   */
  generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Normalize login method to ensure PostgreSQL compatibility
   * @param {string} method - Original login method
   * @returns {string} Normalized login method
   */
  normalizeLoginMethod(method) {
    // Map various method names to simple, compatible values
    const methodMap = {
      'email_signup': 'email',
      'google_signup': 'google',
      'apple_signup': 'apple',
      'microsoft_signup': 'microsoft',
      'social': 'email' // fallback for social verification
    };

    return methodMap[method] || method || 'email';
  }

  /**
   * Normalize device type to ensure PostgreSQL compatibility
   * @param {string} deviceType - Original device type
   * @returns {string} Normalized device type
   */
  normalizeDeviceType(deviceType) {
    // Map device types to simple values
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
    // Map status values to simple values
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
    // Using /100 to keep minutes in 0-59 range as decimals
    return parseFloat((hours + (minutes / 100)).toFixed(2));
  }

  /**
   * Attempt to get timezone from request (basic detection)
   * @param {Object} req - Express request object
   * @returns {string} Detected timezone or empty string
   */
  getTimezoneFromRequest(req) {
    // Try to detect timezone from various sources
    try {
      // Check if timezone was sent in headers (would need to be set by frontend)
      if (req.get('Timezone')) {
        return req.get('Timezone');
      }

      // Check if timezone was sent in request body
      if (req.body && req.body.timezone) {
        return req.body.timezone;
      }

      // Basic timezone guessing based on IP geolocation (very rough)
      const acceptLanguage = req.get('Accept-Language');
      if (acceptLanguage) {
        // Very basic timezone guessing based on language preferences
        if (acceptLanguage.includes('en-US')) return 'America/New_York';
        if (acceptLanguage.includes('en-GB')) return 'Europe/London';
        if (acceptLanguage.includes('fr')) return 'Europe/Paris';
        if (acceptLanguage.includes('de')) return 'Europe/Berlin';
        if (acceptLanguage.includes('ja')) return 'Asia/Tokyo';
        // Add more as needed
      }

      return '';
    } catch (error) {
      logger.error('Error detecting timezone:', error);
      return '';
    }
  }

  /**
   * Get device information from request
   * @param {Object} req - Express request object
   * @returns {Object} Device information
   */
  getDeviceInfo(req) {
    const userAgent = req.get('User-Agent') || '';
    const ip = req.ip || req.connection.remoteAddress || '';

    // Simple browser detection
    let browser = 'Unknown';
    if (userAgent.includes('Chrome/')) browser = 'Chrome';
    else if (userAgent.includes('Firefox/')) browser = 'Firefox';
    else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) browser = 'Safari';
    else if (userAgent.includes('Edge/')) browser = 'Edge';

    // Simple OS detection
    let os = 'Unknown';
    if (userAgent.includes('Windows')) os = 'Windows';
    else if (userAgent.includes('Macintosh')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('iPhone')) os = 'iOS';
    else if (userAgent.includes('Android')) os = 'Android';

    // Simple device type detection
    let deviceType = 'Desktop';
    if (userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('Android')) {
      deviceType = 'Mobile';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      deviceType = 'Tablet';
    }

    return {
      ip,
      userAgent,
      browser,
      os,
      deviceType
    };
  }

  /**
   * Create a new session record
   * @param {Object} sessionData - Session data
   * @returns {Promise<Object>} Created session record
   */
  async createSession(sessionData) {
    try {
      logger.info('Creating new session record in PostgreSQL');

      if (!database.pool) {
        logger.warn('PostgreSQL not configured - cannot create session');
        return null;
      }

      // Resolve user ID if needed - handle both camelCase and snake_case
      let userId = sessionData.userId || sessionData.users_id;
      const userEmail = sessionData.userEmail || sessionData.user_email;
      
      if (!userId && userEmail) {
        const authService = require('./auth.service');
        const user = await authService.findUserByEmail(userEmail);
        if (user) {
          userId = user.id;
        }
      }

      // Map session data to PostgreSQL fields (now with all required columns)
      const fields = {
        session_id: sessionData.sessionId || sessionData.session_id || this.generateSessionId(),
        users_id: userId,
        user_email: userEmail,
        login_method: this.normalizeLoginMethod(sessionData.loginMethod || sessionData.login_method),
        ip_address: sessionData.ipAddress || sessionData.ip_address,
        user_agent: sessionData.userAgent || sessionData.user_agent,
        device_type: this.normalizeDeviceType(sessionData.deviceType || sessionData.device_type),
        browser: sessionData.browser,
        os: sessionData.os,
        status: this.normalizeStatus(sessionData.status || 'active'),
        is_active: true,
        last_accessed: sessionData.lastActivityAt || sessionData.startedAt,
        last_activity_at: sessionData.lastActivityAt || sessionData.startedAt,
        location: sessionData.location || '',
        timezone: sessionData.timezone || '',
        duration: 0.00 // Initialize duration as 0.00 for active sessions
      };

      const record = await database.create(this.tableName, fields);
      logger.info(`Session created successfully: ${record.id}`);

      return this.formatSessionRecord(record);
    } catch (error) {
      logger.error('Error creating session:', error);

      // Don't throw error to avoid breaking auth flow
      return null;
    }
  }

  /**
   * Update session record
   * @param {string} sessionId - Session ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated session record
   */
  async updateSession(sessionId, updateData) {
    try {
      logger.info(`Updating session: ${sessionId}`);

      if (!database.pool) {
        logger.warn('PostgreSQL not configured - cannot update session');
        return null;
      }

      // Find session by session_id
      const sessions = await database.findByField(this.tableName, 'session_id', sessionId);

      if (sessions.length === 0) {
        logger.warn(`Session not found: ${sessionId}`);
        return null;
      }

      const sessionRecord = sessions[0];

      // Map update data to PostgreSQL fields
      const mappedData = {};
      if (updateData.lastActivityAt) mappedData['last_activity_at'] = updateData.lastActivityAt;
      if (updateData.endedAt) mappedData['ended_at'] = updateData.endedAt;
      if (updateData.status) mappedData['status'] = updateData.status;
      if (updateData.duration !== undefined) mappedData['duration'] = updateData.duration;

      // Enhanced logging for duration debugging
      if (updateData.duration !== undefined) {
        logger.info(`Duration field debug: value=${updateData.duration}, type=${typeof updateData.duration}`);
      }

      const updatedRecord = await database.update(this.tableName, sessionRecord.id, mappedData);

      return this.formatSessionRecord(updatedRecord);
    } catch (error) {
      logger.error('Error updating session:', error);
      return null;
    }
  }

  /**
   * End a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<Object|null>} Updated session record
   */
  async endSession(sessionId) {
    try {
      logger.info(`Ending session: ${sessionId}`);

      const endedAt = new Date().toISOString();

      return await this.updateSession(sessionId, {
        endedAt,
        status: 'logged_out',
        lastActivityAt: endedAt
      });
    } catch (error) {
      logger.error('Error ending session:', error);
      return null;
    }
  }

  /**
   * Mark sessions as expired
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async expireUserSessions(userId) {
    try {
      logger.info(`Expiring sessions for user: ${userId}`);

      if (!database.pool) {
        return;
      }

      // Find active sessions for the user using SQL query
      const query = `
        SELECT session_id, created_at 
        FROM ${this.tableName} 
        WHERE users_id = $1 AND status = 'active'
      `;

      const result = await database.query(query, [userId]);
      const records = result.rows;

      const expiredAt = new Date().toISOString();

      for (const record of records) {
        const sessionId = record.session_id;
        if (sessionId) {
          // Let the database calculate duration to avoid timezone issues
          const durationQuery = `
            SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as duration_seconds
            FROM sessions 
            WHERE session_id = $1
          `;
          const durationResult = await database.query(durationQuery, [sessionId]);
          const durationSeconds = Math.round(Math.abs(durationResult.rows[0].duration_seconds));
          const duration = this.secondsToDecimalDuration(durationSeconds);

          await this.updateSession(sessionId, {
            endedAt: expiredAt,
            status: 'expired',
            lastActivityAt: expiredAt,
            duration
          });
        }
      }

      logger.info(`Expired ${records.length} sessions for user: ${userId}`);
    } catch (error) {
      logger.error('Error expiring user sessions:', error);
    }
  }

  /**
   * Record login session
   * @param {Object} user - User object
   * @param {Object} req - Express request object
   * @param {string} loginMethod - Login method (email, google, apple, microsoft)
   * @returns {Promise<Object|null>} Session record
   */
  async recordLogin(user, req, loginMethod = 'email') {
    try {
      const deviceInfo = this.getDeviceInfo(req);
      const sessionId = this.generateSessionId();
      const now = new Date().toISOString();

      const sessionData = {
        sessionId,
        userId: user.id,
        userEmail: user.email,
        loginMethod,
        ipAddress: deviceInfo.ip,
        userAgent: deviceInfo.userAgent,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        startedAt: now,
        lastActivityAt: now,
        status: 'active',
        // Get location from various possible sources
        location: req.get('CF-IPCountry') || req.get('X-Country') || req.body.country || req.body.location || '',
        // Get timezone from various possible sources
        timezone: req.get('X-Timezone') || req.body.timezone || this.getTimezoneFromRequest(req) || ''
      };

      const session = await this.createSession(sessionData);

      if (session) {
        // Store session ID in request for potential future use
        req.sessionId = sessionId;
        logger.info(`Login session recorded for ${user.email} using ${loginMethod}`);
      }

      return session;
    } catch (error) {
      logger.error('Error recording login session:', error);
      return null;
    }
  }

  /**
   * Record signup session
   * @param {Object} user - User object
   * @param {Object} req - Express request object
   * @param {string} signupMethod - Signup method (email, google, apple, microsoft)
   * @returns {Promise<Object|null>} Session record
   */
  async recordSignup(user, req, signupMethod = 'email') {
    // For signup, we use the same method as login to avoid Airtable field issues
    // The login method field will show the base method (email, google, etc.)
    return await this.recordLogin(user, req, signupMethod);
  }

  /**
   * End active sessions for a user (logout)
   * @param {string} userId - User ID
   * @returns {Promise<void>}
   */
  async endUserSessions(userId) {
    try {
      logger.info(`Ending active sessions for user: ${userId}`);

      if (!database.pool) {
        logger.warn('PostgreSQL not configured - cannot end sessions');
        return;
      }

      // Find active sessions for the user using SQL query
      const query = `
        SELECT session_id, created_at 
        FROM ${this.tableName} 
        WHERE users_id = $1 AND status = 'active'
      `;

      const result = await database.query(query, [userId]);
      const records = result.rows;

      const endedAt = new Date().toISOString();

      for (const record of records) {
        const sessionId = record.session_id;
        if (sessionId) {
          // Let the database calculate duration to avoid timezone issues
          const durationQuery = `
            SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as duration_seconds
            FROM sessions 
            WHERE session_id = $1
          `;
          const durationResult = await database.query(durationQuery, [sessionId]);
          const durationSeconds = Math.round(Math.abs(durationResult.rows[0].duration_seconds));
          const duration = this.secondsToDecimalDuration(durationSeconds);

          // Enhanced logging for duration calculation
          const hours = Math.floor(duration);
          const minutes = Math.round((duration - hours) * 100);
          logger.info(`Session ${sessionId} duration: ${durationSeconds}s = ${duration} (${hours}h ${minutes}m)`);

          await this.updateSession(sessionId, {
            endedAt: endedAt,
            status: 'logged_out',
            lastActivityAt: endedAt,
            duration
          });
        }
      }

      logger.info(`Ended ${records.length} active sessions for user: ${userId}`);
    } catch (error) {
      logger.error('Error ending user sessions:', error);
    }
  }

  /**
   * Update session activity
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async updateActivity(sessionId) {
    if (!sessionId) return;

    await this.updateSession(sessionId, {
      lastActivityAt: new Date().toISOString()
    });
  }

  /**
   * Format session record from PostgreSQL
   * @param {Object} record - PostgreSQL record
   * @returns {Object} Formatted session object
   */
  formatSessionRecord(record) {
    if (!record) {
      return null;
    }

    // Handle both database service formatted records and direct PostgreSQL rows
    const fields = record.fields || record;

    return {
      id: record.id || fields.id,
      sessionId: fields.session_id,
      userId: fields.user_id,
      userEmail: fields.user_email,
      loginMethod: fields.login_method,
      ipAddress: fields.ip_address,
      userAgent: fields.user_agent,
      deviceType: fields.device_type,
      browser: fields.browser,
      os: fields.os,
      startedAt: fields.created_at,
      lastActivityAt: fields.last_activity_at,
      endedAt: fields.ended_at,
      status: fields.status,
      duration: fields.duration,
      location: fields.location,
      timezone: fields.timezone,
      createdAt: fields.created_at,
      updatedAt: fields.updated_at
    };
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getSessionStats() {
    try {
      if (!database.pool) {
        return { total: 0, active: 0, expired: 0, loggedOut: 0 };
      }

      const query = `
        SELECT status, login_method, created_at 
        FROM ${this.tableName}
      `;

      const result = await database.query(query);
      const allSessions = result.rows;

      const stats = {
        total: allSessions.length,
        active: 0,
        expired: 0,
        loggedOut: 0,
        byMethod: {},
        last24Hours: 0
      };

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

      allSessions.forEach(record => {
        const status = record.status;
        const method = record.login_method;
        const startedAt = new Date(record.created_at);

        // Count by status
        if (status === 'active') stats.active++;
        else if (status === 'expired') stats.expired++;
        else if (status === 'logged_out') stats.loggedOut++;

        // Count by method
        if (method) {
          stats.byMethod[method] = (stats.byMethod[method] || 0) + 1;
        }

        // Count last 24 hours
        if (startedAt > yesterday) {
          stats.last24Hours++;
        }
      });

      return stats;
    } catch (error) {
      logger.error('Error getting session stats:', error);
      return { total: 0, active: 0, expired: 0, loggedOut: 0 };
    }
  }

  /**
   * Update session duration for an active session
   * @param {number|string} sessionId - Session ID
   * @returns {Promise<Object>} Updated session object
   */
  async updateSessionDuration(sessionId) {
    try {
      logger.debug(`Updating session duration for session: ${sessionId}`);

      if (!database.pool) {
        logger.warn('PostgreSQL not configured - cannot update session duration');
        return null;
      }

      // Update session with calculated duration from PostgreSQL
      const query = `
        UPDATE ${this.tableName}
        SET 
          duration = ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::numeric / 3600, 2),
          last_activity_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await database.query(query, [sessionId]);

      if (result.rows.length === 0) {
        logger.warn(`Session not found: ${sessionId}`);
        return null;
      }

      const updatedSession = result.rows[0];
      logger.debug(`Session duration updated: ${updatedSession.duration} hours`);

      return this.formatSessionRecord(updatedSession);
    } catch (error) {
      logger.error('Error updating session duration:', error);
      throw new Error('Failed to update session duration');
    }
  }
}

module.exports = new SessionService();
