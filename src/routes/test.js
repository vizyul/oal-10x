// routes/test.js
router.get('/test-email', async (req, res) => {
    try {
        const emailService = require('../services/emailService');
        await emailService.sendVerificationEmail(
            'test@yourdomain.com', 
            '123456', 
            'Test User'
        );
        res.json({ success: true, message: 'Test email sent!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});