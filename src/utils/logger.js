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
  }

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const pid = process.pid;

    let formattedMessage = `[${timestamp}] [${pid}] ${level.toUpperCase()}: ${message}`;

    if (data) {
      if (typeof data === 'object') {
        try {
          formattedMessage += ` | Data: ${JSON.stringify(data, null, 2)}`;
        } catch (error) {
          formattedMessage += ' | Data: [Circular or non-serializable object]';
        }
      } else {
        formattedMessage += ` | Data: ${data}`;
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

  log(level, message, data = null) {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data);
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

  error(message, data = null) {
    this.log('error', message, data);
  }

  warn(message, data = null) {
    this.log('warn', message, data);
  }

  info(message, data = null) {
    this.log('info', message, data);
  }

  debug(message, data = null) {
    this.log('debug', message, data);
  }

  // HTTP request logging
  request(req, res, responseTime) {
    const { method, url, ip, headers } = req;
    const { statusCode } = res;
    const userAgent = headers['user-agent'] || 'Unknown';

    const logData = {
      method,
      url,
      ip,
      statusCode,
      responseTime: `${responseTime}ms`,
      userAgent
    };

    const level = statusCode >= 400 ? 'warn' : 'info';
    this.log(level, `HTTP ${method} ${url} - ${statusCode} (${responseTime}ms)`, logData);
  }

  // Authentication logging
  auth(action, email, success, reason = null) {
    const level = success ? 'info' : 'warn';
    const message = `Auth ${action}: ${email} - ${success ? 'Success' : 'Failed'}`;

    const data = {
      action,
      email,
      success,
      ...(reason && { reason })
    };

    this.log(level, message, data);
  }

  // Database operation logging
  database(operation, table, recordId = null, success = true, error = null) {
    const level = success ? 'debug' : 'error';
    const message = `DB ${operation} on ${table}${recordId ? ` (ID: ${recordId})` : ''} - ${success ? 'Success' : 'Failed'}`;

    const data = {
      operation,
      table,
      ...(recordId && { recordId }),
      success,
      ...(error && { error: error.message })
    };

    this.log(level, message, data);
  }

  // Security event logging
  security(event, details, severity = 'warn') {
    const message = `Security Event: ${event}`;

    this.log(severity, message, details);
  }

  // Performance logging
  performance(operation, duration, metadata = null) {
    const message = `Performance: ${operation} completed in ${duration}ms`;

    const data = {
      operation,
      duration,
      ...(metadata && { metadata })
    };

    this.log('debug', message, data);
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
