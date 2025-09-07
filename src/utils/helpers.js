const crypto = require('crypto');

/**
 * Generate a secure random string
 * @param {number} length - Length of the random string
 * @param {string} charset - Character set to use
 * @returns {string} - Random string
 */
function generateRandomString(length = 32, charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
  let result = '';
  const charsetLength = charset.length;
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += charset[randomBytes[i] % charsetLength];
  }

  return result;
}

/**
 * Generate a secure token for email verification, password reset, etc.
 * @param {number} bytes - Number of random bytes (default: 32)
 * @returns {string} - Hex token
 */
function generateSecureToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Hash a password using crypto.pbkdf2Sync
 * @param {string} password - Password to hash
 * @param {string} salt - Salt for hashing
 * @returns {string} - Hashed password
 */
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(32).toString('hex');
  }

  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a hash
 * @param {string} password - Password to verify
 * @param {string} hashedPassword - Hashed password to verify against
 * @returns {boolean} - True if password matches
 */
function verifyPassword(password, hashedPassword) {
  const [salt, hash] = hashedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
}

/**
 * Format a date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Format string (default: 'YYYY-MM-DD')
 * @returns {string} - Formatted date
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * Format a relative time string (e.g., "2 hours ago")
 * @param {Date|string} date - Date to format
 * @returns {string} - Relative time string
 */
function formatRelativeTime(date) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const diffInSeconds = Math.floor((now - d) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 2592000) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 31536000) {
    const months = Math.floor(diffInSeconds / 2592000);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diffInSeconds / 31536000);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }
}

/**
 * Capitalize the first letter of a string
 * @param {string} str - String to capitalize
 * @returns {string} - Capitalized string
 */
function capitalize(str) {
  if (!str || typeof str !== 'string') return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Convert string to title case
 * @param {string} str - String to convert
 * @returns {string} - Title case string
 */
function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Generate a slug from a string
 * @param {string} str - String to slugify
 * @param {string} separator - Separator character (default: '-')
 * @returns {string} - Slug string
 */
function slugify(str, separator = '-') {
  if (!str || typeof str !== 'string') return '';

  return str
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, separator)           // Replace spaces with separator
    .replace(/[^\w\-]+/g, '')            // Remove all non-word chars
    .replace(/\-\-+/g, separator)        // Replace multiple separators with single separator
    .replace(/^-+/, '')                  // Trim separator from start of text
    .replace(/-+$/, '');                 // Trim separator from end of text
}

/**
 * Truncate text to a specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength = 100, suffix = '...') {
  if (!text || typeof text !== 'string') return '';

  if (text.length <= maxLength) return text;

  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} - Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
  return obj;
}

/**
 * Check if an object is empty
 * @param {any} obj - Object to check
 * @returns {boolean} - True if empty
 */
