const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };

    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      try {
        fs.mkdirSync(logsDir, { recursive: true });
      } catch (error) {
        console.warn('Failed to create logs directory:', error.message);
      }
    }

    this.logFile = path.join(logsDir, 'app.log');
    this.errorLogFile = path.join(logsDir, 'error.log');

    // Patterns to sanitize from logs
    this.sensitivePatterns = [
      { pattern: /("password"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /("token"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /("apiKey"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /("api_key"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /("secret"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /("authorization"\s*:\s*)"[^"]*"/gi, replacement: '$1"[REDACTED]"' },
      { pattern: /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, replacement: 'Bearer [REDACTED]' }
    ];
  }

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  /**
   * Sanitize sensitive data from log messages
   */
  sanitize(str) {
    if (typeof str !== 'string') return str;

    let sanitized = str;
    for (const { pattern, replacement } of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    return sanitized;
  }

  /**
   * Mask email for privacy (shows first 2 chars + domain)
   */
  maskEmail(email) {
    if (!email || typeof email !== 'string') return email;
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const masked = local.length > 2 ? local.slice(0, 2) + '***' : '***';
    return `${masked}@${domain}`;
  }

  formatMessage(level, message, data = null, requestId = null) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;
    const reqIdPart = requestId ? ` [${requestId}]` : '';

    let formattedMessage = `[${timestamp}] [${pid}]${reqIdPart} ${level.toUpperCase()}: ${message}`;

    if (data) {
      if (typeof data === 'object') {
        try {
          const jsonStr = JSON.stringify(data);
          // Only include data if it's reasonably sized (avoid huge dumps)
          if (jsonStr.length <= 500) {
            formattedMessage += ` | ${this.sanitize(jsonStr)}`;
          } else {
            // For large objects, just indicate the type/size
            const keys = Object.keys(data);
            formattedMessage += ` | {${keys.length} keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}}`;
          }
        // eslint-disable-next-line no-unused-vars
        } catch (_error) {
          formattedMessage += ' | [Circular or non-serializable object]';
        }
      } else {
        formattedMessage += ` | ${this.sanitize(String(data))}`;
      }
    }

    return formattedMessage;
  }

  writeToFile(message, isError = false) {
    const logFile = isError ? this.errorLogFile : this.logFile;

    try {
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      // Fallback to console if file writing fails
      console.error('Failed to write to log file:', error.message);
      console.log(message);
    }
  }

  log(level, message, data = null, requestId = null) {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data, requestId);
    const isError = level === 'error';

    // Console output with colors (development)
    if (process.env.NODE_ENV === 'development') {
      const colors = {
        error: '\x1b[31m', // Red
        warn: '\x1b[33m',  // Yellow
        info: '\x1b[36m',  // Cyan
        debug: '\x1b[90m'  // Gray
      };

      const reset = '\x1b[0m';
      const color = colors[level] || '';

      console.log(`${color}${formattedMessage}${reset}`);
    } else {
      // Production - plain console output
      if (isError) {
        console.error(formattedMessage);
      } else {
        console.log(formattedMessage);
      }
    }

    // Write to file (production)
    if (process.env.NODE_ENV === 'production') {
      this.writeToFile(formattedMessage, isError);
    }
  }

  error(message, data = null, requestId = null) {
    this.log('error', message, data, requestId);
  }

  warn(message, data = null, requestId = null) {
    this.log('warn', message, data, requestId);
  }

  info(message, data = null, requestId = null) {
    this.log('info', message, data, requestId);
  }

  debug(message, data = null, requestId = null) {
    this.log('debug', message, data, requestId);
  }

  // HTTP request logging (single consolidated log per request)
  request(req, res, responseTime) {
    const { method, url } = req;
    const { statusCode } = res;
    const requestId = req.requestId || '-';
    const userId = req.user?.id || 'anon';

    // Skip logging for static assets at INFO level
    if (url.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)(\?.*)?$/i)) {
      // Only log static assets at DEBUG level
      this.debug(`${method} ${url} ${statusCode} ${responseTime}ms`, null, requestId);
      return;
    }

    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `${method} ${url} ${statusCode} ${responseTime}ms userId=${userId}`, null, requestId);
  }

  // Authentication logging (sanitized)
  auth(action, email, success, reason = null, requestId = null) {
    const level = success ? 'info' : 'warn';
    const maskedEmail = this.maskEmail(email);
    const message = `Auth ${action}: ${maskedEmail} - ${success ? 'success' : 'failed'}`;

    const data = reason ? { reason } : null;
    this.log(level, message, data, requestId);
  }

  // Database operation logging
  database(operation, table, recordId = null, success = true, error = null, requestId = null) {
    const level = success ? 'debug' : 'error';
    const message = `DB ${operation} ${table}${recordId ? ` id=${recordId}` : ''} - ${success ? 'ok' : 'failed'}`;

    const data = error ? { error: error.message } : null;
    this.log(level, message, data, requestId);
  }

  // Security event logging
  security(event, details, severity = 'warn', requestId = null) {
    const message = `Security: ${event}`;
    this.log(severity, message, details, requestId);
  }

  // Performance logging
  performance(operation, duration, metadata = null, requestId = null) {
    // Only log slow operations at INFO level, others at DEBUG
    const level = duration > 1000 ? 'warn' : 'debug';
    const message = `Perf: ${operation} ${duration}ms`;
    this.log(level, message, metadata, requestId);
  }

  // Business event logging (for important user actions)
  event(eventName, details = null, requestId = null) {
    this.info(`Event: ${eventName}`, details, requestId);
  }

  // Log rotation (simple implementation)
  rotateLogs() {
    try {
      const logFiles = [this.logFile, this.errorLogFile];

      logFiles.forEach(logFile => {
        if (fs.existsSync(logFile)) {
          const stats = fs.statSync(logFile);
          const fileSizeInMB = stats.size / (1024 * 1024);

          // Rotate if file is larger than 10MB
          if (fileSizeInMB > 10) {
            const rotatedFile = `${logFile}.${Date.now()}`;
            fs.renameSync(logFile, rotatedFile);

            // Keep only the last 5 rotated files
            const logDir = path.dirname(logFile);
            const baseName = path.basename(logFile);
            const rotatedFiles = fs.readdirSync(logDir)
              .filter(file => file.startsWith(baseName) && file !== baseName)
              .sort()
              .reverse();

            if (rotatedFiles.length > 5) {
              rotatedFiles.slice(5).forEach(file => {
                fs.unlinkSync(path.join(logDir, file));
              });
            }
          }
        }
      });
    } catch (error) {
      this.error('Failed to rotate logs:', error.message);
    }
  }
}

// Create singleton instance
const logger = new Logger();

// Set up log rotation interval (every 24 hours)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    logger.rotateLogs();
  }, 24 * 60 * 60 * 1000); // 24 hours
}

module.exports = logger;
