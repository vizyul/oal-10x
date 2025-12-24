/**
 * Cloud Storage Controller
 * Handles OAuth flows, file uploads, and cloud storage management
 */

const cloudStorageService = require('../services/cloud-storage.service');
const cloudStorageCredentials = require('../models/CloudStorageCredentials');
const database = require('../services/database.service');
const { logger } = require('../utils');

const VALID_PROVIDERS = ['google_drive', 'onedrive', 'dropbox'];

/**
 * Validate provider parameter
 */
function validateProvider(provider) {
  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return { valid: false, error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` };
  }
  return { valid: true };
}

/**
 * Parse state from OAuth callback
 */
function parseState(stateParam) {
  try {
    return JSON.parse(Buffer.from(stateParam, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const cloudStorageController = {
  /**
   * Initiate OAuth flow for a cloud storage provider
   * GET /cloud-storage/connect/:provider
   */
  async initiateOAuth(req, res) {
    try {
      const { provider } = req.params;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const authUrl = cloudStorageService.getAuthUrl(userId, provider);

      // Redirect to provider's OAuth page
      res.redirect(authUrl);
    } catch (error) {
      logger.error('Error initiating OAuth:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate OAuth flow'
      });
    }
  },

  /**
   * Handle Google Drive OAuth callback
   * GET /cloud-storage/callback/google-drive
   */
  async handleGoogleDriveCallback(req, res) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('Google Drive OAuth error:', oauthError);
        return res.redirect('/settings/cloud-storage?error=oauth_denied');
      }

      if (!code || !state) {
        return res.redirect('/settings/cloud-storage?error=invalid_callback');
      }

      const stateData = parseState(state);
      if (!stateData || !stateData.userId) {
        return res.redirect('/settings/cloud-storage?error=invalid_state');
      }

      await cloudStorageService.handleGoogleDriveCallback(code, stateData.userId);

      res.redirect('/settings/cloud-storage?success=google_drive_connected');
    } catch (error) {
      logger.error('Error handling Google Drive callback:', error);
      res.redirect('/settings/cloud-storage?error=connection_failed');
    }
  },

  /**
   * Handle OneDrive OAuth callback
   * GET /cloud-storage/callback/onedrive
   */
  async handleOneDriveCallback(req, res) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('OneDrive OAuth error:', oauthError);
        return res.redirect('/settings/cloud-storage?error=oauth_denied');
      }

      if (!code || !state) {
        return res.redirect('/settings/cloud-storage?error=invalid_callback');
      }

      const stateData = parseState(state);
      if (!stateData || !stateData.userId) {
        return res.redirect('/settings/cloud-storage?error=invalid_state');
      }

      await cloudStorageService.handleOneDriveCallback(code, stateData.userId);

      res.redirect('/settings/cloud-storage?success=onedrive_connected');
    } catch (error) {
      logger.error('Error handling OneDrive callback:', error);
      res.redirect('/settings/cloud-storage?error=connection_failed');
    }
  },

  /**
   * Handle Dropbox OAuth callback
   * GET /cloud-storage/callback/dropbox
   */
  async handleDropboxCallback(req, res) {
    try {
      const { code, state, error: oauthError } = req.query;

      if (oauthError) {
        logger.error('Dropbox OAuth error:', oauthError);
        return res.redirect('/settings/cloud-storage?error=oauth_denied');
      }

      if (!code || !state) {
        return res.redirect('/settings/cloud-storage?error=invalid_callback');
      }

      const stateData = parseState(state);
      if (!stateData || !stateData.userId) {
        return res.redirect('/settings/cloud-storage?error=invalid_state');
      }

      await cloudStorageService.handleDropboxCallback(code, stateData.userId);

      res.redirect('/settings/cloud-storage?success=dropbox_connected');
    } catch (error) {
      logger.error('Error handling Dropbox callback:', error);
      res.redirect('/settings/cloud-storage?error=connection_failed');
    }
  },

  /**
   * Disconnect a cloud storage provider
   * POST /cloud-storage/disconnect/:provider
   */
  async disconnectProvider(req, res) {
    try {
      const { provider } = req.params;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const success = await cloudStorageService.disconnect(userId, provider);

      if (success) {
        res.json({
          success: true,
          message: `Successfully disconnected ${cloudStorageService.providers[provider].name}`
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'No active connection found for this provider'
        });
      }
    } catch (error) {
      logger.error('Error disconnecting provider:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disconnect provider'
      });
    }
  },

  /**
   * Get connection status for all providers
   * GET /cloud-storage/status
   */
  async getConnectionStatus(req, res) {
    try {
      const userId = req.user.id;
      const status = await cloudStorageService.getConnectionStatus(userId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error getting connection status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get connection status'
      });
    }
  },

  /**
   * Get connection status for a specific provider
   * GET /cloud-storage/status/:provider
   */
  async getProviderStatus(req, res) {
    try {
      const { provider } = req.params;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const allStatus = await cloudStorageService.getConnectionStatus(userId);

      res.json({
        success: true,
        data: allStatus[provider]
      });
    } catch (error) {
      logger.error('Error getting provider status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get provider status'
      });
    }
  },

  /**
   * List folders in cloud storage
   * GET /cloud-storage/folders/:provider
   */
  async listFolders(req, res) {
    try {
      const { provider } = req.params;
      const { parentId } = req.query;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      let folders = [];

      if (provider === 'google_drive') {
        const drive = await cloudStorageService.getGoogleDriveClient(userId);
        const query = parentId
          ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
          : `'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

        const response = await drive.files.list({
          q: query,
          fields: 'files(id, name, webViewLink)',
          orderBy: 'name'
        });

        folders = response.data.files.map(f => ({
          id: f.id,
          name: f.name,
          webViewLink: f.webViewLink
        }));
      } else if (provider === 'onedrive') {
        const { client } = await cloudStorageService.getOneDriveClient(userId);
        const path = parentId
          ? `/me/drive/items/${parentId}/children`
          : '/me/drive/root/children';

        const response = await client.api(path)
          .filter('folder ne null')
          .select('id,name,webUrl')
          .get();

        folders = response.value.map(f => ({
          id: f.id,
          name: f.name,
          webUrl: f.webUrl
        }));
      } else if (provider === 'dropbox') {
        const dbx = await cloudStorageService.getDropboxClient(userId);
        const path = parentId || '';

        const response = await dbx.filesListFolder({ path });
        folders = response.result.entries
          .filter(e => e['.tag'] === 'folder')
          .map(f => ({
            id: f.id,
            name: f.name,
            path: f.path_display
          }));
      }

      res.json({
        success: true,
        data: folders
      });
    } catch (error) {
      logger.error('Error listing folders:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to list folders'
      });
    }
  },

  /**
   * Set root folder for uploads
   * POST /cloud-storage/folders/:provider/set-root
   */
  async setRootFolder(req, res) {
    try {
      const { provider } = req.params;
      const { folderId, folderPath, folderName } = req.body;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      const credential = await cloudStorageCredentials.getUserProviderCredential(userId, provider);
      if (!credential) {
        return res.status(404).json({
          success: false,
          message: 'Provider not connected'
        });
      }

      await cloudStorageCredentials.updateFolderConfig(credential.id, {
        rootFolderId: folderId,
        rootFolderPath: folderPath || `/${folderName}`
      });

      res.json({
        success: true,
        message: 'Root folder updated successfully'
      });
    } catch (error) {
      logger.error('Error setting root folder:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set root folder'
      });
    }
  },

  /**
   * Create a new folder
   * POST /cloud-storage/folders/:provider/create
   */
  async createFolder(req, res) {
    try {
      const { provider } = req.params;
      const { folderName, parentId } = req.body;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      if (!folderName) {
        return res.status(400).json({
          success: false,
          message: 'Folder name is required'
        });
      }

      const folder = await cloudStorageService.createFolder(userId, provider, folderName, parentId);

      res.json({
        success: true,
        data: folder
      });
    } catch (error) {
      logger.error('Error creating folder:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create folder'
      });
    }
  },

  /**
   * Upload content to cloud storage
   * POST /cloud-storage/upload/:provider
   */
  async uploadContent(req, res) {
    try {
      const { provider } = req.params;
      const { videoId, contentType, format } = req.body;
      const userId = req.user.id;

      const validation = validateProvider(provider);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.error });
      }

      if (!videoId || !contentType) {
        return res.status(400).json({
          success: false,
          message: 'Video ID and content type are required'
        });
      }

      // Get video and content
      const videoQuery = `SELECT v.*, vc.content_text
        FROM videos v
        LEFT JOIN video_content vc ON v.id = vc.video_id AND vc.content_type = $2
        WHERE v.id = $1 AND v.users_id = $3`;
      const videoResult = await database.query(videoQuery, [videoId, contentType, userId]);

      if (videoResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Video not found'
        });
      }

      const video = videoResult.rows[0];
      let contentText = video.content_text;

      // Handle transcript specially
      if (contentType === 'transcript' || contentType === 'transcript_text') {
        contentText = video.transcript_text;
      }

      if (!contentText) {
        return res.status(404).json({
          success: false,
          message: 'Content not found for this video'
        });
      }

      // Generate document
      const documentService = require('../services/document-generation.service');
      const videoTitle = video.video_title || 'Untitled Video';

      // Create folder structure (AmplifyContent/VideoTitle_Code/)
      // Pass videoId to reuse existing folder for same video
      const folder = await cloudStorageService.ensureContentFolder(userId, provider, contentType, videoTitle, videoId);

      const uploads = [];
      const formatsToUpload = format === 'both' ? ['docx', 'pdf'] : [format || 'docx'];

      for (const fmt of formatsToUpload) {
        const fileName = `${contentType.replace(/_text$/, '')}.${fmt}`;
        let fileContent, mimeType;

        if (fmt === 'docx') {
          fileContent = await documentService.generateDocx(contentText, contentType, videoTitle);
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } else {
          fileContent = await documentService.generatePdf(contentText, contentType, videoTitle);
          mimeType = 'application/pdf';
        }

        const result = await cloudStorageService.uploadFile(
          userId, provider, fileName, fileContent, mimeType,
          folder.folderPath || folder.folderId
        );

        // Track upload in database
        await database.query(`
          INSERT INTO cloud_storage_uploads (
            users_id, cloud_storage_credentials_id, videos_id,
            provider, content_type, file_format, file_name, file_size,
            cloud_file_id, cloud_file_url, cloud_folder_id, cloud_folder_path,
            status, completed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed', CURRENT_TIMESTAMP)
        `, [
          userId,
          (await cloudStorageCredentials.getUserProviderCredential(userId, provider))?.id,
          videoId,
          provider,
          contentType,
          fmt,
          fileName,
          fileContent.length,
          result.fileId,
          result.webViewLink || result.webUrl || result.sharedLink,
          folder.folderId,
          folder.folderPath
        ]);

        uploads.push({
          format: fmt,
          fileName,
          ...result
        });
      }

      res.json({
        success: true,
        message: 'Content uploaded successfully',
        data: {
          folder,
          uploads
        }
      });
    } catch (error) {
      logger.error('Error uploading content:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload content'
      });
    }
  },

  /**
   * Get upload history
   * GET /cloud-storage/uploads
   */
  async getUploadHistory(req, res) {
    try {
      const userId = req.user.id;
      const { provider, status, limit = 50, offset = 0 } = req.query;

      let query = `
        SELECT csu.*, v.video_title
        FROM cloud_storage_uploads csu
        LEFT JOIN videos v ON csu.videos_id = v.id
        WHERE csu.users_id = $1
      `;
      const params = [userId];
      let paramIndex = 2;

      if (provider) {
        query += ` AND csu.provider = $${paramIndex}`;
        params.push(provider);
        paramIndex++;
      }

      if (status) {
        query += ` AND csu.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY csu.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await database.query(query, params);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Error getting upload history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get upload history'
      });
    }
  },

  /**
   * Retry a failed upload
   * POST /cloud-storage/uploads/:uploadId/retry
   */
  async retryUpload(req, res) {
    try {
      const { uploadId } = req.params;
      const userId = req.user.id;

      // Get upload record
      const uploadQuery = `
        SELECT csu.*, v.video_title, v.transcript_text,
               vc.content_text
        FROM cloud_storage_uploads csu
        LEFT JOIN videos v ON csu.videos_id = v.id
        LEFT JOIN video_content vc ON v.id = vc.video_id AND vc.content_type = csu.content_type
        WHERE csu.id = $1 AND csu.users_id = $2
      `;
      const uploadResult = await database.query(uploadQuery, [uploadId, userId]);

      if (uploadResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Upload record not found'
        });
      }

      const upload = uploadResult.rows[0];

      if (upload.status !== 'failed') {
        return res.status(400).json({
          success: false,
          message: 'Can only retry failed uploads'
        });
      }

      if (upload.retry_count >= upload.max_retries) {
        return res.status(400).json({
          success: false,
          message: 'Maximum retry attempts reached'
        });
      }

      // Get content
      let contentText = upload.content_text;
      if (upload.content_type === 'transcript' || upload.content_type === 'transcript_text') {
        contentText = upload.transcript_text;
      }

      if (!contentText) {
        return res.status(404).json({
          success: false,
          message: 'Content no longer available'
        });
      }

      // Update status to uploading
      await database.query(
        `UPDATE cloud_storage_uploads SET status = 'uploading', retry_count = retry_count + 1 WHERE id = $1`,
        [uploadId]
      );

      // Generate and upload file
      const documentService = require('../services/document-generation.service');
      let fileContent, mimeType;

      if (upload.file_format === 'docx') {
        fileContent = await documentService.generateDocx(contentText, upload.content_type, upload.video_title);
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else {
        fileContent = await documentService.generatePdf(contentText, upload.content_type, upload.video_title);
        mimeType = 'application/pdf';
      }

      const result = await cloudStorageService.uploadFile(
        userId, upload.provider, upload.file_name, fileContent, mimeType,
        upload.cloud_folder_path || upload.cloud_folder_id
      );

      // Update upload record
      await database.query(`
        UPDATE cloud_storage_uploads
        SET status = 'completed',
            cloud_file_id = $1,
            cloud_file_url = $2,
            completed_at = CURRENT_TIMESTAMP,
            error_message = NULL
        WHERE id = $3
      `, [result.fileId, result.webViewLink || result.webUrl || result.sharedLink, uploadId]);

      res.json({
        success: true,
        message: 'Upload retry successful',
        data: result
      });
    } catch (error) {
      logger.error('Error retrying upload:', error);

      // Update error status
      await database.query(`
        UPDATE cloud_storage_uploads
        SET status = 'failed', error_message = $1
        WHERE id = $2
      `, [error.message, req.params.uploadId]);

      res.status(500).json({
        success: false,
        message: 'Failed to retry upload'
      });
    }
  },

  /**
   * Update cloud storage preferences
   * POST /cloud-storage/preferences
   */
  async updatePreferences(req, res) {
    try {
      const userId = req.user.id;
      const {
        cloudStorageProvider,
        cloudStorageAutoUpload,
        cloudStorageUploadFormat,
        cloudStorageFolderPerVideo
      } = req.body;

      // Check if user_preferences record exists
      const existingPref = await database.query(
        'SELECT id FROM user_preferences WHERE users_id = $1',
        [userId]
      );

      if (existingPref.rows.length > 0) {
        await database.query(`
          UPDATE user_preferences SET
            cloud_storage_provider = COALESCE($1, cloud_storage_provider),
            cloud_storage_auto_upload = COALESCE($2, cloud_storage_auto_upload),
            cloud_storage_upload_format = COALESCE($3, cloud_storage_upload_format),
            cloud_storage_folder_per_video = COALESCE($4, cloud_storage_folder_per_video),
            updated_at = CURRENT_TIMESTAMP
          WHERE users_id = $5
        `, [cloudStorageProvider, cloudStorageAutoUpload, cloudStorageUploadFormat, cloudStorageFolderPerVideo, userId]);
      } else {
        await database.query(`
          INSERT INTO user_preferences (users_id, cloud_storage_provider, cloud_storage_auto_upload, cloud_storage_upload_format, cloud_storage_folder_per_video)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, cloudStorageProvider, cloudStorageAutoUpload || false, cloudStorageUploadFormat || 'both', cloudStorageFolderPerVideo !== false]);
      }

      res.json({
        success: true,
        message: 'Preferences updated successfully'
      });
    } catch (error) {
      logger.error('Error updating preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update preferences'
      });
    }
  },

  /**
   * Get cloud storage preferences
   * GET /cloud-storage/preferences
   */
  async getPreferences(req, res) {
    try {
      const userId = req.user.id;

      const result = await database.query(`
        SELECT cloud_storage_provider, cloud_storage_auto_upload,
               cloud_storage_upload_format, cloud_storage_folder_per_video
        FROM user_preferences
        WHERE users_id = $1
      `, [userId]);

      const prefs = result.rows[0] || {
        cloud_storage_provider: null,
        cloud_storage_auto_upload: false,
        cloud_storage_upload_format: 'both',
        cloud_storage_folder_per_video: true
      };

      res.json({
        success: true,
        data: prefs
      });
    } catch (error) {
      logger.error('Error getting preferences:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get preferences'
      });
    }
  }
};

module.exports = cloudStorageController;