function isEmpty(obj) {
  if (obj == null) return true;
  if (typeof obj === 'string' || Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  return false;
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Execute immediately
 * @returns {Function} - Debounced function
 */
function debounce(func, wait, immediate = false) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} - Throttled function
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Retry a function with exponential backoff
 * @param {Function} func - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in milliseconds
 * @returns {Promise} - Promise that resolves when function succeeds
 */
async function retry(func, maxRetries = 3, delay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await func();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: delay * 2^(attempt - 1)
      const backoffDelay = delay * Math.pow(2, attempt - 1);
      await sleep(backoffDelay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} - Promise that resolves after the delay
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a UUID v4
 * @returns {string} - UUID string
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Mask sensitive data (email, phone, etc.)
 * @param {string} value - Value to mask
 * @param {string} type - Type of data ('email', 'phone', 'card')
 * @returns {string} - Masked value
 */
function maskSensitiveData(value, type = 'email') {
  if (!value || typeof value !== 'string') return '';

  switch (type) {
  case 'email':
    const [username, domain] = value.split('@');
    if (!domain) return value;
    const maskedUsername = username.length > 2
      ? username.substring(0, 2) + '*'.repeat(username.length - 2)
      : '*'.repeat(username.length);
    return `${maskedUsername}@${domain}`;

  case 'phone':
    if (value.length <= 4) return value;
    const visibleDigits = 4;
    const masked = '*'.repeat(value.length - visibleDigits);
    return masked + value.slice(-visibleDigits);

  case 'card':
    if (value.length <= 4) return value;
    const lastFour = value.slice(-4);
    return '*'.repeat(value.length - 4) + lastFour;

  default:
    return value.length > 4
      ? value.substring(0, 2) + '*'.repeat(value.length - 4) + value.slice(-2)
      : '*'.repeat(value.length);
  }
}

/**
 * Parse user agent string to get browser info
 * @param {string} userAgent - User agent string
 * @returns {Object} - Browser info object
 */
function parseUserAgent(userAgent) {
  if (!userAgent) return { browser: 'Unknown', os: 'Unknown' };

  const browsers = {
    Chrome: /Chrome\/(\d+)/,
    Firefox: /Firefox\/(\d+)/,
    Safari: /Safari\/(\d+)/,
    Edge: /Edge\/(\d+)/,
    Opera: /Opera\/(\d+)/
  };

  const operatingSystems = {
    Windows: /Windows NT (\d+\.\d+)/,
    macOS: /Mac OS X (\d+[._]\d+)/,
    Linux: /Linux/,
    Android: /Android (\d+)/,
    iOS: /OS (\d+_\d+)/
  };

  let browser = 'Unknown';
  let browserVersion = '';
  let os = 'Unknown';
  let osVersion = '';

  // Detect browser
  for (const [name, regex] of Object.entries(browsers)) {
    const match = userAgent.match(regex);
    if (match) {
      browser = name;
      browserVersion = match[1];
      break;
    }
  }

  // Detect OS
  for (const [name, regex] of Object.entries(operatingSystems)) {
    const match = userAgent.match(regex);
    if (match) {
      os = name;
      osVersion = match[1] ? match[1].replace('_', '.') : '';
      break;
    }
  }

  return {
    browser: browserVersion ? `${browser} ${browserVersion}` : browser,
    os: osVersion ? `${os} ${osVersion}` : os,
    isMobile: /Mobile|Android|iPhone|iPad/.test(userAgent),
    isBot: /bot|crawler|spider|crawling/i.test(userAgent)
  };
}

/**
 * Format file size in human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted file size
 */
function formatFileSize(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate and normalize phone number
 * @param {string} phoneNumber - Phone number to normalize
 * @param {string} defaultCountryCode - Default country code (e.g., '+1')
 * @returns {string} - Normalized phone number
 */
function normalizePhoneNumber(phoneNumber, defaultCountryCode = '+1') {
  if (!phoneNumber) return '';

  // Remove all non-digit characters
  let digits = phoneNumber.replace(/\D/g, '');

  // If no country code and number doesn't start with country code digits
  if (digits.length === 10 && !phoneNumber.startsWith('+')) {
    digits = defaultCountryCode.replace('+', '') + digits;
  }

  // Format as +X-XXX-XXX-XXXX for US numbers
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  // For international numbers, just add the + if not present
  if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  } else {
    return '+' + digits;
  }
}

/**
 * Generate initials from a name
 * @param {string} name - Full name
 * @param {number} maxLength - Maximum number of initials
 * @returns {string} - Initials
 */
function generateInitials(name, maxLength = 2) {
  if (!name || typeof name !== 'string') return '';

  const words = name.trim().split(/\s+/);
  const initials = words
    .slice(0, maxLength)
    .map(word => word.charAt(0).toUpperCase())
    .join('');

  return initials;
}

/**
 * Calculate password strength score
 * @param {string} password - Password to analyze
 * @returns {Object} - Strength analysis
 */
function calculatePasswordStrength(password) {
  if (!password) return { score: 0, feedback: [] };

  let score = 0;
  const feedback = [];

  // Length check
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('Use at least 8 characters');
  }

  if (password.length >= 12) {
    score += 1;
  }

  // Character variety
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include lowercase letters');
  }

  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include uppercase letters');
  }

  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include numbers');
  }

  if (/[^A-Za-z0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Include special characters');
  }

  // Common patterns penalty
  if (/(.)\1{2,}/.test(password)) {
    score -= 1;
    feedback.push('Avoid repeated characters');
  }

  if (/123|abc|qwe|asd/i.test(password)) {
    score -= 1;
    feedback.push('Avoid common patterns');
  }

  const strength = score <= 2 ? 'weak' : score <= 4 ? 'fair' : score <= 5 ? 'good' : 'strong';

  return {
    score: Math.max(0, Math.min(6, score)),
    strength,
    feedback
  };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
  if (!text) return '';

  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#039;'
  };

  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate a secure filename
 * @param {string} originalName - Original filename
 * @returns {string} - Secure filename
 */
function generateSecureFilename(originalName) {
  if (!originalName) return generateUUID();

  const extension = originalName.split('.').pop();
  const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, '');

  // Remove dangerous characters and normalize
  const safeName = nameWithoutExtension
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

  const timestamp = Date.now();
  const randomStr = generateRandomString(8);

  return `${safeName}_${timestamp}_${randomStr}.${extension}`;
}

module.exports = {
  generateRandomString,
  generateSecureToken,
  hashPassword,
  verifyPassword,
  formatDate,
  formatRelativeTime,
  capitalize,
  toTitleCase,
  slugify,
  truncateText,
  deepClone,
  isEmpty,
  debounce,
  throttle,
  retry,
  sleep,
  generateUUID,
  maskSensitiveData,
  parseUserAgent,
  formatFileSize,
  normalizePhoneNumber,
  generateInitials,
  calculatePasswordStrength,
  escapeHtml,
  generateSecureFilename
};
