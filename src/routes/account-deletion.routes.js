const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const accountDeletionController = require('../controllers/account-deletion.controller');
const { authMiddleware, validationMiddleware } = require('../middleware');

// All account deletion routes require authentication
router.use(authMiddleware);

/**
 * @route   GET /account/delete
 * @desc    Display account deletion confirmation page
 * @access  Private
 */
router.get('/delete', accountDeletionController.renderDeleteAccount);

/**
 * @route   POST /account/export-data
 * @desc    Export all user data as ZIP file
 * @access  Private
 */
router.post('/export-data', accountDeletionController.exportUserData);

/**
 * @route   POST /account/delete
 * @desc    Delete user account and all associated data
 * @access  Private
 */
router.post('/delete', [
  body('confirmation')
    .equals('true')
    .withMessage('You must confirm account deletion'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
], validationMiddleware, accountDeletionController.deleteAccount);

module.exports = router;
