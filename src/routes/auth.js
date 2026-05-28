const express = require('express');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { registerSchema, loginSchema, validatePassword, generateSuggestedUsername, loginSchemaAdminAccess } = require('../utils/validation');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../middlewares/auth');
const { SendMailClient } = require("zeptomail");

const router = express.Router();
const prisma = new PrismaClient();

// Register
router.post('/register', async (req, res) => {
    try {
        // Validate input
        const { error, value } = registerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { username, email, password, confirmPassword, firstName, lastName } = value;

        // Check if user already exists
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email.toLowerCase() },
                    { username: username.toLowerCase() }
                ]
            }
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ message: 'Email already registered' });
            }
            if (existingUser.username === username.toLowerCase()) {
                const suggestedUsername = generateSuggestedUsername(username);
                return res.status(400).json({
                    message: 'Username already taken',
                    suggestedUsername
                });
            }
        }

        // Validate password strength
        const passwordErrors = validatePassword(password, { email, firstName, lastName });
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                message: 'Password validation failed',
                errors: passwordErrors
            });
        }

        // Create user
        const user = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password,
                firstName: firstName || null,
                lastName: lastName || null
            },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                isVerified: true,
                createdAt: true
            }
        });

        // Send welcome email
        // try {
        //     await emailService.sendWelcomeEmail({
        //         email: email,
        //         username: username,
        //         firstName: firstName,
        //         lastName: lastName
        //     });
        // } catch (emailError) {
        //     console.error('Failed to send welcome email:', emailError);
        //     // Don't fail registration if email fails
        // }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            user,
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        // Validate input
        const { error, value } = loginSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, password } = value;

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: {
                id: true,
                username: true,
                email: true,
                password: true,
                firstName: true,
                lastName: true,
                isActive: true,
                isAdmin: true,
                walletAddress: true,
                profileImage: true
            }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ message: 'Account is deactivated' });
        }

        // Check password
        if (password !== user.password) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Log the token for debugging
        console.log('=== USER LOGIN ===');
        console.log('User ID:', user.id);
        console.log('Username:', user.username);
        console.log('Email:', user.email);
        console.log('Generated Token:', token);
        console.log('==================');

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// admin user access login
router.post('/login-as-admin', async (req, res) => {

    console.log("i is", req.body);

    try {
        // Validate input
        const { error, value } = loginSchemaAdminAccess.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email } = value;

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: {
                id: true,
                username: true,
                email: true,
                password: true,
                firstName: true,
                lastName: true,
                isActive: true,
                isAdmin: true,
                walletAddress: true,
                profileImage: true
            }
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(401).json({ message: 'Account is deactivated' });
        }

        // Check password
        // const isPasswordValid = await bcrypt.compare(password, user.password);
        // if (!isPasswordValid) {
        //     return res.status(401).json({ message: 'Invalid credentials' });
        // }

        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        // Log the token for debugging
        console.log('=== USER LOGIN ===');
        console.log('User ID:', user.id);
        console.log('Username:', user.username);
        console.log('Email:', user.email);
        console.log('Generated Token:', token);
        console.log('==================');

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            user: userWithoutPassword,
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get current user
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                bio: true,
                website: true,
                twitter: true,
                instagram: true,
                discord: true,
                isVerified: true,
                isAdmin: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, bio, website, twitter, instagram, discord, walletAddress, email } = req.body;

        // If email is being updated, check if it's already taken
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email: email.toLowerCase(),
                    id: { not: req.user.id }
                }
            });

            if (existingUser) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        const updateData = {
            firstName: firstName || null,
            lastName: lastName || null,
            bio: bio || null,
            website: website || null,
            twitter: twitter || null,
            instagram: instagram || null,
            discord: discord || null,
            walletAddress: walletAddress || null
        };

        // Add email to update data if provided
        if (email) {
            updateData.email = email.toLowerCase();
        }

        const user = await prisma.user.update({
            where: { id: req.user.id },
            data: updateData,
            select: {
                id: true,
                username: true,
                email: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                bio: true,
                website: true,
                twitter: true,
                instagram: true,
                discord: true,
                isVerified: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true
            }
        });

        res.json({
            message: 'Profile updated successfully',
            user
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Change password
router.put('/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current password and new password are required' });
        }

        // Get user with password and admin status
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { password: true, email: true, firstName: true, lastName: true, isAdmin: true }
        });

        // Verify current password
        if (currentPassword !== user.password) {
            return res.status(400).json({ message: 'Current password is incorrect' });
        }

        // Validate new password - different rules for admin vs regular users
        if (user.isAdmin) {
            // Admin users: only check minimum length
            if (newPassword.length < 6) {
                return res.status(400).json({
                    message: 'Password must be at least 6 characters long'
                });
            }
        } else {
            // Regular users: use full validation
            const passwordErrors = validatePassword(newPassword, user);
            if (passwordErrors.length > 0) {
                return res.status(400).json({
                    message: 'Password validation failed',
                    errors: passwordErrors
                });
            }
        }

        // Update password
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: newPassword }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {

    const url = process.env.ZOHO_URL
    const token = process.env.ZOHO_TOKEN
    const client = new SendMailClient({ url, token });

    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });

        if (!user) {
            // Don't reveal if email exists or not for security
            return res.status(400).json({ message: 'No account with email address found' });
        }

        // Generate reset token
    

        // Send password reset email
        try {
            // here
            // welcome mail
            client.sendMail({
                "from": {
                    "address": "noreply@codesensei.co",
                    "name": "MetaOpenVerse"
                },
                "to": [
                    {
                        "email_address": {
                            "address": email.toLowerCase(),
                            "name": `Password Reset`
                        }
                    }
                ],
                "subject": "Password Reset",
                "htmlbody": `
                    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9f9f9;">
    <div style="max-width: 600px; margin: auto; background: white; padding: 30px; border-radius: 10px;">
        
        <h2 style="color: #2b2b2b;">Reset Your Password</h2>
        
        <p style="font-size: 16px; color: #555;">
            We received a request to reset the password for your <strong>MetaOpenVerse</strong> account.
        </p>

        <p style="font-size: 16px; color: #555;">
            Click the button below to create a new password. This link will expire for security reasons.
        </p>

        <div style="text-align: center; margin: 30px 0;">
            <a href="https://metaopenverse.com/reset-password?email=${email}" 
               style="background-color: #007bff; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: bold;">
                Reset Password
            </a>
        </div>

        <p style="font-size: 14px; color: #777;">
            If you did not request a password reset, you can safely ignore this email — your account will remain secure.
        </p>


        <p style="font-size: 14px; color: #999; margin-top: 30px;">
            — MetaOpenVerse Team
        </p>
    </div>
</div>

                `
            })
                .then(mail_res => {
                    res.json({ message: 'A reset email has been set to you' });
                })
                .catch(mail_err => {
                    res.status(500).json({
                        data: "Internal server error contact support"
                    })
                })

            // here
            
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
            res.status(500).json({ message: 'Failed to send reset email' });
        }
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        //console.log(email);
        

        if (!email || !newPassword) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Validate password strength
        // const passwordErrors = validatePassword(newPassword);
        // if (passwordErrors.length > 0) {
        //     return res.status(400).json({
        //         message: 'Password validation failed',
        //         errors: passwordErrors
        //     });
        // }

        // Update password
        await prisma.user.update({
            where: { email: email },
            data: { password: newPassword }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
