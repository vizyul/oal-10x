const { logger } = require('../utils');
const { EventEmitter } = require('events');

class ProcessingStatusService extends EventEmitter {
  constructor() {
    super();
    this.processingVideos = new Map(); // videoId -> status object
    this.userSessions = new Map(); // userId -> Set of active sessions
  }

  /**
   * Initialize processing status for a video
   * @param {string} videoId - YouTube video ID
   * @param {string} videoRecordId - Airtable record ID
   * @param {string} videoTitle - Video title
   * @param {string} userId - User ID
   * @param {Array} contentTypes - Content types to generate
   */
  initializeVideoProcessing(videoId, videoRecordId, videoTitle, userId, contentTypes = []) {
    const status = {
      videoId,
      videoRecordId,
      videoTitle,
      userId,
      startTime: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      transcript: { status: 'pending', completedAt: null },
      content: {}
    };

    // Initialize content type statuses
    const allContentTypes = ['summary_text', 'study_guide_text', 'discussion_guide_text', 'group_guide_text', 'social_media_text', 'quiz_text', 'chapters_text'];
    
    allContentTypes.forEach(contentType => {
      status.content[contentType] = {
        status: contentTypes.includes(contentType) ? 'pending' : 'skipped',
        completedAt: null,
        error: null
      };
    });

    this.processingVideos.set(videoId, status);
    
    logger.info(`Initialized processing status for video ${videoId}`, {
      userId,
      contentTypes: contentTypes.length,
      recordId: videoRecordId
    });

    // Emit status update to connected clients
    this.emitStatusUpdate(userId, videoId, status);
    
    return status;
  }

  /**
   * Update transcript status
   * @param {string} videoId - Video ID
   * @param {string} status - Status ('pending', 'completed', 'failed')
   * @param {string} error - Error message if failed
   */
  updateTranscriptStatus(videoId, status, error = null) {
    const videoStatus = this.processingVideos.get(videoId);
    if (!videoStatus) {
      logger.warn(`No video status found for ${videoId} when updating transcript`);
      return;
    }

    videoStatus.transcript.status = status;
    videoStatus.transcript.completedAt = status === 'completed' ? new Date().toISOString() : null;
    videoStatus.transcript.error = error;
    videoStatus.lastUpdate = new Date().toISOString();

    this.processingVideos.set(videoId, videoStatus);
    
    logger.debug(`Updated transcript status for ${videoId}: ${status}`);
    this.emitStatusUpdate(videoStatus.userId, videoId, videoStatus);
  }

  /**
   * Update content generation status
   * @param {string} videoId - Video ID
   * @param {string} contentType - Content type
   * @param {string} status - Status ('pending', 'completed', 'failed')
   * @param {string} error - Error message if failed
   */
  updateContentStatus(videoId, contentType, status, error = null) {
    const videoStatus = this.processingVideos.get(videoId);
    if (!videoStatus) {
      logger.warn(`No video status found for ${videoId} when updating ${contentType}`);
      return;
    }
    
    if (!videoStatus.content[contentType]) {
      logger.warn(`Content type ${contentType} not found for video ${videoId}. Available: ${Object.keys(videoStatus.content)}`);
      return;
    }

    videoStatus.content[contentType].status = status;
    videoStatus.content[contentType].completedAt = status === 'completed' ? new Date().toISOString() : null;
    videoStatus.content[contentType].error = error;
    videoStatus.lastUpdate = new Date().toISOString();

    this.processingVideos.set(videoId, videoStatus);
    
    logger.debug(`Updated ${contentType} status for ${videoId}: ${status}`);
    this.emitStatusUpdate(videoStatus.userId, videoId, videoStatus);
    
    // Check if all processing is complete
    this.checkVideoCompletion(videoId);
  }

  /**
   * Check if video processing is complete and mark as done
   * @param {string} videoId - Video ID
   */
  checkVideoCompletion(videoId) {
    const videoStatus = this.processingVideos.get(videoId);
    if (!videoStatus || videoStatus.completed) return;

    // Check if transcript and all active content types are completed
    const transcriptComplete = videoStatus.transcript.status === 'completed';
    const contentComplete = Object.values(videoStatus.content).every(content => 
      content.status === 'completed' || content.status === 'skipped' || content.status === 'failed'
    );

    if (transcriptComplete && contentComplete) {
      logger.info(`All processing completed for video ${videoId}`);
      this.completeVideoProcessing(videoId);
      
      // Update video status in database and deduct from subscription
      this.finalizeVideoProcessing(videoStatus);
    }
  }

  /**
   * Mark video processing as complete
   * @param {string} videoId - Video ID
   */
  completeVideoProcessing(videoId) {
    const videoStatus = this.processingVideos.get(videoId);
    if (!videoStatus) return;

    videoStatus.completed = true;
    videoStatus.completedAt = new Date().toISOString();
    videoStatus.lastUpdate = new Date().toISOString();

    this.processingVideos.set(videoId, videoStatus);
    
    logger.info(`Completed processing for video ${videoId}`);
    this.emitStatusUpdate(videoStatus.userId, videoId, videoStatus);

    // Auto-cleanup after 30 minutes
    setTimeout(() => {
      this.processingVideos.delete(videoId);
      logger.debug(`Cleaned up processing status for video ${videoId}`);
    }, 30 * 60 * 1000);
  }

  /**
   * Get processing status for a specific video
   * @param {string} videoId - Video ID
   * @returns {Object|null} Status object or null
   */
  getVideoStatus(videoId) {
    return this.processingVideos.get(videoId) || null;
  }

