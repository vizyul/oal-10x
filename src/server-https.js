const https = require('https');
const fs = require('fs');
const path = require('path');
const app = require('./app');
const { logger } = require('./utils');

// Load environment variables
require('dotenv').config();

const PORT = process.env.HTTPS_PORT || 443;
const HOST = process.env.HOST || '0.0.0.0';

// HTTPS options with certificate paths
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certs/dev.ourailegacy.com-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/dev.ourailegacy.com.pem'))
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

// Handle server startup
const startServer = () => {
  server.listen(PORT, HOST, () => {
    logger.info(`🚀 HTTPS Server running on https://dev.ourailegacy.com${PORT === 443 ? '' : ':' + PORT}`);
    logger.info(`📍 Server binding to ${HOST}:${PORT} (accessible via dev.ourailegacy.com)`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Process ID: ${process.pid}`);
    logger.info(`🔒 HTTPS enabled for Apple OAuth development`);
  });
};

// Handle graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`📴 ${signal} received. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('❌ Error during server shutdown:', err);
      process.exit(1);
    }
    
    logger.info('✅ Server closed successfully');
    process.exit(0);
  });
};

// Process event listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = server;