const https = require('https');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const app = require('./app');
const { logger } = require('./utils');
const processingStatusService = require('./services/processing-status.service');

const PORT = process.env.HTTPS_PORT || 443;
const HOST = process.env.HOST || '0.0.0.0';

// HTTPS options with certificate paths
const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, '../certs/dev.ourailegacy.com-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/dev.ourailegacy.com.pem'))
};

// Create HTTPS server
const server = https.createServer(httpsOptions, app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'https://dev.ourailegacy.com',
    methods: ['GET', 'POST']
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  logger.info(`🔐 Socket.IO auth attempt: token = ${token ? 'present' : 'missing'}`);

  if (!token) {
    logger.warn('🔐 Socket.IO auth failed: no token provided');
    return next(new Error('Authentication required'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    logger.info(`🔐 JWT decoded: ${JSON.stringify(decoded)}`);

    // Try both userId and id fields
    socket.userId = decoded.userId || decoded.id;
    logger.info(`🔐 Socket.IO auth success: userId = ${socket.userId}`);
    next();
  } catch (error) {
    logger.error(`🔐 Socket.IO auth failed: ${error.message}`);
    next(new Error('Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.userId;
  logger.info(`🔌 Socket.IO connection established: userId = ${userId}`);

  // Register user session for status updates
  processingStatusService.registerUserSession(userId, socket);
  logger.info(`📡 Registered user session: ${userId}`);

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info(`User ${userId} disconnected from Socket.IO`);
    processingStatusService.unregisterUserSession(userId, socket);
  });

  // Handle status request
  socket.on('request-status', () => {
    const processingVideos = processingStatusService.getUserProcessingVideos(userId);
    socket.emit('processing-status-batch', processingVideos);
  });
});

// Handle server startup
const startServer = () => {
  server.listen(PORT, HOST, () => {
    logger.info(`🚀 HTTPS Server running on https://dev.ourailegacy.com${PORT === 443 ? '' : ':' + PORT}`);
    logger.info(`📍 Server binding to ${HOST}:${PORT} (accessible via dev.ourailegacy.com)`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📊 Process ID: ${process.pid}`);
    logger.info('🔒 HTTPS enabled for Apple OAuth development');
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
