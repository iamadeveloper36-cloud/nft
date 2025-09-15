const nodemailer = require('nodemailer');

// Email configuration
const emailConfig = {
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: 'metaopenverse@outlook.com',
        pass: process.env.OUTLOOK_APP_PASSWORD || 'Denskosko@gmail.com1'
    },
    tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
};

// Debug: Check if environment variables are loaded
console.log('Environment check:');
console.log('OUTLOOK_APP_PASSWORD exists:', !!process.env.OUTLOOK_APP_PASSWORD);
console.log('OUTLOOK_APP_PASSWORD length:', process.env.OUTLOOK_APP_PASSWORD ? process.env.OUTLOOK_APP_PASSWORD.length : 'undefined');
console.log('Using password:', process.env.OUTLOOK_APP_PASSWORD ? 'App Password from env' : 'Fallback password');

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
transporter.verify((error, success) => {
    if (error) {
        console.log('Email service error:', error);
    } else {
        console.log('Email service is ready to send messages');
    }
});

// Email templates
const emailTemplates = {
    welcome: {
        subject: 'Welcome to MetaOpenVerse! 🎉',
        html: (user) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #ffffff; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6, #ec4899); padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Welcome to MetaOpenVerse!</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your journey into the metaverse begins now</p>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #3b82f6; margin-bottom: 20px;">Hello ${user.username || 'there'}! 👋</h2>
                    <p style="line-height: 1.6; margin-bottom: 20px;">
                        Thank you for joining MetaOpenVerse, the premier NFT marketplace for the metaverse. 
                        You're now part of a community that's shaping the future of digital ownership.
                    </p>
                    <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #8b5cf6; margin-top: 0;">What's Next?</h3>
                        <ul style="line-height: 1.8;">
                            <li>🎨 Explore unique NFTs from top collections</li>
                            <li>💰 Buy, sell, and trade digital assets</li>
                            <li>🏆 Participate in exclusive auctions</li>
                            <li>👥 Connect with the community</li>
                        </ul>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard" 
                           style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            Start Exploring
                        </a>
                    </div>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        If you have any questions, feel free to reach out to our support team at 
                        <a href="mailto:metaopenverse@outlook.com" style="color: #3b82f6;">metaopenverse@outlook.com</a>
                    </p>
                </div>
                <div style="background: #2a2a2a; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                    <p>© 2024 MetaOpenVerse. All rights reserved.</p>
                    <p>This email was sent to ${user.email}</p>
                </div>
            </div>
        `
    },

    passwordReset: {
        subject: 'Reset Your MetaOpenVerse Password',
        html: (user, resetToken) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #ffffff; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #ef4444, #f97316); padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Password Reset Request</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Secure your account</p>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #ef4444; margin-bottom: 20px;">Hello ${user.username || 'there'}! 🔐</h2>
                    <p style="line-height: 1.6; margin-bottom: 20px;">
                        We received a request to reset your password for your MetaOpenVerse account. 
                        If you didn't make this request, you can safely ignore this email.
                    </p>
                    <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <p style="margin: 0 0 15px 0; font-weight: bold;">Click the button below to reset your password:</p>
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}" 
                           style="background: linear-gradient(135deg, #ef4444, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            Reset Password
                        </a>
                    </div>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        This link will expire in 1 hour for security reasons. If you need a new link, 
                        please request another password reset.
                    </p>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        If you have any questions, contact us at 
                        <a href="mailto:metaopenverse@outlook.com" style="color: #3b82f6;">metaopenverse@outlook.com</a>
                    </p>
                </div>
                <div style="background: #2a2a2a; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                    <p>© 2024 MetaOpenVerse. All rights reserved.</p>
                    <p>This email was sent to ${user.email}</p>
                </div>
            </div>
        `
    },

    emailVerification: {
        subject: 'Verify Your MetaOpenVerse Email Address',
        html: (user, verificationToken) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #ffffff; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #10b981, #3b82f6); padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Verify Your Email</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Complete your account setup</p>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #10b981; margin-bottom: 20px;">Hello ${user.username || 'there'}! ✉️</h2>
                    <p style="line-height: 1.6; margin-bottom: 20px;">
                        Thank you for signing up for MetaOpenVerse! To complete your account setup and start exploring the metaverse, 
                        please verify your email address by clicking the button below.
                    </p>
                    <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <p style="margin: 0 0 15px 0; font-weight: bold;">Click the button below to verify your email:</p>
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verificationToken}" 
                           style="background: linear-gradient(135deg, #10b981, #3b82f6); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            Verify Email Address
                        </a>
                    </div>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        This verification link will expire in 24 hours. If you didn't create an account with MetaOpenVerse, 
                        you can safely ignore this email.
                    </p>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        Need help? Contact us at 
                        <a href="mailto:metaopenverse@outlook.com" style="color: #3b82f6;">metaopenverse@outlook.com</a>
                    </p>
                </div>
                <div style="background: #2a2a2a; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                    <p>© 2024 MetaOpenVerse. All rights reserved.</p>
                    <p>This email was sent to ${user.email}</p>
                </div>
            </div>
        `
    },

    transactionNotification: {
        subject: 'Transaction Update - MetaOpenVerse',
        html: (user, transaction) => `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #ffffff; border-radius: 10px; overflow: hidden;">
                <div style="background: linear-gradient(135deg, #8b5cf6, #ec4899); padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Transaction Update</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Your transaction has been processed</p>
                </div>
                <div style="padding: 30px;">
                    <h2 style="color: #8b5cf6; margin-bottom: 20px;">Hello ${user.username || 'there'}! 💰</h2>
                    <p style="line-height: 1.6; margin-bottom: 20px;">
                        We wanted to let you know that your transaction has been ${transaction.status.toLowerCase()}.
                    </p>
                    <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="color: #8b5cf6; margin-top: 0;">Transaction Details</h3>
                        <p><strong>Type:</strong> ${transaction.type}</p>
                        <p><strong>Amount:</strong> ${transaction.amount} ETH</p>
                        <p><strong>Status:</strong> <span style="color: #10b981;">${transaction.status}</span></p>
                        <p><strong>Date:</strong> ${new Date(transaction.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/wallet" 
                           style="background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                            View Wallet
                        </a>
                    </div>
                    <p style="font-size: 14px; color: #888; line-height: 1.6;">
                        Questions about this transaction? Contact us at 
                        <a href="mailto:metaopenverse@outlook.com" style="color: #3b82f6;">metaopenverse@outlook.com</a>
                    </p>
                </div>
                <div style="background: #2a2a2a; padding: 20px; text-align: center; font-size: 12px; color: #888;">
                    <p>© 2024 MetaOpenVerse. All rights reserved.</p>
                    <p>This email was sent to ${user.email}</p>
                </div>
            </div>
        `
    }
};

// Email service functions
const emailService = {
    // Send welcome email
    sendWelcomeEmail: async (user) => {
        try {
            const mailOptions = {
                from: '"MetaOpenVerse Support" <metaopenverse@outlook.com>',
                to: user.email,
                subject: emailTemplates.welcome.subject,
                html: emailTemplates.welcome.html(user)
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('Welcome email sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending welcome email:', error);
            return { success: false, error: error.message };
        }
    },

    // Send password reset email
    sendPasswordResetEmail: async (user, resetToken) => {
        try {
            const mailOptions = {
                from: '"MetaOpenVerse Support" <metaopenverse@outlook.com>',
                to: user.email,
                subject: emailTemplates.passwordReset.subject,
                html: emailTemplates.passwordReset.html(user, resetToken)
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('Password reset email sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending password reset email:', error);
            return { success: false, error: error.message };
        }
    },

    // Send email verification
    sendEmailVerification: async (user, verificationToken) => {
        try {
            const mailOptions = {
                from: '"MetaOpenVerse Support" <metaopenverse@outlook.com>',
                to: user.email,
                subject: emailTemplates.emailVerification.subject,
                html: emailTemplates.emailVerification.html(user, verificationToken)
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('Email verification sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending email verification:', error);
            return { success: false, error: error.message };
        }
    },

    // Send transaction notification
    sendTransactionNotification: async (user, transaction) => {
        try {
            const mailOptions = {
                from: '"MetaOpenVerse Support" <metaopenverse@outlook.com>',
                to: user.email,
                subject: emailTemplates.transactionNotification.subject,
                html: emailTemplates.transactionNotification.html(user, transaction)
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('Transaction notification sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending transaction notification:', error);
            return { success: false, error: error.message };
        }
    },

    // Send custom email
    sendCustomEmail: async (to, subject, html) => {
        try {
            const mailOptions = {
                from: '"MetaOpenVerse Support" <metaopenverse@outlook.com>',
                to: to,
                subject: subject,
                html: html
            };

            const result = await transporter.sendMail(mailOptions);
            console.log('Custom email sent:', result.messageId);
            return { success: true, messageId: result.messageId };
        } catch (error) {
            console.error('Error sending custom email:', error);
            return { success: false, error: error.message };
        }
    }
};

module.exports = emailService;
