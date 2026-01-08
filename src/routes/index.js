const express = require('express');
const { body, validationResult } = require('express-validator');
const authRoutes = require('./auth.routes');
const { optionalAuthMiddleware, preferencesMiddleware, subscriptionMiddleware } = require('../middleware');
const { contactFormLimit } = require('../middleware/rate-limiting.middleware');
const { emailService } = require('../services');
const { logger } = require('../utils');
const ogimg = process.env.OGIMG;

const router = express.Router();

// Apply optional authentication middleware to all routes
router.use(optionalAuthMiddleware);

// Apply preferences middleware to load user theme preferences
router.use(preferencesMiddleware);

// Apply subscription middleware to add subscription info for authenticated users
router.use(subscriptionMiddleware.addSubscriptionInfo);

// Authentication routes
router.use('/auth', authRoutes);

// Home page route
router.get('/', (req, res) => {
  res.render('index', {
    title: 'AmplifyContent.ai - Drop a Video. Get 15+ Content Pieces. In Seconds.',
    description: 'AmplifyContent.ai transcribes your video and transforms it into blog posts, social copy, newsletters, and more—so you can publish everywhere without the grind.',
    ogimage: ogimg,
    user: req.user,
    userTheme: req.userTheme,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// Dashboard route (protected)
router.get('/dashboard', require('../middleware').authMiddleware, (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard',
    description: 'AmplifyContent.ai dashboard',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// Profile route (protected)
router.get('/profile', require('../middleware').authMiddleware, async (req, res) => {
  try {
    const preferencesService = require('../services/preferences.service');
    let userPreferences = null;

    try {
      userPreferences = await preferencesService.getUserPreferences(req.user.email);
    // eslint-disable-next-line no-unused-vars
    } catch (_prefError) {
      // If preferences don't exist, create default ones
      logger.info(`Creating default preferences for user ${req.user.email}`);
      userPreferences = await preferencesService.createDefaultPreferences(req.user.email);
    }

    res.render('profile', {
      title: 'Profile',
      description: 'Manage your profile and preferences',
      user: req.user,
      preferences: userPreferences,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true
    });
  } catch (error) {
    logger.error('Profile route error:', error);
    res.render('profile', {
      title: 'Profile',
      description: 'Manage your profile and preferences',
      user: req.user,
      preferences: { aiProvider: 'gemini' }, // fallback
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true
    });
  }
});

// Subscription routes
router.use('/subscription', require('./subscription-web.routes'));

// Videos routes
router.use('/videos', require('./videos-web.routes'));

// Thumbnails routes (web pages)
router.use('/thumbnails', require('./thumbnails-web.routes'));

// Account deletion routes
router.use('/account', require('./account-deletion.routes'));

// Webhook routes are handled directly in app.js with raw body middleware

// API routes
router.use('/api', require('./api.routes'));

// Admin routes (protected by admin middleware)
router.use('/admin', require('./admin.routes'));

// Affiliate routes
router.use('/affiliate', require('./affiliate.routes'));

// Cloud storage routes
router.use('/cloud-storage', require('./cloud-storage.routes'));

// Cloud storage settings page
router.get('/settings/cloud-storage', require('../middleware').authMiddleware, async (req, res) => {
  try {
    const cloudStorageService = require('../services/cloud-storage.service');
    const database = require('../services/database.service');

    // Get connection status
    const connectionStatus = await cloudStorageService.getConnectionStatus(req.user.id);

    // Get preferences
    const prefResult = await database.query(`
      SELECT cloud_storage_provider, cloud_storage_auto_upload,
             cloud_storage_upload_format, cloud_storage_folder_per_video
      FROM user_preferences WHERE users_id = $1
    `, [req.user.id]);

    const preferences = prefResult.rows[0] || {
      cloud_storage_provider: null,
      cloud_storage_auto_upload: false,
      cloud_storage_upload_format: 'both',
      cloud_storage_folder_per_video: true
    };

    // Get query params for success/error messages
    const { success, error } = req.query;

    res.render('settings/cloud-storage', {
      title: 'Cloud Storage Settings',
      description: 'Connect your cloud storage accounts for automatic content uploads',
      user: req.user,
      subscription: req.subscriptionInfo,
      connectionStatus,
      preferences,
      successMessage: success ? getSuccessMessage(success) : null,
      errorMessage: error ? getErrorMessage(error) : null,
      showHeader: true,
      showFooter: true,
      showNav: true
    });
  } catch (err) {
    require('../utils').logger.error('Cloud storage settings page error:', err);
    res.render('settings/cloud-storage', {
      title: 'Cloud Storage Settings',
      user: req.user,
      subscription: req.subscriptionInfo,
      connectionStatus: {},
      preferences: {},
      errorMessage: 'Failed to load cloud storage settings',
      showHeader: true,
      showFooter: true,
      showNav: true
    });
  }
});

// Helper functions for cloud storage messages
function getSuccessMessage(code) {
  const messages = {
    'google_drive_connected': 'Google Drive connected successfully!',
    'onedrive_connected': 'OneDrive connected successfully!',
    'dropbox_connected': 'Dropbox connected successfully!',
    'preferences_saved': 'Your preferences have been saved.'
  };
  return messages[code] || 'Operation completed successfully.';
}

function getErrorMessage(code) {
  const messages = {
    'oauth_denied': 'Connection was cancelled or denied.',
    'invalid_callback': 'Invalid callback. Please try again.',
    'invalid_state': 'Session expired. Please try again.',
    'connection_failed': 'Failed to connect. Please try again.'
  };
  return messages[code] || 'An error occurred. Please try again.';
}

// Terms and Privacy pages
router.get('/terms', (req, res) => {
  res.render('legal/terms', {
    title: 'Terms & Conditions',
    description: 'AmplifyContent.ai Terms & Conditions',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

router.get('/privacy', (req, res) => {
  res.render('legal/privacy', {
    title: 'Privacy Policy',
    description: 'AmplifyContent.ai Privacy Policy',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

router.get('/youtube-data-usage', (req, res) => {
  res.render('legal/youtube-data-usage', {
    title: 'YouTube Data Usage',
    description: 'AmplifyContent.ai YouTube Data Usage and Privacy Information',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// About page
router.get('/about', (req, res) => {
  res.render('about', {
    title: 'About AmplifyContent.ai',
    description: 'Learn about our mission and vision',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// Contact page
router.get('/contact', (req, res) => {
  res.render('contact', {
    title: 'Contact Us',
    description: 'Get in touch with AmplifyContent.ai',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/contact.css'],
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  });
});

// Demo page
router.get('/demo', (req, res) => {
  res.render('demo', {
    title: 'Request Demo',
    description: 'Schedule a demo of AmplifyContent.ai platform',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  });
});

// Demo form submission with validation
router.post('/demo', [
  contactFormLimit, // Reuse contact form rate limit (5 per hour)
  // Validation and sanitization rules
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail()
    .isLength({ max: 254 }).withMessage('Email is too long')
    .matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).withMessage('Please enter a valid email format'),
  body('organization')
    .trim()
    .notEmpty().withMessage('Organization is required')
    .isLength({ min: 2, max: 200 }).withMessage('Organization must be between 2 and 200 characters')
    .escape(),
  body('role')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .escape(),
  body('congregationSize')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .escape(),
  body('timeline')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .escape(),
  body('interest')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('Interest/Notes must be less than 2000 characters')
    .escape(),
  body('website')
    .optional()
    .trim()
], async (req, res) => {
  try {
    // Honeypot check
    if (req.body.website) {
      logger.warn('Bot detected via honeypot field on demo form', { ip: req.ip });
      return res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of AmplifyContent.ai platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        success: 'Thank you for your demo request! Our team will contact you within 24 hours to schedule your personalized demonstration.'
      });
    }

    // Verify reCAPTCHA
    const recaptchaResponse = req.body['g-recaptcha-response'];
    if (!recaptchaResponse) {
      return res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of AmplifyContent.ai platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: 'Please complete the reCAPTCHA verification.',
        formData: req.body
      });
    }

    // Verify reCAPTCHA with Google
    const axios = require('axios');
    const recaptchaVerify = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaResponse,
          remoteip: req.ip
        }
      }
    );

    if (!recaptchaVerify.data.success) {
      logger.warn('reCAPTCHA verification failed on demo form', { ip: req.ip });
      return res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of AmplifyContent.ai platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: 'reCAPTCHA verification failed. Please try again.',
        formData: req.body
      });
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0].msg;
      logger.warn('Demo form validation failed', {
        ip: req.ip,
        errors: errors.array(),
        email: req.body.email
      });

      return res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of AmplifyContent.ai platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: firstError,
        formData: req.body
      });
    }

    // Get sanitized values
    const { name, email, organization, role, congregationSize, interest, timeline } = req.body;

    // Send demo request email to sales team
    const demoEmailContent = `
      <h2>New Demo Request</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Organization:</strong> ${organization}</p>
      <p><strong>Role:</strong> ${role || 'Not specified'}</p>
      <p><strong>Congregation Size:</strong> ${congregationSize || 'Not specified'}</p>
      <p><strong>Timeline:</strong> ${timeline || 'Not specified'}</p>
      <p><strong>Interest/Notes:</strong></p>
      <p>${interest ? interest.replace(/\n/g, '<br>') : 'No additional notes provided'}</p>
    `;

    const result = await emailService.sendEmail(
      'support@amplifycontent.ai',
      `Demo Request: ${organization}`,
      demoEmailContent
    );

    if (result.success) {
      res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of AmplifyContent.ai platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        success: 'Thank you for your demo request! Our team will contact you within 24 hours to schedule your personalized demonstration.'
      });
    } else {
      throw new Error('Failed to send demo request');
    }

  } catch (error) {
    console.error('Demo form error:', error);
    res.render('demo', {
      title: 'Request Demo',
      description: 'Schedule a demo of AmplifyContent.ai platform',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      error: 'There was an error submitting your demo request. Please try again.',
      formData: req.body
    });
  }
});

// Contact form submission with validation
router.post('/contact', [
  contactFormLimit,
  // Validation and sanitization rules
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .matches(/^[A-Za-z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes')
    .escape(), // Sanitize HTML
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail()
    .isLength({ max: 254 }).withMessage('Email is too long')
    .matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).withMessage('Please enter a valid email format'),
  body('subject')
    .trim()
    .notEmpty().withMessage('Subject is required')
    .isLength({ min: 3, max: 200 }).withMessage('Subject must be between 3 and 200 characters')
    .escape(), // Sanitize HTML
  body('message')
    .trim()
    .notEmpty().withMessage('Message is required')
    .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10 and 5000 characters')
    .escape(), // Sanitize HTML
  body('website')
    .optional()
    .trim()
], async (req, res) => {
  try {
    // Honeypot check - if 'website' field is filled, it's a bot
    if (req.body.website) {
      logger.warn('Bot detected via honeypot field', { ip: req.ip });
      // Return success to fool the bot
      return res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with AmplifyContent.ai',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        success: 'Thank you for your message! We\'ll get back to you soon.'
      });
    }

    // Verify reCAPTCHA
    const recaptchaResponse = req.body['g-recaptcha-response'];
    if (!recaptchaResponse) {
      return res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with AmplifyContent.ai',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: 'Please complete the reCAPTCHA verification.',
        formData: req.body
      });
    }

    // Verify reCAPTCHA with Google
    const axios = require('axios');
    const recaptchaVerify = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaResponse,
          remoteip: req.ip
        }
      }
    );

    if (!recaptchaVerify.data.success) {
      logger.warn('reCAPTCHA verification failed', { ip: req.ip, errors: recaptchaVerify.data['error-codes'] });
      return res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with AmplifyContent.ai',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: 'reCAPTCHA verification failed. Please try again.',
        formData: req.body
      });
    }

    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0].msg;
      logger.warn('Contact form validation failed', {
        ip: req.ip,
        errors: errors.array(),
        email: req.body.email
      });

      return res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with AmplifyContent.ai',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        error: firstError,
        formData: req.body
      });
    }

    // Get sanitized values
    const { name, email, subject, message } = req.body;

    // Send contact email to support
    const contactEmailContent = `
      <h2>New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Subject:</strong> ${subject}</p>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, '<br>')}</p>
    `;

    const result = await emailService.sendEmail(
      'support@amplifycontent.ai',
      `Contact Form: ${subject}`,
      contactEmailContent
    );

    if (result.success) {
      res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with AmplifyContent.ai',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
        success: 'Thank you for your message! We\'ll get back to you soon.'
      });
    } else {
      throw new Error('Failed to send email');
    }

  } catch (error) {
    console.error('Contact form error:', error);
    res.render('contact', {
      title: 'Contact Us',
      description: 'Get in touch with AmplifyContent.ai',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      additionalCSS: ['/css/contact.css'],
      recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY,
      error: 'There was an error sending your message. Please try again.',
      formData: req.body
    });
  }
});

module.exports = router;
