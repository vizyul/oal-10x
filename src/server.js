const http = require('http');
const app = require('./app');
const { logger } = require('./utils');

// Load environment variables
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Create HTTP server
const server = http.createServer(app);

// Handle server startup
const startServer = () => {
  server.listen(PORT, HOST, () => {
    logger.info(`🚀 Server running on ${HOST}:${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Process ID: ${process.pid}`);
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