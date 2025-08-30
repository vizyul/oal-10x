// Custom validation utilities

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with score and requirements
 */
function validatePassword(password) {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[@$!%*?&]/.test(password)
  };
  
  const score = Object.values(requirements).filter(Boolean).length;
  
  let strength = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 4) strength = 'good';
  else if (score >= 3) strength = 'fair';
  
  return {
    isValid: score >= 4, // Require at least 4 out of 5 criteria
    score,
    strength,
    requirements
  };
}

/**
 * Validate name (first name, last name)
 * @param {string} name - Name to validate
 * @param {number} minLength - Minimum length (default: 2)
 * @param {number} maxLength - Maximum length (default: 50)
 * @returns {Object} - Validation result
 */
function validateName(name, minLength = 2, maxLength = 50) {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Name is required' };
  }
  
  const trimmedName = name.trim();
  
  if (trimmedName.length < minLength) {
    return { isValid: false, error: `Name must be at least ${minLength} characters long` };
  }
  
  if (trimmedName.length > maxLength) {
    return { isValid: false, error: `Name must be no more than ${maxLength} characters long` };
  }
  
  // Only allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[A-Za-z\s'-]+$/;
  if (!nameRegex.test(trimmedName)) {
    return { isValid: false, error: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }
  
  return { isValid: true, value: trimmedName };
}

/**
 * Validate phone number (basic international format)
 * @param {string} phone - Phone number to validate
 * @returns {Object} - Validation result
 */
function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }
  
  // Remove all non-digit characters for validation
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Check if it's a reasonable length (7-15 digits)
  if (digitsOnly.length < 7 || digitsOnly.length > 15) {
    return { isValid: false, error: 'Phone number must be between 7 and 15 digits' };
  }
  
  // Basic format validation (allows various international formats)
  const phoneRegex = /^[\+]?[1-9][\d]{0,3}[\s\-\(\)]?[\d\s\-\(\)]{7,12}[\d]$/;
  if (!phoneRegex.test(phone)) {
    return { isValid: false, error: 'Please enter a valid phone number' };
  }
  
  return { isValid: true, value: phone.trim() };
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @param {boolean} requireHttps - Whether to require HTTPS (default: false)
 * @returns {Object} - Validation result
 */
function validateUrl(url, requireHttps = false) {
  if (!url || typeof url !== 'string') {
    return { isValid: false, error: 'URL is required' };
  }
  
  try {
    const urlObj = new URL(url);
    
    if (requireHttps && urlObj.protocol !== 'https:') {
      return { isValid: false, error: 'URL must use HTTPS' };
    }
    
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return { isValid: false, error: 'URL must use HTTP or HTTPS protocol' };
    }
    
    return { isValid: true, value: url.trim() };
  } catch (error) {
    return { isValid: false, error: 'Please enter a valid URL' };
  }
}

/**
 * Validate date string
 * @param {string} dateString - Date string to validate
 * @param {string} format - Expected format (default: 'YYYY-MM-DD')
 * @returns {Object} - Validation result
 */
function validateDate(dateString, format = 'YYYY-MM-DD') {
  if (!dateString || typeof dateString !== 'string') {
    return { isValid: false, error: 'Date is required' };
  }
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { isValid: false, error: 'Please enter a valid date' };
  }
  
  // Check if the date string matches the expected format
  if (format === 'YYYY-MM-DD') {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return { isValid: false, error: 'Date must be in YYYY-MM-DD format' };
    }
  }
  
  return { isValid: true, value: date };
}

