const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { logger } = require('./utils');
const processingStatusService = require('./services/processing-status.service');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try both userId and id fields
    socket.userId = decoded.userId || decoded.id;
    next();
  } catch (error) {
    logger.error(`Socket.IO auth failed: ${error.message}`);
    next(new Error('Invalid token'));
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userId = socket.userId;
  logger.debug(`Socket.IO connected: userId=${userId}`);

  // Register user session for status updates
  processingStatusService.registerUserSession(userId, socket);

  // Handle disconnect
  socket.on('disconnect', () => {
    logger.debug(`Socket.IO disconnected: userId=${userId}`);
    processingStatusService.unregisterUserSession(userId, socket);
  });

  // Handle status request
  socket.on('request-status', () => {
    const processingVideos = processingStatusService.getUserProcessingVideos(userId);
    logger.debug(`Socket.IO status: userId=${userId} videos=${processingVideos.length}`);
    socket.emit('processing-status-batch', processingVideos);
  });

  // Handle clear processing videos request (when user leaves videos page)
  socket.on('clear-processing-videos', () => {
    logger.debug(`Socket.IO clear-processing: userId=${userId}`);
    processingStatusService.clearUserProcessingVideos(userId);
  });
});

// Make io available to the app
app.set('io', io);

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
  logger.info(`${signal} received - starting graceful shutdown`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }

    logger.info('Server closed successfully');
    process.exit(0);
  });
};

// Process event listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack?.split('\n')[0] });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const errorMsg = reason instanceof Error ? reason.message : String(reason);
  const errorStack = reason instanceof Error ? reason.stack?.split('\n')[0] : '';
  logger.error('Unhandled Rejection', { error: errorMsg, stack: errorStack });

  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  } else {
    logger.warn('Development mode: Server continuing despite unhandled rejection');
  }
});

// Start the server
startServer();

module.exports = server;
