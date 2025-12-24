/**
 * Cloud Storage Service
 * Handles OAuth flows and file uploads for Google Drive, OneDrive, and Dropbox
 * Follows encryption pattern from youtube-oauth.service.js
 */

const crypto = require('crypto');
const { Readable } = require('stream');
const { google } = require('googleapis');
const { Client } = require('@microsoft/microsoft-graph-client');
const { Dropbox } = require('dropbox');
const cloudStorageCredentials = require('../models/CloudStorageCredentials');
const { logger } = require('../utils');

class CloudStorageService {
  constructor() {
    this.providers = {
      google_drive: {
        name: 'Google Drive',
        scopes: [
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ]
      },
      onedrive: {
        name: 'OneDrive',
        scopes: [
          'files.readwrite',
          'user.read',
          'offline_access'
        ]
      },
      dropbox: {
        name: 'Dropbox',
        scopes: [
          'files.content.write',
          'files.content.read',
          'account_info.read'
        ]
      }
    };

    // In-memory cache to prevent race conditions when multiple content types
    // are uploaded simultaneously for the same video
    // Key: `${videoId}_${provider}`, Value: folder info
    this.folderCache = new Map();
    this.folderCacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // =====================================================================
  // TOKEN ENCRYPTION / DECRYPTION
  // =====================================================================

  /**
   * Encrypt tokens for secure storage
   * @param {Object} tokens - Token object (access_token, refresh_token, etc.)
   * @returns {Object} Encrypted data with iv and algorithm
   */
  encryptTokens(tokens) {
    try {
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key || key.length !== 32) {
        throw new Error('TOKEN_ENCRYPTION_KEY must be 32 characters long');
      }

      const algorithm = 'aes-256-cbc';
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'utf8'), iv);
      let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      return {
        encrypted_tokens: encrypted,
        encryption_iv: iv.toString('hex'),
        encryption_algorithm: algorithm
      };
    } catch (error) {
      logger.error('Error encrypting cloud storage tokens:', error);
      throw new Error('Token encryption failed');
    }
  }

  /**
   * Decrypt tokens from storage
   * @param {Object} encryptedData - Object with encrypted_tokens, encryption_iv, encryption_algorithm
   * @returns {Object} Decrypted tokens
   */
  decryptTokens(encryptedData) {
    try {
      const key = process.env.TOKEN_ENCRYPTION_KEY;
      if (!key) {
        throw new Error('TOKEN_ENCRYPTION_KEY not configured');
      }

      const encryptedTokens = encryptedData.encrypted_tokens;
      const ivHex = encryptedData.encryption_iv;
      const algorithm = encryptedData.encryption_algorithm || 'aes-256-cbc';

      if (!encryptedTokens || !ivHex) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'utf8'), iv);
      let decrypted = decipher.update(encryptedTokens, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Error decrypting cloud storage tokens:', error);
      throw new Error('Token decryption failed');
    }
  }

  // =====================================================================
  // GOOGLE DRIVE
  // =====================================================================

  /**
   * Get Google OAuth2 client
   * @returns {OAuth2Client}
   */
  getGoogleOAuth2Client() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET,
      process.env.GOOGLE_DRIVE_REDIRECT_URI
    );
  }

  /**
   * Get Google Drive authorization URL
   * @param {number} userId - User ID for state parameter
   * @returns {string} Authorization URL
   */
  getGoogleDriveAuthUrl(userId) {
    const oauth2Client = this.getGoogleOAuth2Client();

    const state = Buffer.from(JSON.stringify({
      userId,
      provider: 'google_drive',
      timestamp: Date.now()
    })).toString('base64');

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.providers.google_drive.scopes,
      state,
      prompt: 'consent' // Force consent to always get refresh token
    });
  }

  /**
   * Handle Google Drive OAuth callback
   * @param {string} code - Authorization code
   * @param {number} userId - User ID
   * @returns {Promise<object>} Stored credential
   */
  async handleGoogleDriveCallback(code, userId) {
    try {
      const oauth2Client = this.getGoogleOAuth2Client();
      const { tokens } = await oauth2Client.getToken(code);

      oauth2Client.setCredentials(tokens);

      // Get user info
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();

      // Encrypt tokens
      const encryptedData = this.encryptTokens(tokens);

      // Deactivate existing credentials for this provider
      await cloudStorageCredentials.deactivateUserCredentials(userId, 'google_drive');

      // Store new credentials
      const credential = await cloudStorageCredentials.createCredentials({
        users_id: userId,
        provider: 'google_drive',
        ...encryptedData,
        token_expires_at: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        account_email: userInfo.data.email,
        account_name: userInfo.data.name,
        account_id: userInfo.data.id
      });

      logger.info(`Google Drive connected for user ${userId}`);
      return credential;
    } catch (error) {
      logger.error('Error handling Google Drive callback:', error);
      throw error;
    }
  }

  /**
   * Get authenticated Google Drive client
   * @param {number} userId - User ID
   * @returns {Promise<object>} Drive client
   */
  async getGoogleDriveClient(userId) {
    const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'google_drive', true);
    if (!credential) {
      throw new Error('Google Drive not connected');
    }

    const tokens = this.decryptTokens(credential);
    const oauth2Client = this.getGoogleOAuth2Client();
    oauth2Client.setCredentials(tokens);

    // Check if token needs refresh
    if (tokens.expiry_date && Date.now() >= tokens.expiry_date - 60000) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const encryptedData = this.encryptTokens(credentials);
      await cloudStorageCredentials.updateCredentials(credential.id, {
        ...encryptedData,
        token_expires_at: credentials.expiry_date ? new Date(credentials.expiry_date) : null
      });
      oauth2Client.setCredentials(credentials);
    }

    await cloudStorageCredentials.markAsUsed(credential.id);
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  /**
   * Upload file to Google Drive
   * @param {number} userId - User ID
   * @param {string} fileName - File name
   * @param {Buffer|string} content - File content
   * @param {string} mimeType - MIME type
   * @param {string} folderId - Optional folder ID
   * @returns {Promise<object>} Upload result with file ID and URL
   */
  async uploadToGoogleDrive(userId, fileName, content, mimeType, folderId = null) {
    try {
      const drive = await this.getGoogleDriveClient(userId);

      const fileMetadata = {
        name: fileName,
        ...(folderId && { parents: [folderId] })
      };

      // Ensure content is a Buffer and create a proper readable stream
      let contentBuffer = content;
      if (!Buffer.isBuffer(content)) {
        contentBuffer = Buffer.from(content);
      }

      const media = {
        mimeType,
        body: Readable.from(contentBuffer)
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, name, webViewLink, webContentLink'
      });

      logger.info(`Uploaded ${fileName} to Google Drive for user ${userId}`);

      return {
        fileId: response.data.id,
        fileName: response.data.name,
        webViewLink: response.data.webViewLink,
        webContentLink: response.data.webContentLink
      };
    } catch (error) {
      logger.error('Error uploading to Google Drive:', error);
      const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'google_drive');
      if (credential) {
        await cloudStorageCredentials.recordError(credential.id, error.message);
      }
      throw error;
    }
  }

  /**
   * Create folder in Google Drive
   * @param {number} userId - User ID
   * @param {string} folderName - Folder name
   * @param {string} parentId - Optional parent folder ID
   * @returns {Promise<object>} Created folder info
   */
  async createGoogleDriveFolder(userId, folderName, parentId = null) {
    try {
      const drive = await this.getGoogleDriveClient(userId);

      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentId && { parents: [parentId] })
      };

      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink'
      });

      return {
        folderId: response.data.id,
        folderName: response.data.name,
        webViewLink: response.data.webViewLink
      };
    } catch (error) {
      logger.error('Error creating Google Drive folder:', error);
      throw error;
    }
  }

  // =====================================================================
  // ONEDRIVE
  // =====================================================================

  /**
   * Get OneDrive authorization URL
   * @param {number} userId - User ID for state parameter
   * @returns {string} Authorization URL
   */
  getOneDriveAuthUrl(userId) {
    const state = Buffer.from(JSON.stringify({
      userId,
      provider: 'onedrive',
      timestamp: Date.now()
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: process.env.ONEDRIVE_CLIENT_ID,
      response_type: 'code',
      redirect_uri: process.env.ONEDRIVE_REDIRECT_URI,
      scope: this.providers.onedrive.scopes.join(' '),
      state,
      response_mode: 'query'
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  /**
   * Handle OneDrive OAuth callback
   * @param {string} code - Authorization code
   * @param {number} userId - User ID
   * @returns {Promise<object>} Stored credential
   */
  async handleOneDriveCallback(code, userId) {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.ONEDRIVE_CLIENT_ID,
          client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
          code,
          redirect_uri: process.env.ONEDRIVE_REDIRECT_URI,
          grant_type: 'authorization_code'
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      // Get user info
      const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const userInfo = await userResponse.json();

      // Encrypt tokens
      const encryptedData = this.encryptTokens(tokens);

      // Calculate expiry
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      // Deactivate existing credentials
      await cloudStorageCredentials.deactivateUserCredentials(userId, 'onedrive');

      // Store new credentials
      const credential = await cloudStorageCredentials.createCredentials({
        users_id: userId,
        provider: 'onedrive',
        ...encryptedData,
        token_expires_at: expiresAt,
        account_email: userInfo.mail || userInfo.userPrincipalName,
        account_name: userInfo.displayName,
        account_id: userInfo.id
      });

      logger.info(`OneDrive connected for user ${userId}`);
      return credential;
    } catch (error) {
      logger.error('Error handling OneDrive callback:', error);
      throw error;
    }
  }

  /**
   * Get authenticated OneDrive client
   * @param {number} userId - User ID
   * @returns {Promise<object>} Graph client and tokens
   */
  async getOneDriveClient(userId) {
    const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'onedrive', true);
    if (!credential) {
      throw new Error('OneDrive not connected');
    }

    let tokens = this.decryptTokens(credential);

    // Check if token needs refresh
    if (credential.token_expires_at && new Date() >= new Date(credential.token_expires_at) - 60000) {
      tokens = await this.refreshOneDriveToken(credential.id, tokens.refresh_token);
    }

    await cloudStorageCredentials.markAsUsed(credential.id);

    const client = Client.init({
      authProvider: (done) => {
        done(null, tokens.access_token);
      }
    });

    return { client, tokens };
  }

  /**
   * Refresh OneDrive token
   * @param {number} credentialId - Credential ID
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<object>} New tokens
   */
  async refreshOneDriveToken(credentialId, refreshToken) {
    try {
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.ONEDRIVE_CLIENT_ID,
          client_secret: process.env.ONEDRIVE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      const encryptedData = this.encryptTokens(tokens);
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await cloudStorageCredentials.updateCredentials(credentialId, {
        ...encryptedData,
        token_expires_at: expiresAt
      });

      return tokens;
    } catch (error) {
      logger.error('Error refreshing OneDrive token:', error);
      throw error;
    }
  }

  /**
   * Upload file to OneDrive
   * @param {number} userId - User ID
   * @param {string} fileName - File name
   * @param {Buffer|string} content - File content
   * @param {string} folderIdOrPath - Folder ID or path (e.g., '/AmplifyContent/Video123')
   * @returns {Promise<object>} Upload result
   */
  async uploadToOneDrive(userId, fileName, content, folderIdOrPath = '') {
    try {
      const { client } = await this.getOneDriveClient(userId);

      let apiPath;
      if (!folderIdOrPath) {
        // No folder specified - upload to root
        apiPath = `/me/drive/root:/${fileName}:/content`;
      } else if (folderIdOrPath.startsWith('/')) {
        // It's a path like "/AmplifyContent/Video123"
        apiPath = `/me/drive/root:${folderIdOrPath}/${fileName}:/content`;
      } else {
        // It's a folder ID - use items endpoint
        apiPath = `/me/drive/items/${folderIdOrPath}:/${fileName}:/content`;
      }

      const response = await client.api(apiPath)
        .put(Buffer.isBuffer(content) ? content : Buffer.from(content));

      logger.info(`Uploaded ${fileName} to OneDrive for user ${userId}`);

      return {
        fileId: response.id,
        fileName: response.name,
        webUrl: response.webUrl
      };
    } catch (error) {
      logger.error('Error uploading to OneDrive:', error);
      const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'onedrive');
      if (credential) {
        await cloudStorageCredentials.recordError(credential.id, error.message);
      }
      throw error;
    }
  }

  /**
   * Create folder in OneDrive
   * @param {number} userId - User ID
   * @param {string} folderName - Folder name
   * @param {string} parentIdOrPath - Parent folder ID or path
   * @returns {Promise<object>} Created folder info
   */
  async createOneDriveFolder(userId, folderName, parentIdOrPath = '') {
    try {
      const { client } = await this.getOneDriveClient(userId);

      let apiPath;
      if (!parentIdOrPath) {
        // No parent specified - create in root
        apiPath = '/me/drive/root/children';
      } else if (parentIdOrPath.startsWith('/')) {
        // It's a path like "/AmplifyContent"
        apiPath = `/me/drive/root:${parentIdOrPath}:/children`;
      } else {
        // It's a folder ID - use items endpoint
        apiPath = `/me/drive/items/${parentIdOrPath}/children`;
      }

      const response = await client.api(apiPath)
        .post({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename'
        });

      return {
        folderId: response.id,
        folderName: response.name,
        webUrl: response.webUrl
      };
    } catch (error) {
      logger.error('Error creating OneDrive folder:', error);
      throw error;
    }
  }

  // =====================================================================
  // DROPBOX
  // =====================================================================

  /**
   * Get Dropbox authorization URL
   * @param {number} userId - User ID for state parameter
   * @returns {string} Authorization URL
   */
  getDropboxAuthUrl(userId) {
    const state = Buffer.from(JSON.stringify({
      userId,
      provider: 'dropbox',
      timestamp: Date.now()
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: process.env.DROPBOX_APP_KEY,
      response_type: 'code',
      redirect_uri: process.env.DROPBOX_REDIRECT_URI,
      state,
      token_access_type: 'offline'
    });

    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Handle Dropbox OAuth callback
   * @param {string} code - Authorization code
   * @param {number} userId - User ID
   * @returns {Promise<object>} Stored credential
   */
  async handleDropboxCallback(code, userId) {
    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          redirect_uri: process.env.DROPBOX_REDIRECT_URI,
          client_id: process.env.DROPBOX_APP_KEY,
          client_secret: process.env.DROPBOX_APP_SECRET
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      // Get user info
      const dbx = new Dropbox({ accessToken: tokens.access_token });
      const userInfo = await dbx.usersGetCurrentAccount();

      // Encrypt tokens
      const encryptedData = this.encryptTokens(tokens);

      // Calculate expiry (Dropbox tokens don't expire if offline access)
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      // Deactivate existing credentials
      await cloudStorageCredentials.deactivateUserCredentials(userId, 'dropbox');

      // Store new credentials
      const credential = await cloudStorageCredentials.createCredentials({
        users_id: userId,
        provider: 'dropbox',
        ...encryptedData,
        token_expires_at: expiresAt,
        account_email: userInfo.result.email,
        account_name: userInfo.result.name.display_name,
        account_id: userInfo.result.account_id
      });

      logger.info(`Dropbox connected for user ${userId}`);
      return credential;
    } catch (error) {
      logger.error('Error handling Dropbox callback:', error);
      throw error;
    }
  }

  /**
   * Get authenticated Dropbox client
   * @param {number} userId - User ID
   * @returns {Promise<Dropbox>} Dropbox client
   */
  async getDropboxClient(userId) {
    const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'dropbox', true);
    if (!credential) {
      throw new Error('Dropbox not connected');
    }

    let tokens = this.decryptTokens(credential);

    // Check if token needs refresh
    if (credential.token_expires_at && tokens.refresh_token &&
        new Date() >= new Date(credential.token_expires_at) - 60000) {
      tokens = await this.refreshDropboxToken(credential.id, tokens.refresh_token);
    }

    await cloudStorageCredentials.markAsUsed(credential.id);

    return new Dropbox({ accessToken: tokens.access_token });
  }

  /**
   * Refresh Dropbox token
   * @param {number} credentialId - Credential ID
   * @param {string} refreshToken - Refresh token
   * @returns {Promise<object>} New tokens
   */
  async refreshDropboxToken(credentialId, refreshToken) {
    try {
      const tokenResponse = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
          client_id: process.env.DROPBOX_APP_KEY,
          client_secret: process.env.DROPBOX_APP_SECRET
        })
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        throw new Error(tokens.error_description || tokens.error);
      }

      // Preserve refresh token if not returned
      if (!tokens.refresh_token) {
        tokens.refresh_token = refreshToken;
      }

      const encryptedData = this.encryptTokens(tokens);
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null;

      await cloudStorageCredentials.updateCredentials(credentialId, {
        ...encryptedData,
        token_expires_at: expiresAt
      });

      return tokens;
    } catch (error) {
      logger.error('Error refreshing Dropbox token:', error);
      throw error;
    }
  }

  /**
   * Upload file to Dropbox
   * @param {number} userId - User ID
   * @param {string} fileName - File name
   * @param {Buffer|string} content - File content
   * @param {string} folderPath - Folder path (e.g., '/AmplifyContent/Video123')
   * @returns {Promise<object>} Upload result
   */
  async uploadToDropbox(userId, fileName, content, folderPath = '') {
    try {
      const dbx = await this.getDropboxClient(userId);

      const path = folderPath
        ? `${folderPath}/${fileName}`
        : `/${fileName}`;

      const response = await dbx.filesUpload({
        path,
        contents: Buffer.isBuffer(content) ? content : Buffer.from(content),
        mode: { '.tag': 'overwrite' }
      });

      // Get shareable link
      let sharedLink = null;
      try {
        const linkResponse = await dbx.sharingCreateSharedLinkWithSettings({
          path: response.result.path_display
        });
        sharedLink = linkResponse.result.url;
      } catch (linkError) {
        // Link may already exist
        if (linkError.error?.error?.['.tag'] === 'shared_link_already_exists') {
          const existingLinks = await dbx.sharingListSharedLinks({
            path: response.result.path_display
          });
          if (existingLinks.result.links.length > 0) {
            sharedLink = existingLinks.result.links[0].url;
          }
        }
      }

      logger.info(`Uploaded ${fileName} to Dropbox for user ${userId}`);

      return {
        fileId: response.result.id,
        fileName: response.result.name,
        path: response.result.path_display,
        sharedLink
      };
    } catch (error) {
      logger.error('Error uploading to Dropbox:', error);
      const credential = await cloudStorageCredentials.getUserProviderCredential(userId, 'dropbox');
      if (credential) {
        await cloudStorageCredentials.recordError(credential.id, error.message);
      }
      throw error;
    }
  }

  /**
   * Create folder in Dropbox
   * @param {number} userId - User ID
   * @param {string} folderPath - Full folder path
   * @returns {Promise<object>} Created folder info
   */
  async createDropboxFolder(userId, folderPath) {
    try {
      const dbx = await this.getDropboxClient(userId);

      const response = await dbx.filesCreateFolderV2({
        path: folderPath,
        autorename: true
      });

      return {
        folderId: response.result.metadata.id,
        folderName: response.result.metadata.name,
        path: response.result.metadata.path_display
      };
    } catch (error) {
      // Folder may already exist
      if (error.error?.error?.['.tag'] === 'path' &&
          error.error?.error?.path?.['.tag'] === 'conflict') {
        return { path: folderPath, existing: true };
      }
      logger.error('Error creating Dropbox folder:', error);
      throw error;
    }
  }

  // =====================================================================
  // UNIFIED METHODS
  // =====================================================================

  /**
   * Get authorization URL for any provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @returns {string} Authorization URL
   */
  getAuthUrl(userId, provider) {
    switch (provider) {
      case 'google_drive':
        return this.getGoogleDriveAuthUrl(userId);
      case 'onedrive':
        return this.getOneDriveAuthUrl(userId);
      case 'dropbox':
        return this.getDropboxAuthUrl(userId);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Handle OAuth callback for any provider
   * @param {string} code - Authorization code
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @returns {Promise<object>} Stored credential
   */
  async handleCallback(code, userId, provider) {
    switch (provider) {
      case 'google_drive':
        return this.handleGoogleDriveCallback(code, userId);
      case 'onedrive':
        return this.handleOneDriveCallback(code, userId);
      case 'dropbox':
        return this.handleDropboxCallback(code, userId);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Upload file to any provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @param {string} fileName - File name
   * @param {Buffer|string} content - File content
   * @param {string} mimeType - MIME type (for Google Drive)
   * @param {string} folderPath - Folder path or ID
   * @returns {Promise<object>} Upload result
   */
  async uploadFile(userId, provider, fileName, content, mimeType, folderIdOrPath = null) {
    switch (provider) {
      case 'google_drive':
        return this.uploadToGoogleDrive(userId, fileName, content, mimeType, folderIdOrPath);
      case 'onedrive':
        return this.uploadToOneDrive(userId, fileName, content, folderIdOrPath);
      case 'dropbox':
        // Dropbox only supports path-based references (must start with /)
        // If a folder ID is passed, we can't use it - upload to root instead
        const dropboxPath = (folderIdOrPath && folderIdOrPath.startsWith('/')) ? folderIdOrPath : '';
        if (folderIdOrPath && !folderIdOrPath.startsWith('/')) {
          logger.warn(`Dropbox received folder ID instead of path, uploading to root: ${folderIdOrPath}`);
        }
        return this.uploadToDropbox(userId, fileName, content, dropboxPath);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Create folder in any provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @param {string} folderName - Folder name
   * @param {string} parentPath - Parent folder path or ID
   * @returns {Promise<object>} Created folder info
   */
  async createFolder(userId, provider, folderName, parentPath = null) {
    switch (provider) {
      case 'google_drive':
        return this.createGoogleDriveFolder(userId, folderName, parentPath);
      case 'onedrive':
        return this.createOneDriveFolder(userId, folderName, parentPath);
      case 'dropbox':
        const fullPath = parentPath ? `${parentPath}/${folderName}` : `/${folderName}`;
        return this.createDropboxFolder(userId, fullPath);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Get user's connected cloud storage providers
   * @param {number} userId - User ID
   * @returns {Promise<object>} Connection status for each provider
   */
  async getConnectionStatus(userId) {
    const credentials = await cloudStorageCredentials.getUserCredentials(userId);

    const status = {
      google_drive: { connected: false },
      onedrive: { connected: false },
      dropbox: { connected: false }
    };

    for (const cred of credentials) {
      status[cred.provider] = {
        connected: true,
        accountEmail: cred.account_email,
        accountName: cred.account_name,
        lastUsed: cred.last_used,
        rootFolderPath: cred.root_folder_path
      };
    }

    return status;
  }

  /**
   * Disconnect a cloud storage provider
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(userId, provider) {
    const count = await cloudStorageCredentials.deactivateUserCredentials(userId, provider);
    logger.info(`Disconnected ${provider} for user ${userId} (${count} credentials deactivated)`);
    return count > 0;
  }

  /**
   * Generate unique folder code for video content
   * @returns {string} 10-character alphanumeric code
   */
  generateVideoCode() {
    return crypto.randomBytes(5).toString('hex').toUpperCase();
  }

  /**
   * Create AmplifyContent folder structure for a video
   * Automatically creates /AmplifyContent/{VideoTitle}_{VideoCode}/ structure
   * Reuses existing folder if video already has uploads for this provider
   * Uses in-memory cache to prevent race conditions when multiple content types
   * are uploaded simultaneously for the same video
   * @param {number} userId - User ID
   * @param {string} provider - Provider name
   * @param {string} contentType - Content type (e.g., 'summary_text')
   * @param {string} videoTitle - Video title for folder name
   * @param {number} videoId - Video ID to check for existing folder
   * @returns {Promise<object>} Folder info
   */
  async ensureContentFolder(userId, provider, contentType, videoTitle, videoId = null) {
    try {
      const cacheKey = videoId ? `${videoId}_${provider}` : null;

      // FIRST: Check in-memory cache (prevents race conditions for parallel uploads)
      if (cacheKey && this.folderCache.has(cacheKey)) {
        const cached = this.folderCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.folderCacheTimeout) {
          logger.info(`Using cached folder for video ${videoId} on ${provider}: ${cached.folder.folderPath}`);
          return cached.folder;
        } else {
          // Cache expired, remove it
          this.folderCache.delete(cacheKey);
        }
      }

      // SECOND: Check database for existing uploads
      if (videoId) {
        const database = require('./database.service');
        const existingUpload = await database.query(`
          SELECT cloud_folder_id, cloud_folder_path
          FROM cloud_storage_uploads
          WHERE videos_id = $1 AND provider = $2 AND cloud_folder_id IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1
        `, [videoId, provider]);

        if (existingUpload.rows.length > 0) {
          const existing = existingUpload.rows[0];
          const folder = {
            folderId: existing.cloud_folder_id,
            folderPath: existing.cloud_folder_path,
            folderName: existing.cloud_folder_path?.split('/').pop() || 'Content'
          };

          // Store in cache for future requests
          if (cacheKey) {
            this.folderCache.set(cacheKey, { folder, timestamp: Date.now() });
          }

          logger.info(`Reusing existing folder for video ${videoId} on ${provider}: ${existing.cloud_folder_path}`);
          return folder;
        }
      }

      // THIRD: Create new folder structure
      // Get or create root AmplifyContent folder
      const credential = await cloudStorageCredentials.getUserProviderCredential(userId, provider);

      let rootFolderId = credential?.root_folder_id;
      let rootFolderPath = '/AmplifyContent';

      if (!rootFolderId) {
        // Create AmplifyContent folder in root
        const rootFolder = await this.createFolder(userId, provider, 'AmplifyContent');
        rootFolderId = rootFolder.folderId;
        rootFolderPath = rootFolder.path || '/AmplifyContent';

        // Save root folder ID to credential for future use
        if (credential) {
          await cloudStorageCredentials.updateFolderConfig(credential.id, {
            rootFolderId,
            rootFolderPath
          });
        }
      }

      // Create video-specific subfolder with sanitized title and unique code
      const videoCode = this.generateVideoCode();
      const sanitizedTitle = this.sanitizeFolderName(videoTitle || 'Untitled');
      const folderName = `${sanitizedTitle}_${videoCode}`;

      // Dropbox only supports path-based references, not folder IDs
      const parentRef = provider === 'dropbox' ? rootFolderPath : (rootFolderId || rootFolderPath);
      const contentFolder = await this.createFolder(userId, provider, folderName, parentRef);

      const folder = {
        folderId: contentFolder.folderId,
        folderPath: contentFolder.path || `${rootFolderPath}/${folderName}`,
        folderName
      };

      // Store in cache to prevent duplicate folder creation for parallel uploads
      if (cacheKey) {
        this.folderCache.set(cacheKey, { folder, timestamp: Date.now() });
        logger.info(`Created and cached new folder for video ${videoId} on ${provider}: ${folder.folderPath}`);
      }

      return folder;
    } catch (error) {
      logger.error(`Error ensuring content folder for ${provider}:`, error);
      throw error;
    }
  }

  /**
   * Clear folder cache for a specific video/provider or all entries
   * @param {number} videoId - Optional video ID to clear specific cache
   * @param {string} provider - Optional provider to clear specific cache
   */
  clearFolderCache(videoId = null, provider = null) {
    if (videoId && provider) {
      const cacheKey = `${videoId}_${provider}`;
      this.folderCache.delete(cacheKey);
    } else if (videoId) {
      // Clear all entries for this video
      for (const key of this.folderCache.keys()) {
        if (key.startsWith(`${videoId}_`)) {
          this.folderCache.delete(key);
        }
      }
    } else {
      // Clear all
      this.folderCache.clear();
    }
  }

  /**
   * Sanitize folder name for cloud storage
   * @param {string} name - Original name
   * @returns {string} Sanitized name
   */
  sanitizeFolderName(name) {
    return name
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
      .replace(/\s+/g, ' ')         // Normalize whitespace
      .trim()
      .substring(0, 50);            // Limit length
  }
}

module.exports = new CloudStorageService();
