const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const cookieParser = require('cookie-parser');

// Import middleware
const { 
  securityMiddleware, 
  errorMiddleware,
  validationMiddleware 
} = require('./middleware');

// Import routes
const routes = require('./routes');

// Import utilities
const { logger } = require('./utils');

// Create Express app
const app = express();

// Set trust proxy for Railway deployment
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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
    }
  }
}));

app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// Apply security middleware first
app.use(securityMiddleware);

// Request logging
if (process.env.NODE_ENV === 'development') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Initialize OAuth service and Passport
const oauthService = require('./services/oauth.service');
app.use(oauthService.initialize());

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Test endpoint for webhook accessibility
app.get('/webhook/test', (req, res) => {
  console.log('🧪 Test webhook endpoint hit!');
  res.json({ 
    success: true, 
    message: 'Webhook endpoint is accessible!',
    timestamp: new Date().toISOString()
  });
});

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
app.use((req, res, next) => {
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