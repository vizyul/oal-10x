// Load environment variables first, before any other imports
require('dotenv').config();

const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import middleware
const {
  securityMiddleware,
  errorMiddleware,
  // validationMiddleware
} = require('./middleware');

// Import routes
const routes = require('./routes');

// Import utilities
const { logger } = require('./utils');

// Create Express app
const app = express();

// Set trust proxy for Railway deployment (development and production)
// Railway always runs behind a proxy, regardless of NODE_ENV
const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.CORS_ORIGIN?.includes('dev.amplifycontent.ai');
if (process.env.NODE_ENV === 'production' || isRailway) {
  app.set('trust proxy', 1);
  logger.info('Trust proxy enabled for Railway deployment');
}

// Cloudflare real IP middleware - extracts visitor IP from CF-Connecting-IP header
app.use((req, res, next) => {
  // Cloudflare provides the real visitor IP in CF-Connecting-IP header
  const cloudflareIP = req.headers['cf-connecting-ip'];
  if (cloudflareIP) {
    req.realIP = cloudflareIP;
    // Also useful headers from Cloudflare
    req.cloudflare = {
      ip: cloudflareIP,
      country: req.headers['cf-ipcountry'],
      ray: req.headers['cf-ray']
    };
  } else {
    req.realIP = req.ip;
  }
  next();
});

// View engine setup - Handlebars
app.engine('.hbs', engine({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    // Custom Handlebars helpers
    eq: (a, b) => a === b,
    ne: (a, b) => a !== b,
    gt: (a, b) => a > b,
    lt: (a, b) => a < b,
    and: (a, b) => a && b,
    or: (a, b) => a || b,
    formatDate: (date) => {
      return new Date(date).toLocaleDateString();
    },
    json: (context) => {
      return JSON.stringify(context);
    },
    capitalize: (str) => {
      if (!str || typeof str !== 'string') return str;
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },
    substring: (str, start, end) => {
      if (!str || typeof str !== 'string') return '';
      return str.substring(start, end);
    },
    lookup: (obj, key) => {
      return obj && obj[key];
    },
    unless: (condition, options) => {
      if (!condition) {
        return options.fn && options.fn();
      }
      return options.inverse && options.inverse();
    }
  }
}));

app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// Apply security middleware first
app.use(securityMiddleware);

// Apply centralized rate limiting
const { autoRateLimit, addRateLimitHeaders, logRateLimitEvents } = require('./middleware/rate-limiting.middleware');
app.use(addRateLimitHeaders);
app.use(logRateLimitEvents);
app.use(autoRateLimit);

// Request logging
if (process.env.NODE_ENV === 'development') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
}

// Stripe webhook endpoint (needs raw body for signature verification)
app.use('/webhook/stripe', express.raw({ type: 'application/json' }), require('./routes/webhook.routes'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Auto-set canonicalUrl for all templates
app.use((req, res, next) => {
  const baseUrl = process.env.BASE_URL || 'https://amplifycontent.ai';
  res.locals.canonicalUrl = `${baseUrl}${req.originalUrl.split('?')[0]}`;
  next();
});

// Initialize OAuth service and Passport
const oauthService = require('./services/oauth.service');
app.use(oauthService.initialize());

// Microsoft identity verification - serve with correct Content-Type for domain validation
app.get('/.well-known/microsoft-identity-association', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname, '..', 'public', '.well-known', 'microsoft-identity-association'));
});

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve Socket.IO client script
app.get('/socket.io/socket.io.js', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'));
});

// Test endpoint for webhook accessibility
app.get('/webhook/test', (req, res) => {
  console.log('🧪 Test webhook endpoint hit!');
  res.json({
    success: true,
    message: 'Webhook endpoint is accessible!',
    timestamp: new Date().toISOString()
  });
});

// Internal transcript API route (no auth required - called by internal services)
app.use('/api/transcript', require('./routes/transcript.routes'));

// Routes
app.use('/', routes);

// Health check endpoint (for Railway)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime()
  });
});

// 404 handler
app.use((req, res, _next) => {
  logger.warn(`404 - ${req.method} ${req.url} - ${req.ip}`);

  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    // API request
    return res.status(404).json({
      success: false,
      message: 'Resource not found',
      error: 'NOT_FOUND'
    });
  }

  // Web request
  res.status(404).render('errors/404', {
    title: 'Page Not Found',
    message: 'The page you requested could not be found.'
  });
});

// Global error handler
app.use(errorMiddleware);

module.exports = app;
