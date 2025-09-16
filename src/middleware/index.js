const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');
const { validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');

const { logger } = require('../utils');
const { authService } = require('../services');

// Security Middleware
const securityMiddleware = [
  // Helmet for security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\'', 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        fontSrc: ['\'self\'', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        scriptSrc: ['\'self\'', '\'unsafe-inline\'', 'https://cdn.jsdelivr.net', 'https://js.stripe.com'],
        imgSrc: ['\'self\'', 'data:', 'https:'],
        connectSrc: ['\'self\'', 'https://api.stripe.com'],
        frameSrc: ['\'self\'', 'https://js.stripe.com', 'https://hooks.stripe.com']
      }
    },
    crossOriginEmbedderPolicy: false
  }),

  // CORS configuration
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }),

  // Compression
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    },
    threshold: 1024 // Only compress responses larger than 1KB
  }),

  // General rate limiting
  rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
      success: false,
      message: 'Too many requests from this IP. Please try again later.',
      error: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health check, static assets, and logout
      return req.path === '/health' ||
             req.path === '/auth/logout' ||
             req.path.startsWith('/css') ||
             req.path.startsWith('/js') ||
             req.path.startsWith('/images');
    }
  })
];

// Validation middleware
const validationMiddleware = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));

    logger.warn('Validation failed:', formattedErrors);

    // For API requests
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        errors: formattedErrors
      });
    }

    // For form submissions, flash errors and redirect back
    req.flash('errors', formattedErrors);
    req.flash('formData', req.body);
    return res.redirect('back');
  }

  next();
};

// Simple in-memory user cache to avoid repeated database calls
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedUser = (userId) => {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.user;
  }
  return null;
};

const setCachedUser = (userId, user) => {
  userCache.set(userId, {
    user,
    timestamp: Date.now()
  });

  // Clean up old cache entries periodically
  if (userCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of userCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        userCache.delete(key);
      }
    }
  }
};

const clearCachedUser = (userId) => {
  userCache.delete(userId);
  logger.debug('Cleared cached user data:', { userId });
};

// Set to track users who need token refresh
const usersNeedingTokenRefresh = new Set();

const forceTokenRefresh = (userId) => {
  // Clear the user cache
  clearCachedUser(userId);
  // Mark user as needing token refresh
  usersNeedingTokenRefresh.add(userId.toString());
  logger.info('Forced token refresh for user:', { userId });
};

