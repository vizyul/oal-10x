const express = require('express');
const router = express.Router();
const cloudStorageController = require('../controllers/cloud-storage.controller');
const { authMiddleware } = require('../middleware');

// =====================================================================
// OAuth Callbacks - No auth required (user ID is in state parameter)
// These must be BEFORE authMiddleware
// =====================================================================

router.get('/callback/google-drive', cloudStorageController.handleGoogleDriveCallback);
router.get('/callback/onedrive', cloudStorageController.handleOneDriveCallback);
router.get('/callback/dropbox', cloudStorageController.handleDropboxCallback);

// =====================================================================
// All remaining routes require authentication
// =====================================================================
router.use(authMiddleware);

// =====================================================================
// OAuth Connection Routes
// =====================================================================

// Initiate OAuth flow for a provider
router.get('/connect/:provider', cloudStorageController.initiateOAuth);

// Disconnect a provider
router.post('/disconnect/:provider', cloudStorageController.disconnectProvider);

// =====================================================================
// Status and Settings Routes
// =====================================================================

// Get connection status for all providers
router.get('/status', cloudStorageController.getConnectionStatus);

// Get connection status for a specific provider
router.get('/status/:provider', cloudStorageController.getProviderStatus);

// =====================================================================
// Folder Management Routes
// =====================================================================

// Get folder picker / browser for a provider
router.get('/folders/:provider', cloudStorageController.listFolders);

// Set root folder for uploads
router.post('/folders/:provider/set-root', cloudStorageController.setRootFolder);

// Create a new folder
router.post('/folders/:provider/create', cloudStorageController.createFolder);

// =====================================================================
// Upload Routes
// =====================================================================

// Manual upload of content to cloud storage
router.post('/upload/:provider', cloudStorageController.uploadContent);

// Get upload history
router.get('/uploads', cloudStorageController.getUploadHistory);

// Retry a failed upload
router.post('/uploads/:uploadId/retry', cloudStorageController.retryUpload);

// =====================================================================
// Preferences Routes
// =====================================================================

// Update cloud storage preferences
router.post('/preferences', cloudStorageController.updatePreferences);

// Get cloud storage preferences
router.get('/preferences', cloudStorageController.getPreferences);

module.exports = router;
