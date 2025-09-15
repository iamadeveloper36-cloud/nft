const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's transactions
router.get('/my-transactions', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, status } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where clause
        const where = { userId: req.user.id };
        if (type) where.type = type;
        if (status) where.status = status;

        const [transactions, total] = await Promise.all([
            prisma.transaction.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    nft: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                            owner: {
                                select: {
                                    id: true,
                                    username: true,
                                    profileImage: true
                                }
                            }
                        }
                    }
                }
            }),
            prisma.transaction.count({ where })
        ]);

        res.json({
            transactions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get transaction by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const transaction = await prisma.transaction.findFirst({
            where: {
                id,
                userId: req.user.id
            },
            include: {
                nft: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        owner: {
                            select: {
                                id: true,
                                username: true,
                                profileImage: true
                            }
                        }
                    }
                }
            }
        });

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json({ transaction });
    } catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Confirm payment (for minting fee or wallet funding)
router.post('/:id/confirm-payment', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { transactionHash } = req.body;

        if (!transactionHash) {
            return res.status(400).json({ message: 'Transaction hash is required' });
        }

        const transaction = await prisma.transaction.findFirst({
            where: {
                id,
                userId: req.user.id,
                status: 'PENDING'
            }
        });

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found or already processed' });
        }

        // Update transaction with hash and set to pending admin approval
        await prisma.transaction.update({
            where: { id },
            data: {
                hash: transactionHash,
                status: 'PENDING' // Will be updated by admin
            }
        });

        res.json({
            message: 'Payment confirmation submitted. Waiting for admin approval.',
            transaction: {
                id: transaction.id,
                type: transaction.type,
                amount: transaction.amount,
                status: 'PENDING',
                hash: transactionHash
            }
        });
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get payment info for minting or wallet funding
router.get('/payment-info/:type', authenticateToken, async (req, res) => {
    try {
        const { type } = req.params;

        if (!['minting', 'wallet-funding'].includes(type)) {
            return res.status(400).json({ message: 'Invalid payment type' });
        }

        const paymentInfo = {
            walletAddress: process.env.PAYMENT_WALLET_ADDRESS,
            amount: type === 'minting' ? process.env.MINTING_FEE_ETH : '0.01', // Default wallet funding amount
            type: type.toUpperCase()
        };

        res.json({ paymentInfo });
    } catch (error) {
        console.error('Get payment info error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Fund wallet
router.post('/fund-wallet', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }

        // Create wallet funding transaction
        const transaction = await prisma.transaction.create({
            data: {
                type: 'WALLET_FUND',
                amount: parseFloat(amount),
                status: 'PENDING',
                description: `Wallet funding: ${amount} ETH`,
                userId: req.user.id
            }
        });

        res.status(201).json({
            message: 'Wallet funding transaction created. Please complete the payment.',
            transaction,
            paymentInfo: {
                walletAddress: process.env.PAYMENT_WALLET_ADDRESS,
                amount: amount,
                status: 'PENDING'
            }
        });
    } catch (error) {
        console.error('Fund wallet error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get transaction statistics
router.get('/stats/summary', authenticateToken, async (req, res) => {
    try {
        const stats = await prisma.transaction.aggregate({
            where: { userId: req.user.id },
            _sum: {
                amount: true
            },
            _count: {
                id: true
            }
        });

        const typeStats = await prisma.transaction.groupBy({
            by: ['type', 'status'],
            where: { userId: req.user.id },
            _count: {
                id: true
            },
            _sum: {
                amount: true
            }
        });

        res.json({
            totalAmount: stats._sum.amount || 0,
            totalTransactions: stats._count.id || 0,
            typeBreakdown: typeStats
        });
    } catch (error) {
        console.error('Get transaction stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get transaction statistics for admin dashboard
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const [totalTransactions, totalVolume, pendingDeposits, completedTransactions] = await Promise.all([
            prisma.transaction.count(),
            prisma.transaction.aggregate({
                _sum: { amount: true },
                where: { status: 'COMPLETED' }
            }),
            prisma.walletDeposit.count({ where: { status: 'PENDING' } }),
            prisma.transaction.count({ where: { status: 'COMPLETED' } })
        ]);

        res.json({
            totalTransactions,
            totalVolume: totalVolume._sum.amount || 0,
            pendingDeposits,
            completedTransactions
        });
    } catch (error) {
        console.error('Get transaction stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