// Authentication middleware
const authMiddleware = async (req, res, next) => {
  try {
    let token = null;

    // Check for token in cookies first (primary method)
    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    // Fallback to Authorization header
    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return handleAuthError(req, res, 'No authentication token provided');
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Use JWT data if available (for newer tokens), otherwise fall back to database
    let user;
    let needsTokenRefresh = false;

    // Check if this user has been marked for forced token refresh
    const userId = decoded.userId.toString();
    if (usersNeedingTokenRefresh.has(userId)) {
      needsTokenRefresh = true;
      usersNeedingTokenRefresh.delete(userId); // Remove from set after processing
      logger.info('Processing forced token refresh for user:', { userId });
    }


    if (decoded.firstName && decoded.emailVerified !== undefined) {
      // JWT contains user data - check if subscription fields or role are missing
      if (decoded.subscription_tier === undefined || decoded.subscription_status === undefined || decoded.role === undefined) {
        // Old token format - needs refresh with subscription data and role
        needsTokenRefresh = true;
      }

      // Use JWT data for now
      user = {
        id: decoded.userId,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        fullName: `${decoded.firstName} ${decoded.lastName}`,
        emailVerified: decoded.emailVerified,
        status: decoded.status,
        role: decoded.role,
        subscription_tier: decoded.subscription_tier,
        subscription_status: decoded.subscription_status,
        stripe_customer_id: decoded.stripe_customer_id
      };
    } else {
      // Fallback to cache/database for older tokens
      needsTokenRefresh = true;
      user = getCachedUser(decoded.userId);

      if (!user) {
        // Get user from database only if not in cache
        user = await authService.findUserById(decoded.userId);
        if (user) {
          setCachedUser(decoded.userId, user);
        }
      }
    }

    // Auto-refresh token if needed
    if (needsTokenRefresh && user) {
      try {
        // Get fresh user data from database
        const freshUser = await authService.findUserById(user.id);
        if (freshUser) {
          // Generate new token with fresh data
          const newToken = require('../services/auth.service').generateToken(freshUser.id, freshUser.email, freshUser);

          // Set new token in response header for the current request
          res.cookie('auth_token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
          });

          // Update user object with fresh data
          user = freshUser;
          setCachedUser(user.id, user);

          logger.info('Auto-refreshed JWT token for user:', user.email);
        }
      } catch (error) {
        logger.error('Auto token refresh failed:', error);
        // Continue with existing user data - don't fail the request
      }
    }

    if (!user) {
      return handleAuthError(req, res, 'User not found');
    }

    if (!user.emailVerified) {
      return handleAuthError(req, res, 'Email not verified');
    }

    if (user.status !== 'active') {
      return handleAuthError(req, res, 'Account is not active');
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return handleAuthError(req, res, 'Invalid token');
    } else if (error.name === 'TokenExpiredError') {
      return handleAuthError(req, res, 'Token expired');
    }

    logger.error('Authentication middleware error:', error);
    return handleAuthError(req, res, 'Authentication failed');
  }
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    let token = null;

    if (req.cookies && req.cookies.auth_token) {
      token = req.cookies.auth_token;
    }

    if (!token && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return next(); // Continue without authentication
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Use JWT data if available (for newer tokens), otherwise fall back to database
    let user;
    let needsTokenRefresh = false;

    if (decoded.firstName && decoded.emailVerified !== undefined) {
      // JWT contains user data - check if subscription fields or role are missing
      if (decoded.subscription_tier === undefined || decoded.subscription_status === undefined || decoded.role === undefined) {
        // Old token format - needs refresh with subscription data and role
        needsTokenRefresh = true;
      }

      // Use JWT data for now
      user = {
        id: decoded.userId,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        fullName: `${decoded.firstName} ${decoded.lastName}`,
        emailVerified: decoded.emailVerified,
        status: decoded.status,
        role: decoded.role,
        subscription_tier: decoded.subscription_tier,
        subscription_status: decoded.subscription_status,
        stripe_customer_id: decoded.stripe_customer_id
      };
    } else {
      // Fallback to cache/database for older tokens
      needsTokenRefresh = true;
      user = getCachedUser(decoded.userId);

      if (!user) {
        // Get user from database only if not in cache
        user = await authService.findUserById(decoded.userId);
        if (user) {
          setCachedUser(decoded.userId, user);
        }
      }
    }

    // Auto-refresh token if needed
    if (needsTokenRefresh && user) {
      try {
        // Get fresh user data from database
        const freshUser = await authService.findUserById(user.id);
        if (freshUser) {
          // Generate new token with fresh data
          const newToken = require('../services/auth.service').generateToken(freshUser.id, freshUser.email, freshUser);

          // Set new token in response header for the current request
          res.cookie('auth_token', newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
          });

          // Update user object with fresh data
          user = freshUser;
          setCachedUser(user.id, user);

          logger.info('Auto-refreshed JWT token for user:', user.email);
        }
      } catch (error) {
        logger.error('Auto token refresh failed:', error);
        // Continue with existing user data - don't fail the request
      }
    }

    if (user && user.emailVerified && user.status === 'active') {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Silently continue without authentication
    logger.info('Optional auth failed (continuing):', error.message);
    next();
  }
};

// Middleware to check if user is already authenticated (redirect if logged in)
const guestOnlyMiddleware = (req, res, next) => {
  if (req.user) {
    // For API requests
    if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
      return res.status(403).json({
        success: false,
        message: 'Already authenticated',
        error: 'ALREADY_AUTHENTICATED'
      });
    }

    // For web requests
    const { getPostAuthRedirectUrl } = require('../utils/redirect.utils');
    return res.redirect(getPostAuthRedirectUrl(req.user));
  }

  next();
};

// Error handling middleware
const errorMiddleware = (error, req, res, _next) => {
  logger.error('Global error handler:', error);

  // Default error
  let statusCode = 500;
  let message = 'Internal server error';
  let errorCode = 'INTERNAL_SERVER_ERROR';

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation error';
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid data format';
    errorCode = 'INVALID_FORMAT';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
    errorCode = 'UNAUTHORIZED';
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large';
    errorCode = 'FILE_TOO_LARGE';
  }

  // For API requests, return JSON
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(statusCode).json({
      success: false,
      message,
      error: errorCode,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }

  // For web requests, render error page
  res.status(statusCode).render('errors/500', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'production' ? message : error.message,
    error: process.env.NODE_ENV === 'development' ? error : {},
    showHeader: true,
    showFooter: true
  });
};

// Helper function for authentication errors
const handleAuthError = (req, res, message) => {
  logger.warn(`Authentication failed: ${message} - ${req.ip}`);

  // Clear invalid token
  res.clearCookie('auth_token');

  // For API requests
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({
      success: false,
      message,
      error: 'UNAUTHORIZED'
    });
  }

  // For web requests, redirect to login
  try {
    if (req.flash && typeof req.flash === 'function') {
      req.flash('error', message);
    }
  } catch (flashError) {
    logger.debug('Flash not available:', flashError.message);
  }

  return res.redirect('/auth/sign-in');
};

const preferencesMiddleware = require('./preferences.middleware');
const subscriptionMiddleware = require('./subscription.middleware');

module.exports = {
  securityMiddleware,
  validationMiddleware,
  authMiddleware,
  optionalAuthMiddleware,
  guestOnlyMiddleware,
  errorMiddleware,
  preferencesMiddleware,
  subscriptionMiddleware,
  clearCachedUser,
  forceTokenRefresh
};
