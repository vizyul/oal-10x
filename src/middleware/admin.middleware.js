const { logger } = require('../utils');

/**
 * Admin-only middleware
 * Restricts access to routes requiring admin privileges
 * Checks if authenticated user has role 'admin'
 */
const adminMiddleware = (req, res, next) => {
  try {
    // Check if user is authenticated
    if (!req.user) {
      logger.warn('Admin access attempted without authentication');
      return res.status(401).redirect('/auth/signin?redirect=' + encodeURIComponent(req.originalUrl));
    }

    // Check if user has admin role
    if (req.user.role !== 'admin') {
      logger.warn(`Admin access denied for user ${req.user.id} with role: ${req.user.role}`);
      return res.status(403).render('errors/403', {
        title: 'Admin Access Required',
        message: 'You must be an administrator to access this area.',
        user: req.user
      });
    }

    // Log admin access for security auditing
    logger.info(`Admin access granted to user ${req.user.id} (${req.user.email}) for ${req.originalUrl}`);
    
    next();
  } catch (error) {
    logger.error('Error in admin middleware:', error);
    res.status(500).render('errors/500', {
      title: 'Server Error',
      message: 'An error occurred while checking admin permissions.',
      user: req.user
    });
  }
};

/**
 * Optional admin middleware - shows admin features if admin, but doesn't block access
 * Useful for conditional admin UI elements
 */
const optionalAdminMiddleware = (req, res, next) => {
  try {
    // Add isAdmin flag to locals for template use
    res.locals.isAdmin = req.user && req.user.role === 'admin';
    next();
  } catch (error) {
    logger.error('Error in optional admin middleware:', error);
    res.locals.isAdmin = false;
    next();
  }
};

module.exports = {
  adminMiddleware,
  optionalAdminMiddleware
};