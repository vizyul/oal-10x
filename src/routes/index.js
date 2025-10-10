const express = require('express');
const authRoutes = require('./auth.routes');
const { optionalAuthMiddleware, preferencesMiddleware, subscriptionMiddleware } = require('../middleware');
const { emailService } = require('../services');
const { logger } = require('../utils');

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
    title: 'AmplifyContent.ai - Turn 1 YouTube Video Into 17 Content Pieces in Seconds | AI Content Repurposing',
    description: 'Transform YouTube videos into 17 ready-to-publish content pieces instantly. AI-powered transcription and content repurposing for creators, marketers, and businesses. Try it for free today.',
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
    description: 'Your AI Legacy dashboard',
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

// Webhook routes are handled directly in app.js with raw body middleware

// API routes
router.use('/api', require('./api.routes'));

// Admin routes (protected by admin middleware)
router.use('/admin', require('./admin.routes'));

// Terms and Privacy pages
router.get('/terms', (req, res) => {
  res.render('legal/terms', {
    title: 'Terms & Conditions',
    description: 'Our AI Legacy Terms & Conditions',
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
    description: 'Our AI Legacy Privacy Policy',
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
    description: 'YouTube Data Usage and Privacy Information',
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
    title: 'About Our AI Legacy',
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
    description: 'Get in touch with Our AI Legacy',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/contact.css']
  });
});

// Demo page
router.get('/demo', (req, res) => {
  res.render('demo', {
    title: 'Request Demo',
    description: 'Schedule a demo of Our AI Legacy platform',
    user: req.user,
    subscription: req.subscriptionInfo,
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// Demo form submission
router.post('/demo', async (req, res) => {
  try {
    const { name, email, organization, role, congregationSize, interest, timeline } = req.body;

    // Validate required fields
    if (!name || !email || !organization) {
      return res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of Our AI Legacy platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        error: 'Please fill in all required fields.',
        formData: req.body
      });
    }

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
      'sales@ourailegacy.com',
      `Demo Request: ${organization}`,
      demoEmailContent
    );

    if (result.success) {
      res.render('demo', {
        title: 'Request Demo',
        description: 'Schedule a demo of Our AI Legacy platform',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        success: 'Thank you for your demo request! Our team will contact you within 24 hours to schedule your personalized demonstration.'
      });
    } else {
      throw new Error('Failed to send demo request');
    }

  } catch (error) {
    console.error('Demo form error:', error);
    res.render('demo', {
      title: 'Request Demo',
      description: 'Schedule a demo of Our AI Legacy platform',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      error: 'There was an error submitting your demo request. Please try again.',
      formData: req.body
    });
  }
});

// Contact form submission
router.post('/contact', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with Our AI Legacy',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        error: 'All fields are required.',
        formData: { name, email, subject, message }
      });
    }

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
      'support@ourailegacy.com',
      `Contact Form: ${subject}`,
      contactEmailContent
    );

    if (result.success) {
      res.render('contact', {
        title: 'Contact Us',
        description: 'Get in touch with Our AI Legacy',
        user: req.user,
        subscription: req.subscriptionInfo,
        showHeader: true,
        showFooter: true,
        showNav: true,
        additionalCSS: ['/css/contact.css'],
        success: 'Thank you for your message! We\'ll get back to you soon.'
      });
    } else {
      throw new Error('Failed to send email');
    }

  } catch (error) {
    console.error('Contact form error:', error);
    res.render('contact', {
      title: 'Contact Us',
      description: 'Get in touch with Our AI Legacy',
      user: req.user,
      subscription: req.subscriptionInfo,
      showHeader: true,
      showFooter: true,
      showNav: true,
      additionalCSS: ['/css/contact.css'],
      error: 'There was an error sending your message. Please try again.',
      formData: req.body
    });
  }
});

module.exports = router;
