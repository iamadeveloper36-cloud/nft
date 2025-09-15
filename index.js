const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

const PORT = process.env.PORT || 5001;

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
}));

// Rate limiting disabled - NFT marketplace requires high-frequency API access
// Users need to make many requests for bidding, browsing, and real-time updates
// Instead, we rely on proper authentication and input validation for security

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
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
app.use('/api/test-email', require('./src/routes/test-email'));

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