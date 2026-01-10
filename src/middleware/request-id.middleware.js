/**
 * Request ID Middleware
 *
 * Generates a unique request ID for each incoming request to enable
 * request correlation across log entries. This is essential for
 * debugging and tracing requests through the system.
 */

const crypto = require('crypto');

/**
 * Middleware that assigns a unique request ID to each request.
 * The ID is available at req.requestId and also set in the X-Request-ID header.
 */
const requestIdMiddleware = (req, res, next) => {
  // Use existing request ID from header (for distributed tracing) or generate new one
  const existingId = req.headers['x-request-id'];
  const requestId = existingId || crypto.randomUUID().slice(0, 8);

  // Attach to request object for use in logging
  req.requestId = requestId;

  // Set response header for client correlation
  res.setHeader('X-Request-ID', requestId);

  next();
};

module.exports = requestIdMiddleware;
