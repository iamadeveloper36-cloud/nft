const express = require('express');
const emailService = require('../services/emailService');

const router = express.Router();

// Test email route (remove in production)
router.post('/test-email', async (req, res) => {
    try {
        const { email, type } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        let result;
        const testUser = {
            email: email,
            username: 'testuser',
            firstName: 'Test',
            lastName: 'User'
        };

        switch (type) {
            case 'welcome':
                result = await emailService.sendWelcomeEmail(testUser);
                break;
            case 'password-reset':
                result = await emailService.sendPasswordResetEmail(testUser, 'test-token-123');
                break;
            case 'verification':
                result = await emailService.sendEmailVerification(testUser, 'verification-token-123');
                break;
            case 'transaction':
                result = await emailService.sendTransactionNotification(testUser, {
                    type: 'DEPOSIT',
                    amount: '1.5',
                    status: 'COMPLETED',
                    createdAt: new Date()
                });
                break;
            default:
                return res.status(400).json({ message: 'Invalid email type. Use: welcome, password-reset, verification, or transaction' });
        }

        if (result.success) {
            res.json({
                message: `${type} email sent successfully`,
                messageId: result.messageId
            });
        } else {
            res.status(500).json({
                message: 'Failed to send email',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