  /**
   * Get all processing videos for a user
   * @param {string} userId - User ID
   * @returns {Array} Array of status objects
   */
  getUserProcessingVideos(userId) {
    const userVideos = [];
    
    this.processingVideos.forEach((status) => {
      if (status.userId === userId) {
        // Include videos that have any pending processing or were recently started
        const hasActiveProcessing = !status.completed && (
          status.transcript.status === 'pending' ||
          Object.values(status.content).some(content => content.status === 'pending')
        );
        
        // Also include recently completed videos (within last 5 minutes) for user feedback
        const isRecentlyProcessed = status.completed && 
          (Date.now() - new Date(status.completedAt).getTime()) < 5 * 60 * 1000;
        
        if (hasActiveProcessing || isRecentlyProcessed) {
          userVideos.push(status);
        }
      }
    });

    return userVideos.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }

  /**
   * Register a user session for real-time updates
   * @param {string} userId - User ID
   * @param {Object} session - Session object (like Socket.IO socket)
   */
  registerUserSession(userId, session) {
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    
    this.userSessions.get(userId).add(session);
    
    // Send current status for all user's processing videos
    const processingVideos = this.getUserProcessingVideos(userId);
    processingVideos.forEach(status => {
      session.emit('processing-status-update', {
        videoId: status.videoId,
        status: status
      });
    });

    logger.debug(`Registered session for user ${userId}`);
  }

  /**
   * Unregister a user session
   * @param {string} userId - User ID
   * @param {Object} session - Session object
   */
  unregisterUserSession(userId, session) {
    const userSessions = this.userSessions.get(userId);
    if (userSessions) {
      userSessions.delete(session);
      if (userSessions.size === 0) {
        this.userSessions.delete(userId);
      }
    }
    
    logger.debug(`Unregistered session for user ${userId}`);
  }

  /**
   * Emit status update to all user sessions
   * @param {string} userId - User ID
   * @param {string} videoId - Video ID
   * @param {Object} status - Status object
   */
  emitStatusUpdate(userId, videoId, status) {
    const userSessions = this.userSessions.get(userId);
    if (!userSessions) {
      logger.debug(`No user sessions found for user ${userId} when emitting status update`);
      return;
    }

    const updateData = {
      videoId,
      status: status
    };

    userSessions.forEach(session => {
      try {
        if (session && typeof session.emit === 'function') {
          session.emit('processing-status-update', updateData);
          logger.debug(`Emitted status update for ${videoId} to user ${userId}`);
        }
      } catch (error) {
        logger.warn(`Failed to emit status update to session:`, error.message);
        this.unregisterUserSession(userId, session);
      }
    });
  }

  /**
   * Get processing statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    let totalVideos = 0;
    let completedVideos = 0;
    let processingVideos = 0;
    let failedVideos = 0;

    this.processingVideos.forEach(status => {
      totalVideos++;
      if (status.completed) {
        completedVideos++;
      } else {
        processingVideos++;
      }

      // Count failed content types
      Object.values(status.content).forEach(contentStatus => {
        if (contentStatus.status === 'failed') {
          failedVideos++;
        }
      });
    });

    return {
      totalVideos,
      completedVideos,
      processingVideos,
      failedVideos,
      activeSessions: Array.from(this.userSessions.values()).reduce((total, sessions) => total + sessions.size, 0)
    };
  }

  /**
   * Clean up old processing records
   * @param {number} maxAgeHours - Maximum age in hours (default: 2)
   */
  cleanup(maxAgeHours = 2) {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    let cleanedCount = 0;

    this.processingVideos.forEach((status, videoId) => {
      const lastUpdate = new Date(status.lastUpdate);
      if (lastUpdate < cutoffTime) {
        this.processingVideos.delete(videoId);
        cleanedCount++;
      }
    });

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} old processing records`);
    }

    return cleanedCount;
  }

  /**
   * Finalize video processing - update database status and deduct from subscription
   * @param {Object} videoStatus - Video status object
   */
  async finalizeVideoProcessing(videoStatus) {
    try {
      const { videoId, videoRecordId, userId } = videoStatus;
      
      // Update video status to completed in both databases
      const airtable = require('./airtable.service');
      const databaseService = require('./database.service');
      
      const updates = {
        status: 'completed',
        processed_at: new Date().toISOString()
      };
      
      // Update Airtable
      try {
        await airtable.update('Videos', videoRecordId, updates);
        logger.info(`Video ${videoId} marked as completed in Airtable`);
      } catch (error) {
        logger.error(`Failed to update video status in Airtable: ${error.message}`);
      }
      
      // Update PostgreSQL
      try {
        const postgresRecords = await databaseService.findByField('videos', 'airtable_id', videoRecordId);
        if (postgresRecords.length > 0) {
          await databaseService.update('videos', postgresRecords[0].fields.id, updates);
          logger.info(`Video ${videoId} marked as completed in PostgreSQL`);
        }
      } catch (error) {
        logger.error(`Failed to update video status in PostgreSQL: ${error.message}`);
      }
      
      // Deduct from subscription usage
      await this.deductSubscriptionUsage(userId);
      
    } catch (error) {
      logger.error(`Error finalizing video processing: ${error.message}`);
    }
  }

  /**
   * Deduct video from subscription usage
   * @param {string} userId - User ID
   */
  async deductSubscriptionUsage(userId) {
    try {
      const subscriptionService = require('./subscription.service');
      
      // Increment video usage count  
      await subscriptionService.incrementUsage(userId, 'videos', 1);
      logger.info(`Incremented video usage count for user ${userId} (+1 video)`);
      
    } catch (error) {
      logger.error(`Failed to increment subscription usage: ${error.message}`);
    }
  }
}

module.exports = new ProcessingStatusService();