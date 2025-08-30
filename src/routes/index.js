const express = require('express');
const authRoutes = require('./auth.routes');
const { optionalAuthMiddleware } = require('../middleware');
const { emailService } = require('../services');

const router = express.Router();

// Apply optional authentication middleware to all routes
router.use(optionalAuthMiddleware);

// Authentication routes
router.use('/auth', authRoutes);

// Home page route
router.get('/', (req, res) => {
  res.render('index', {
    title: 'Welcome to Our AI Legacy',
    description: 'Empowering ministry through responsible AI innovation',
    user: req.user,
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
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

// API routes
router.use('/api', require('./api.routes'));

// Terms and Privacy pages
router.get('/terms', (req, res) => {
  res.render('legal/terms', {
    title: 'Terms & Conditions',
    description: 'Our AI Legacy Terms & Conditions',
    showHeader: true,
    showFooter: true,
    showNav: true
  });
});

router.get('/privacy', (req, res) => {
  res.render('legal/privacy', {
    title: 'Privacy Policy',
    description: 'Our AI Legacy Privacy Policy',
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
    showHeader: true,
    showFooter: true,
    showNav: true,
    additionalCSS: ['/css/contact.css']
  });
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