const PreferencesService = require('../services/preferences.service');
const { logger } = require('../utils');

class PreferencesMiddleware {
  constructor() {
    this.preferencesService = new PreferencesService();
  }

  /**
   * Middleware to load user preferences and add to template context
   * Should be used after authentication middleware
   */
  loadUserPreferences = async (req, res, next) => {
    try {
      if (req.user && req.user.email) {
        try {
          // Get user preferences
          const preferences = await this.preferencesService.getUserPreferences(req.user.email);

          if (preferences) {
            // Add theme preference to request context for templates
            req.userTheme = preferences.themeMode || 'light';
            req.userPreferences = preferences;
          } else {
            // Default values if no preferences found
            req.userTheme = 'light';
            req.userPreferences = null;
          }
        } catch (prefError) {
          // Log error but don't fail the request - use defaults
          logger.warn('Error loading user preferences (using defaults):', prefError.message);
          req.userTheme = 'light';
          req.userPreferences = null;
        }
      } else {
        // Default values for non-authenticated users
        req.userTheme = 'light';
        req.userPreferences = null;
      }
    } catch (error) {
      // Log error but don't fail the request
      logger.warn('Preferences middleware error (using defaults):', error.message);
      req.userTheme = 'light';
      req.userPreferences = null;
    }

    next();
  };
}

const preferencesMiddleware = new PreferencesMiddleware();
module.exports = preferencesMiddleware.loadUserPreferences;