/**
 * Validate file upload
 * @param {Object} file - File object from multer or similar
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
function validateFile(file, options = {}) {
  const {
    maxSize = 5 * 1024 * 1024, // 5MB default
    allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'],
    allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif']
  } = options;
  
  if (!file) {
    return { isValid: false, error: 'No file provided' };
  }
  
  // Check file size
  if (file.size > maxSize) {
    return { 
      isValid: false, 
      error: `File size must be less than ${Math.round(maxSize / (1024 * 1024))}MB` 
    };
  }
  
  // Check MIME type
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return { 
      isValid: false, 
      error: `File type not allowed. Allowed types: ${allowedMimeTypes.join(', ')}` 
    };
  }
  
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { 
      isValid: false, 
      error: `File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}` 
    };
  }
  
  return { isValid: true, value: file };
}

/**
 * Sanitize HTML input to prevent XSS
 * @param {string} input - HTML string to sanitize
 * @returns {string} - Sanitized HTML string
 */
function sanitizeHtml(input) {
  if (!input || typeof input !== 'string') {
    return '';
  }
  
  // Basic HTML escaping
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate and sanitize text input
 * @param {string} input - Text to validate and sanitize
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
function validateText(input, options = {}) {
  const {
    minLength = 0,
    maxLength = 1000,
    allowHtml = false,
    trim = true
  } = options;
  
  if (input === null || input === undefined) {
    if (minLength > 0) {
      return { isValid: false, error: 'This field is required' };
    }
    return { isValid: true, value: '' };
  }
  
  if (typeof input !== 'string') {
    return { isValid: false, error: 'Input must be a string' };
  }
  
  let processedInput = trim ? input.trim() : input;
  
  if (processedInput.length < minLength) {
    return { 
      isValid: false, 
      error: minLength === 1 ? 'This field is required' : `Must be at least ${minLength} characters long` 
    };
  }
  
  if (processedInput.length > maxLength) {
    return { isValid: false, error: `Must be no more than ${maxLength} characters long` };
  }
  
  if (!allowHtml) {
    processedInput = sanitizeHtml(processedInput);
  }
  
  return { isValid: true, value: processedInput };
}

/**
 * Validate numeric input
 * @param {any} input - Input to validate as number
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
function validateNumber(input, options = {}) {
  const {
    min = -Infinity,
    max = Infinity,
    integer = false,
    positive = false
  } = options;
  
  const num = Number(input);
  
  if (isNaN(num)) {
    return { isValid: false, error: 'Must be a valid number' };
  }
  
  if (integer && !Number.isInteger(num)) {
    return { isValid: false, error: 'Must be a whole number' };
  }
  
  if (positive && num <= 0) {
    return { isValid: false, error: 'Must be a positive number' };
  }
  
  if (num < min) {
    return { isValid: false, error: `Must be at least ${min}` };
  }
  
  if (num > max) {
    return { isValid: false, error: `Must be no more than ${max}` };
  }
  
  return { isValid: true, value: num };
}

/**
 * Validate array input
 * @param {any} input - Input to validate as array
 * @param {Object} options - Validation options
 * @returns {Object} - Validation result
 */
function validateArray(input, options = {}) {
  const {
    minLength = 0,
    maxLength = Infinity,
    unique = false,
    itemValidator = null
  } = options;
  
  if (!Array.isArray(input)) {
    return { isValid: false, error: 'Must be an array' };
  }
  
  if (input.length < minLength) {
    return { isValid: false, error: `Must have at least ${minLength} items` };
  }
  
  if (input.length > maxLength) {
    return { isValid: false, error: `Must have no more than ${maxLength} items` };
  }
  
  if (unique) {
    const uniqueItems = [...new Set(input)];
    if (uniqueItems.length !== input.length) {
      return { isValid: false, error: 'All items must be unique' };
    }
  }
  
  if (itemValidator && typeof itemValidator === 'function') {
    for (let i = 0; i < input.length; i++) {
      const itemResult = itemValidator(input[i], i);
      if (!itemResult.isValid) {
        return { isValid: false, error: `Item ${i + 1}: ${itemResult.error}` };
      }
    }
  }
  
  return { isValid: true, value: input };
}

module.exports = {
  isValidEmail,
  validatePassword,
  validateName,
  validatePhoneNumber,
  validateUrl,
  validateDate,
  validateFile,
  sanitizeHtml,
  validateText,
  validateNumber,
  validateArray
};