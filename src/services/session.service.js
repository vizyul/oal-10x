const airtableService = require('./airtable.service');
const { logger } = require('../utils');
const crypto = require('crypto');

class SessionService {
  constructor() {
    this.tableName = 'Sessions';
  }

  /**
   * Generate a unique session ID
   * @returns {string} Unique session ID
   */
  generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Normalize login method to ensure Airtable compatibility
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
   * Normalize device type to ensure Airtable compatibility
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
   * Normalize status to ensure Airtable compatibility
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
      logger.info('Creating new session record');

      if (!airtableService.base) {
        logger.warn('Airtable not configured - cannot create session');
        return null;
      }

      // Map session data to Airtable fields with normalization
      const fields = {
        'Session ID': sessionData.sessionId,
        'User ID': sessionData.userId,
        'User Email': sessionData.userEmail,
        'Login Method': this.normalizeLoginMethod(sessionData.loginMethod),
        'IP Address': sessionData.ipAddress,
        'User Agent': sessionData.userAgent,
        'Device Type': this.normalizeDeviceType(sessionData.deviceType),
        'Browser': sessionData.browser,
        'OS': sessionData.os,
        'Started At': sessionData.startedAt,
        'Last Activity At': sessionData.lastActivityAt || sessionData.startedAt,
        'Status': this.normalizeStatus(sessionData.status || 'active'),
        'Location': sessionData.location || '',
        'Timezone': sessionData.timezone || '',
        'Duration': 0 // Initialize Duration field as 0 for active sessions
      };

      const record = await airtableService.create(this.tableName, fields);
      logger.info(`Session created successfully: ${record.id}`);
      
      return this.formatSessionRecord(record);
    } catch (error) {
      // Handle specific Airtable field errors
      if (error.message && error.message.includes('INVALID_MULTIPLE_CHOICE_OPTIONS')) {
        logger.warn(`Session creation failed due to invalid field option. Retrying with basic fields only.`, {
          originalMethod: sessionData.loginMethod,
          normalizedMethod: this.normalizeLoginMethod(sessionData.loginMethod),
          error: error.message
        });
        
        // Retry with minimal fields to avoid field restriction issues
        try {
          const basicFields = {
            'Session ID': sessionData.sessionId,
            'User ID': sessionData.userId,
            'User Email': sessionData.userEmail,
            'Started At': sessionData.startedAt,
            'Duration': 0 // Include Duration field in basic fields too
            // Exclude Status and other potentially restricted fields
          };
          
          const record = await airtableService.create(this.tableName, basicFields);
          logger.info(`Session created with basic fields: ${record.id}`);
          return this.formatSessionRecord(record);
        } catch (retryError) {
          logger.error('Failed to create session even with basic fields:', retryError);
        }
      } else {
        logger.error('Error creating session:', error);
      }
      
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

      if (!airtableService.base) {
        logger.warn('Airtable not configured - cannot update session');
        return null;
      }

      // Find session by Session ID
      const sessions = await airtableService.findByField(this.tableName, 'Session ID', sessionId);
      
      if (sessions.length === 0) {
        logger.warn(`Session not found: ${sessionId}`);
        return null;
      }

      const sessionRecord = sessions[0];
      
      // Map update data to Airtable fields
      const mappedData = {};
      if (updateData.lastActivityAt) mappedData['Last Activity At'] = updateData.lastActivityAt;
      if (updateData.endedAt) mappedData['Ended At'] = updateData.endedAt;
      if (updateData.status) mappedData['Status'] = updateData.status;
      if (updateData.duration !== undefined) mappedData['Duration'] = updateData.duration;

      // Enhanced logging for duration debugging
      if (updateData.duration !== undefined) {
        logger.info(`Duration field debug: value=${updateData.duration}, type=${typeof updateData.duration}`);
      }

      const updatedRecord = await airtableService.update(this.tableName, sessionRecord.id, mappedData);
      
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

      if (!airtableService.base) {
        return;
      }

      // Find active sessions for the user
      const records = await airtableService.base(this.tableName).select({
        filterByFormula: `AND({User ID} = "${userId}", {Status} = "active")`,
        fields: ['Session ID', 'Started At']
      }).firstPage();

      const expiredAt = new Date().toISOString();

      for (const record of records) {
        const sessionId = record.fields['Session ID'];
        if (sessionId) {
          // Calculate duration in seconds between Started At and Ended At (Airtable Duration field expects seconds)
          const startedAt = new Date(record.fields['Started At']);
          const expiredAtDate = new Date(expiredAt);
          const duration = Math.round((expiredAtDate - startedAt) / 1000); // seconds for Airtable Duration field
          
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
        // Could be enhanced with geolocation data
        location: '',
        timezone: req.get('Timezone') || ''
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

      if (!airtableService.base) {
        logger.warn('Airtable not configured - cannot end sessions');
        return;
      }

      // Find active sessions for the user
      const records = await airtableService.base(this.tableName).select({
        filterByFormula: `AND({User ID} = "${userId}", {Status} = "active")`,
        fields: ['Session ID', 'Started At']
      }).firstPage();

      const endedAt = new Date().toISOString();

      for (const record of records) {
        const sessionId = record.fields['Session ID'];
        if (sessionId) {
          // Calculate duration in seconds between Started At and Ended At (Airtable Duration field expects seconds)
          const startedAt = new Date(record.fields['Started At']);
          const endedAtDate = new Date(endedAt);
          const durationMs = endedAtDate - startedAt;
          const duration = Math.round(durationMs / 1000); // seconds for Airtable Duration field
          
          // Enhanced logging for duration calculation
          logger.info(`Session ${sessionId} duration calculation: ${durationMs}ms = ${duration} seconds`);
          
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
   * Format session record from Airtable
   * @param {Object} record - Airtable record
   * @returns {Object} Formatted session object
   */
  formatSessionRecord(record) {
    if (!record || !record.fields) {
      return null;
    }

    const fields = record.fields;
    
    return {
      id: record.id,
      sessionId: fields['Session ID'],
      userId: fields['User ID'],
      userEmail: fields['User Email'],
      loginMethod: fields['Login Method'],
      ipAddress: fields['IP Address'],
      userAgent: fields['User Agent'],
      deviceType: fields['Device Type'],
      browser: fields['Browser'],
      os: fields['OS'],
      startedAt: fields['Started At'],
      lastActivityAt: fields['Last Activity At'],
      endedAt: fields['Ended At'],
      status: fields['Status'],
      duration: fields['Duration'],
      location: fields['Location'],
      timezone: fields['Timezone']
    };
  }

  /**
   * Get session statistics
   * @returns {Promise<Object>} Session statistics
   */
  async getSessionStats() {
    try {
      if (!airtableService.base) {
        return { total: 0, active: 0, expired: 0, loggedOut: 0 };
      }

      const allSessions = await airtableService.base(this.tableName).select({
        fields: ['Status', 'Login Method', 'Started At']
      }).all();
      
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
        const fields = record.fields;
        const status = fields['Status'];
        const method = fields['Login Method'];
        const startedAt = new Date(fields['Started At']);

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
}

module.exports = new SessionService();