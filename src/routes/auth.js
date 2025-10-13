const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { registerSchema, loginSchema, validatePassword, generateSuggestedUsername, loginSchemaAdminAccess } = require('../utils/validation');
const emailService = require('../services/emailService');
const { authenticateToken } = require('../middlewares/auth');

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

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = await prisma.user.create({
            data: {
                username: username.toLowerCase(),
                email: email.toLowerCase(),
                password: hashedPassword,
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
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
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
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
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

        // Hash new password
        const saltRounds = 12;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await prisma.user.update({
            where: { id: req.user.id },
            data: { password: hashedNewPassword }
        });

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
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
            return res.json({ message: 'If the email exists, a password reset link has been sent' });
        }

        // Generate reset token
        const resetToken = jwt.sign(
            { userId: user.id, type: 'password_reset' },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        // Send password reset email
        try {
            await emailService.sendPasswordResetEmail(user, resetToken);
            res.json({ message: 'If the email exists, a password reset link has been sent' });
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
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ message: 'Token and new password are required' });
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        if (decoded.type !== 'password_reset') {
            return res.status(400).json({ message: 'Invalid token type' });
        }

        // Validate password strength
        const passwordErrors = validatePassword(newPassword);
        if (passwordErrors.length > 0) {
            return res.status(400).json({
                message: 'Password validation failed',
                errors: passwordErrors
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password
        await prisma.user.update({
            where: { id: decoded.userId },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
