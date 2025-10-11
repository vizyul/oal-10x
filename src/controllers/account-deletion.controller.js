const { logger } = require('../utils');
const database = require('../services/database.service');
const archiver = require('archiver');
const { Parser } = require('json2csv');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class AccountDeletionController {
  /**
   * Render account deletion confirmation page
   * GET /account/delete
   */
  async renderDeleteAccount(req, res) {
    try {
      res.render('account/delete-confirm', {
        title: 'Delete Account',
        description: 'Request account deletion and data export',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true
      });
    } catch (error) {
      logger.error('Error rendering delete account page:', error);
      res.redirect('/profile?error=page_load_failed');
    }
  }

  /**
   * Export all user data to CSV files and create a ZIP archive
   * POST /account/export-data
   */
  async exportUserData(req, res) {
    const tempDir = path.join(os.tmpdir(), `user-data-${req.user.id}-${Date.now()}`);

    try {
      const userId = req.user.id;
      logger.info(`Starting data export for user ${userId}`);

      // Create temporary directory for CSV files
      await fs.mkdir(tempDir, { recursive: true });

      // Define all tables and their relationships
      const tablesToExport = [
        { table: 'users', condition: 'id = $1' },
        { table: 'sessions', condition: 'users_id = $1' },
        { table: 'user_subscriptions', condition: 'users_id = $1' },
        { table: 'subscription_usage', condition: 'user_id = $1' },
        { table: 'subscription_events', condition: 'user_id = $1' },
        { table: 'videos', condition: 'users_id = $1' },
        { table: 'user_preferences', condition: 'users_id = $1' },
        { table: 'user_youtube_channels', condition: 'users_id = $1' },
        { table: 'youtube_oauth_tokens', condition: 'users_id = $1' },
        { table: 'api_keys', condition: 'users_id = $1' },
        { table: 'audit_log', condition: 'users_id = $1' }
      ];

      // Export each table to CSV
      const exportedFiles = [];
      for (const { table, condition } of tablesToExport) {
        try {
          const query = `SELECT * FROM ${table} WHERE ${condition}`;
          const result = await database.query(query, [userId]);

          if (result.rows && result.rows.length > 0) {
            // Convert to CSV
            const parser = new Parser();
            const csv = parser.parse(result.rows);

            // Write to file
            const filePath = path.join(tempDir, `${table}.csv`);
            await fs.writeFile(filePath, csv, 'utf8');
            exportedFiles.push({ table, filePath, count: result.rows.length });
            logger.info(`Exported ${result.rows.length} rows from ${table}`);
          } else {
            logger.info(`No data found in ${table} for user ${userId}`);
          }
        } catch (tableError) {
          // Log but continue - table might not exist or be empty
          logger.warn(`Error exporting ${table}:`, tableError.message);
        }
      }

      // Create README file with export info
      const readme = `Account Data Export
=====================

User ID: ${userId}
Export Date: ${new Date().toISOString()}
Email: ${req.user.email}

This archive contains all your data from the AmplifyContent.ai platform.

Files Included:
${exportedFiles.map(f => `- ${f.table}.csv (${f.count} records)`).join('\n')}

Data Format: CSV (Comma-Separated Values)

If you have any questions about this data export, please contact support@amplifycontent.ai
`;

      const readmePath = path.join(tempDir, 'README.txt');
      await fs.writeFile(readmePath, readme, 'utf8');

      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });
      const zipFileName = `account-data-${userId}-${Date.now()}.zip`;

      // Set response headers
      res.attachment(zipFileName);
      res.setHeader('Content-Type', 'application/zip');

      // Pipe archive to response
      archive.pipe(res);

      // Add files to archive
      archive.file(readmePath, { name: 'README.txt' });
      for (const { table, filePath } of exportedFiles) {
        archive.file(filePath, { name: `${table}.csv` });
      }

      // Finalize archive
      await archive.finalize();

      logger.info(`Data export completed for user ${userId}`, {
        filesExported: exportedFiles.length,
        tables: exportedFiles.map(f => f.table)
      });

      // Cleanup temporary files after a delay
      setTimeout(async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
          logger.info(`Cleaned up temporary export directory: ${tempDir}`);
        } catch (cleanupError) {
          logger.warn('Error cleaning up temporary files:', cleanupError);
        }
      }, 60000); // Clean up after 1 minute

    } catch (error) {
      logger.error('Error exporting user data:', error);

      // Cleanup on error
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        logger.warn('Error cleaning up after export failure:', cleanupError);
      }

      res.status(500).json({
        success: false,
        message: 'Failed to export user data',
        error: error.message
      });
    }
  }

  /**
   * Delete user account and all associated data
   * POST /account/delete
   */
  async deleteAccount(req, res) {
    try {
      const userId = req.user.id;
      const { confirmation, password } = req.body;

      // Validate confirmation checkbox
      if (confirmation !== 'true') {
        return res.status(400).json({
          success: false,
          message: 'You must confirm that you want to delete your account and all data'
        });
      }

      // Verify password
      const bcrypt = require('bcryptjs');
      const userResult = await database.query(
        'SELECT password FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows || userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }

      logger.info(`Starting account deletion for user ${userId}`);

      // Delete data in correct order (respecting foreign key constraints)
      const deletionOrder = [
        { table: 'subscription_events', condition: 'user_id = $1' },
        { table: 'subscription_usage', condition: 'user_id = $1' },
        { table: 'user_subscriptions', condition: 'users_id = $1' },
        { table: 'sessions', condition: 'users_id = $1' },
        { table: 'user_preferences', condition: 'users_id = $1' },
        { table: 'user_youtube_channels', condition: 'users_id = $1' },
        { table: 'youtube_oauth_tokens', condition: 'users_id = $1' },
        { table: 'videos', condition: 'users_id = $1' },
        { table: 'api_keys', condition: 'users_id = $1' },
        { table: 'audit_log', condition: 'users_id = $1' }
      ];

      const deletionResults = [];

      // Delete from related tables first
      for (const { table, condition } of deletionOrder) {
        try {
          const result = await database.query(
            `DELETE FROM ${table} WHERE ${condition}`,
            [userId]
          );
          deletionResults.push({
            table,
            rowsDeleted: result.rowCount
          });
          logger.info(`Deleted ${result.rowCount} rows from ${table}`);
        } catch (tableError) {
          // Log but continue - table might not exist
          logger.warn(`Error deleting from ${table}:`, tableError.message);
        }
      }

      // Finally, delete the user record
      const userDeletionResult = await database.query(
        'DELETE FROM users WHERE id = $1',
        [userId]
      );

      deletionResults.push({
        table: 'users',
        rowsDeleted: userDeletionResult.rowCount
      });

      logger.info(`Account deletion completed for user ${userId}`, {
        deletionResults
      });

      // Clear auth cookie
      res.clearCookie('auth_token');

      res.json({
        success: true,
        message: 'Account deleted successfully',
        data: {
          deletionResults
        }
      });

    } catch (error) {
      logger.error('Error deleting account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account',
        error: error.message
      });
    }
  }
}

module.exports = new AccountDeletionController();
