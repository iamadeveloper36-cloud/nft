const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 5555;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: "*"
}));

// Rate limiting disabled - NFT marketplace requires high-frequency API access
// Users need to make many requests for bidding, browsing, and real-time updates
// Instead, we rely on proper authentication and input validation for security

// Body parsing middleware
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/nfts', require('./src/routes/nfts'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api/conversion', require('./src/routes/conversion'));
app.use('/api/transactions', require('./src/routes/transactions'));
app.use('/api/activities', require('./src/routes/activities'));
app.use('/api/wallet', require('./src/routes/wallet'));
app.use('/api/auctions', require('./src/routes/auctions'));
app.use('/api/bids', require('./src/routes/bids'));
app.use('/api/auction-management', require('./src/routes/auctionManagement'));
//app.use('/api/test-email', require('./src/routes/test-email'));

// Test endpoint (no database required)
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running on port 5555',
        timestamp: new Date().toISOString()
    });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const userCount = await prisma.user.count();
        const nftCount = await prisma.nFT.count();

        await prisma.$disconnect();

        res.json({
            success: true,
            message: 'Database connection successful',
            userCount,
            nftCount
        });
    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message
        });
    }
});

// List users for debugging
app.get('/api/debug-users', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
                isAdmin: true
            }
        });

        await prisma.$disconnect();

        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('Debug users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// Public payment method endpoint (no auth required)
app.get('/api/payment-method', async (req, res) => {
    try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const paymentMethod = await prisma.paymentMethod.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            select: {
                ethAddress: true,
                qrCodeImage: true
            }
        });

        await prisma.$disconnect();

        res.json({
            success: true,
            paymentMethod
        });
    } catch (error) {
        console.error('Get public payment method error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});