const { logger } = require('../utils');
const database = require('./database.service');
const videoProcessing = require('./video-processing.service');

class ProcessingQueueService {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.retryDelays = [1000, 5000, 15000, 60000, 300000]; // Exponential backoff
  }

  /**
   * Add item to processing queue
   * @param {string} videoId - Video record ID
   * @param {string} taskType - Type of task to process
   * @param {number} priority - Task priority (higher = more important)
   * @returns {Object} Queue item
   */
  async addToQueue(videoId, taskType, priority = 1) {
    try {
      logger.info(`Adding to queue: ${taskType} for video ${videoId}`, { priority });

      // Check if Processing Queue table exists
      const hasQueueTable = await this.hasProcessingQueueTable();
      
      if (hasQueueTable) {
        // Add to PostgreSQL processing queue
        const queueItem = await database.create('processing_queue', {
          video_id: videoId, // Foreign key to videos table
          task_type: taskType,
          status: 'queued',
          priority: priority,
          retry_count: 0,
          created_at: new Date().toISOString()
        });

        logger.info(`Added to processing queue: ${queueItem.id}`, { taskType, videoId });
        
        // Start processing if not already running
        this.startProcessing();
        
        return {
          id: queueItem.id,
          videoId,
          taskType,
          status: 'queued',
          priority
        };
      } else {
        // Fallback: direct processing if queue table doesn't exist
        logger.warn('Processing Queue table not available, processing directly');
        await this.processDirectly(videoId, taskType);
        
        return {
          id: `direct-${Date.now()}`,
          videoId,
          taskType,
          status: 'processing',
          priority,
          direct: true
        };
      }

    } catch (error) {
      logger.error('Error adding to queue:', error);
      throw new Error(`Failed to add to processing queue: ${error.message}`);
    }
  }

  /**
   * Process next item in queue
   * @returns {Object|null} Processing result or null if no items
   */
  async processNextItem() {
    try {
      if (!await this.hasProcessingQueueTable()) {
        return null;
      }

      // Get highest priority queued item using PostgreSQL WHERE clause
      const queuedItems = await database.query(`
        SELECT * FROM processing_queue 
        WHERE status = 'queued' 
        ORDER BY priority DESC, created_at ASC 
        LIMIT 1
      `);

      if (!queuedItems.rows || queuedItems.rows.length === 0) {
        return null;
      }

      const queueItem = queuedItems.rows[0];
      const { video_id, task_type } = queueItem;
      
      logger.info(`Processing queue item: ${queueItem.id}`, { 
        taskType: task_type,
        videoId: video_id
      });

      // Mark as processing
      await database.update('processing_queue', queueItem.id, {
        status: 'processing',
        started_at: new Date().toISOString()
      });

      try {
        // Process the task
        await this.executeTask(video_id, task_type);

        // Mark as completed
        await database.update('processing_queue', queueItem.id, {
          status: 'completed',
          completed_at: new Date().toISOString()
        });

        logger.info(`Queue item completed: ${queueItem.id}`, { taskType: task_type });
        
        return {
          id: queueItem.id,
          videoId: video_id,
          taskType: task_type,
          status: 'completed'
        };

      } catch (taskError) {
        logger.error(`Queue item failed: ${queueItem.id}`, taskError);
        
        const retryCount = (queueItem.retry_count || 0) + 1;
        const shouldRetry = retryCount <= 3;

        if (shouldRetry) {
          // Schedule retry
          await database.update('processing_queue', queueItem.id, {
            status: 'queued',
            retry_count: retryCount,
            error_message: taskError.message
          });
          
          logger.info(`Queue item will retry: ${queueItem.id}`, { retryCount });
        } else {
          // Mark as failed
          await database.update('processing_queue', queueItem.id, {
            status: 'failed',
            error_message: taskError.message,
            completed_at: new Date().toISOString()
          });
          
          logger.error(`Queue item permanently failed: ${queueItem.id}`);
        }

        throw taskError;
      }

    } catch (error) {
      logger.error('Error processing queue item:', error);
      return null;
    }
  }

  /**
   * Execute specific task
   * @param {string} videoId - Video ID
   * @param {string} taskType - Task type
   */
  async executeTask(videoId, taskType) {
    try {
      switch (taskType) {
      case 'extract_metadata':
        await this.executeMetadataExtraction(videoId);
        break;
          
      case 'generate_summary':
        await this.executeGenerateSummary(videoId);
        break;
          
      case 'generate_titles':
        await this.executeGenerateTitles(videoId);
        break;
          
      case 'generate_thumbnails':
        await this.executeGenerateThumbnails(videoId);
        break;
          
      default:
        throw new Error(`Unknown task type: ${taskType}`);
      }
    } catch (error) {
      logger.error(`Task execution failed: ${taskType}`, error);
      throw error;
    }
  }

  /**
   * Start background processing
   */
  startProcessing() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    logger.info('Starting background processing');

    // Process queue every 10 seconds
    this.processingInterval = setInterval(async () => {
      try {
        const result = await this.processNextItem();
        if (!result) {
          // No items to process, reduce frequency
          clearInterval(this.processingInterval);
          this.processingInterval = setTimeout(() => {
            this.startProcessing();
          }, 30000); // Check again in 30 seconds
        }
      } catch (error) {
        logger.error('Background processing error:', error);
      }
    }, 10000);
  }

  /**
   * Stop background processing
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    logger.info('Stopped background processing');
  }

  /**
   * Retry failed tasks
   * @returns {number} Number of tasks retried
   */
  async retryFailedTasks() {
    try {
      if (!await this.hasProcessingQueueTable()) {
        return 0;
      }

      // Get failed tasks that haven't exceeded retry limit using PostgreSQL
      const failedItems = await database.query(`
        SELECT * FROM processing_queue 
        WHERE status = 'failed' AND retry_count < 3 
        ORDER BY created_at ASC
      `);

      let retriedCount = 0;

      for (const item of failedItems.rows) {
        try {
          await database.update('processing_queue', item.id, {
            status: 'queued',
            error_message: ''
          });
          retriedCount++;
        } catch (updateError) {
          logger.error(`Failed to retry queue item ${item.id}:`, updateError);
        }
      }

      if (retriedCount > 0) {
        logger.info(`Retried ${retriedCount} failed tasks`);
        this.startProcessing(); // Ensure processing is running
      }

      return retriedCount;

    } catch (error) {
      logger.error('Error retrying failed tasks:', error);
      return 0;
    }
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  async getQueueStatus() {
    try {
      if (!await this.hasProcessingQueueTable()) {
        return {
          available: false,
          message: 'Processing Queue table not available'
        };
      }

      // Get queue statistics
      const [queued, processing, completed, failed] = await Promise.all([
        this.getQueueCount('queued'),
        this.getQueueCount('processing'),
        this.getQueueCount('completed'),
        this.getQueueCount('failed')
      ]);

      return {
        available: true,
        isProcessing: this.isProcessing,
        counts: {
          queued,
          processing,
          completed,
          failed,
          total: queued + processing + completed + failed
        },
        lastUpdate: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error getting queue status:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  /**
   * Clear completed tasks (cleanup)
   * @returns {number} Number of tasks cleared
   */
  async clearCompletedTasks() {
    try {
      if (!await this.hasProcessingQueueTable()) {
        return 0;
      }

      // Get completed tasks older than 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const completedItems = await database.query(`
        SELECT * FROM processing_queue 
        WHERE status = 'completed' AND completed_at < $1
      `, [oneDayAgo]);

      let clearedCount = 0;

      for (const item of completedItems.rows) {
        try {
          await database.delete('processing_queue', item.id);
          clearedCount++;
        } catch (deleteError) {
          logger.error(`Failed to delete completed task ${item.id}:`, deleteError);
        }
      }

      if (clearedCount > 0) {
        logger.info(`Cleared ${clearedCount} completed tasks`);
      }

      return clearedCount;

    } catch (error) {
      logger.error('Error clearing completed tasks:', error);
      return 0;
    }
  }

  // Helper methods

  /**
   * Check if Processing Queue table exists
   * @returns {boolean} True if table exists
   */
  async hasProcessingQueueTable() {
    try {
      await database.query('SELECT 1 FROM processing_queue LIMIT 1');
      return true;
    } catch (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get count of queue items by status
   * @param {string} status - Status to count
   * @returns {number} Count
   */
  async getQueueCount(status) {
    try {
      const result = await database.query(`
        SELECT COUNT(*) as count FROM processing_queue WHERE status = $1
      `, [status]);
      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      logger.warn(`Error counting ${status} items:`, error.message);
      return 0;
    }
  }

  /**
   * Process directly without queue (fallback)
   * @param {string} videoId - Video ID
   * @param {string} taskType - Task type
   */
  async processDirectly(videoId, taskType) {
    try {
      logger.info(`Processing directly: ${taskType} for video ${videoId}`);
      
      if (taskType === 'full_processing') {
        await videoProcessing.processVideo(videoId);
      } else {
        await this.executeTask(videoId, taskType);
      }
      
    } catch (error) {
      logger.error('Direct processing failed:', error);
      throw error;
    }
  }

  // Task execution methods

  async executeMetadataExtraction(videoId) {
    const videoRecord = await database.findById('videos', videoId);
    const videoData = videoRecord?.fields || videoRecord; // Handle both database service formatted records and direct PostgreSQL rows
    const metadata = await videoProcessing.extractMetadata(videoData.youtube_url);
    await videoProcessing.updateVideoWithMetadata(videoId, metadata);
  }

  async executeGenerateSummary(videoId) {
    const videoRecord = await database.findById('videos', videoId);
    const videoData = videoRecord?.fields || videoRecord; // Handle both database service formatted records and direct PostgreSQL rows
    const summary = await videoProcessing.generateSummary(videoData);
    
    const currentFields = await videoProcessing.getCurrentTableFields('videos');
    if (currentFields.includes('ai_summary')) {
      await database.update('videos', videoId, { ai_summary: summary });
    }
  }

  async executeGenerateTitles(videoId) {
    const videoRecord = await database.findById('videos', videoId);
    const videoData = videoRecord?.fields || videoRecord; // Handle both database service formatted records and direct PostgreSQL rows
    const titles = await videoProcessing.generateTitles(videoData);
    
    const currentFields = await videoProcessing.getCurrentTableFields('videos');
    if (currentFields.includes('ai_title_suggestions')) {
      await database.update('videos', videoId, { 
        ai_title_suggestions: JSON.stringify(titles) 
      });
    }
  }

  async executeGenerateThumbnails(videoId) {
    const videoRecord = await database.findById('videos', videoId);
    const videoData = videoRecord?.fields || videoRecord; // Handle both database service formatted records and direct PostgreSQL rows
    const thumbnails = await videoProcessing.generateThumbnailConcepts(videoData);
    
    const currentFields = await videoProcessing.getCurrentTableFields('videos');
    if (currentFields.includes('ai_thumbnail_suggestions')) {
      await database.update('videos', videoId, { 
        ai_thumbnail_suggestions: JSON.stringify(thumbnails) 
      });
    }
  }
}

module.exports = new ProcessingQueueService();