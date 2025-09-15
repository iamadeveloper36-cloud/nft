const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user wallet info
router.get('/info', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                ethBalance: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            user,
            systemWalletAddress: process.env.SYSTEM_WALLET_ADDRESS || '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6'
        });
    } catch (error) {
        console.error('Get wallet info error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get wallet transactions
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 20, type = 'all' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        let whereClause = { userId };

        if (type === 'deposits') {
            whereClause = { userId, type: 'deposit' };
        } else if (type === 'withdrawals') {
            whereClause = { userId, type: 'withdrawal' };
        }

        const [deposits, withdrawals, totalDeposits, totalWithdrawals] = await Promise.all([
            prisma.walletDeposit.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Math.floor(take / 2)
            }),
            prisma.walletWithdrawal.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Math.floor(take / 2)
            }),
            prisma.walletDeposit.count({ where: { userId } }),
            prisma.walletWithdrawal.count({ where: { userId } })
        ]);

        // Combine and sort transactions
        const allTransactions = [
            ...deposits.map(tx => ({ ...tx, type: 'deposit' })),
            ...withdrawals.map(tx => ({ ...tx, type: 'withdrawal' }))
        ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            transactions: allTransactions.slice(0, take),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: totalDeposits + totalWithdrawals,
                pages: Math.ceil((totalDeposits + totalWithdrawals) / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get wallet transactions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create deposit request
router.post('/deposit', authenticateToken, async (req, res) => {
    try {
        const { amount, txHash } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }

        // Check if txHash already exists
        if (txHash) {
            const existingDeposit = await prisma.walletDeposit.findUnique({
                where: { txHash }
            });

            if (existingDeposit) {
                return res.status(400).json({ message: 'Transaction hash already exists' });
            }
        }

        const deposit = await prisma.walletDeposit.create({
            data: {
                amount: parseFloat(amount),
                txHash,
                userId
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_DEPOSIT',
                description: `Requested deposit of ${amount} ETH`,
                metadata: JSON.stringify({
                    depositId: deposit.id,
                    amount: amount,
                    txHash: txHash
                }),
                userId
            }
        });

        res.status(201).json({
            message: 'Deposit request created successfully',
            deposit
        });
    } catch (error) {
        console.error('Create deposit error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create withdrawal request
router.post('/withdraw', authenticateToken, async (req, res) => {
    try {
        const { amount, toAddress } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid amount is required' });
        }

        if (!toAddress) {
            return res.status(400).json({ message: 'Withdrawal address is required' });
        }

        // Check user balance
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { ethBalance: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.ethBalance < parseFloat(amount)) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Check for pending withdrawals
        const pendingWithdrawal = await prisma.walletWithdrawal.findFirst({
            where: {
                userId,
                status: 'PENDING'
            }
        });

        if (pendingWithdrawal) {
            return res.status(400).json({ message: 'You have a pending withdrawal request' });
        }

        const withdrawal = await prisma.walletWithdrawal.create({
            data: {
                amount: parseFloat(amount),
                toAddress,
                userId
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_WITHDRAWAL',
                description: `Requested withdrawal of ${amount} ETH to ${toAddress}`,
                metadata: JSON.stringify({
                    withdrawalId: withdrawal.id,
                    amount: amount,
                    toAddress: toAddress
                }),
                userId
            }
        });

        res.status(201).json({
            message: 'Withdrawal request created successfully',
            withdrawal
        });
    } catch (error) {
        console.error('Create withdrawal error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Get all pending transactions
router.get('/admin/pending', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // Check if user is admin
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true }
        });

        if (!user || !user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const [pendingDeposits, pendingWithdrawals] = await Promise.all([
            prisma.walletDeposit.findMany({
                where: { status: 'PENDING' },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.walletWithdrawal.findMany({
                where: { status: 'PENDING' },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })
        ]);

        res.json({
            deposits: pendingDeposits,
            withdrawals: pendingWithdrawals
        });
    } catch (error) {
        console.error('Get pending transactions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Approve deposit
router.put('/admin/deposit/:id/approve', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.user.id;

        // Check if user is admin
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: { isAdmin: true }
        });

        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const deposit = await prisma.walletDeposit.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!deposit) {
            return res.status(404).json({ message: 'Deposit not found' });
        }

        if (deposit.status !== 'PENDING') {
            return res.status(400).json({ message: 'Deposit is not pending' });
        }

        // Update deposit status
        const updatedDeposit = await prisma.walletDeposit.update({
            where: { id },
            data: {
                status: 'APPROVED',
                adminNotes
            }
        });

        // Add balance to user
        await prisma.user.update({
            where: { id: deposit.userId },
            data: {
                ethBalance: {
                    increment: deposit.amount
                }
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_DEPOSIT_APPROVED',
                description: `Deposit of ${deposit.amount} ETH approved`,
                metadata: JSON.stringify({
                    depositId: deposit.id,
                    amount: deposit.amount,
                    adminNotes
                }),
                userId: deposit.userId
            }
        });

        res.json({
            message: 'Deposit approved successfully',
            deposit: updatedDeposit
        });
    } catch (error) {
        console.error('Approve deposit error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Reject deposit
router.put('/admin/deposit/:id/reject', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.user.id;

        // Check if user is admin
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: { isAdmin: true }
        });

        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const deposit = await prisma.walletDeposit.findUnique({
            where: { id }
        });

        if (!deposit) {
            return res.status(404).json({ message: 'Deposit not found' });
        }

        if (deposit.status !== 'PENDING') {
            return res.status(400).json({ message: 'Deposit is not pending' });
        }

        const updatedDeposit = await prisma.walletDeposit.update({
            where: { id },
            data: {
                status: 'REJECTED',
                adminNotes
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_DEPOSIT_REJECTED',
                description: `Deposit of ${deposit.amount} ETH rejected`,
                metadata: JSON.stringify({
                    depositId: deposit.id,
                    amount: deposit.amount,
                    adminNotes
                }),
                userId: deposit.userId
            }
        });

        res.json({
            message: 'Deposit rejected successfully',
            deposit: updatedDeposit
        });
    } catch (error) {
        console.error('Reject deposit error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Approve withdrawal
router.put('/admin/withdrawal/:id/approve', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes, txHash } = req.body;
        const adminId = req.user.id;

        // Check if user is admin
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: { isAdmin: true }
        });

        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const withdrawal = await prisma.walletWithdrawal.findUnique({
            where: { id },
            include: { user: true }
        });

        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'PENDING') {
            return res.status(400).json({ message: 'Withdrawal is not pending' });
        }

        // Check user balance again
        if (withdrawal.user.ethBalance < withdrawal.amount) {
            return res.status(400).json({ message: 'User has insufficient balance' });
        }

        // Update withdrawal status
        const updatedWithdrawal = await prisma.walletWithdrawal.update({
            where: { id },
            data: {
                status: 'APPROVED',
                txHash,
                adminNotes
            }
        });

        // Deduct balance from user
        await prisma.user.update({
            where: { id: withdrawal.userId },
            data: {
                ethBalance: {
                    decrement: withdrawal.amount
                }
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_WITHDRAWAL_APPROVED',
                description: `Withdrawal of ${withdrawal.amount} ETH approved`,
                metadata: JSON.stringify({
                    withdrawalId: withdrawal.id,
                    amount: withdrawal.amount,
                    toAddress: withdrawal.toAddress,
                    txHash,
                    adminNotes
                }),
                userId: withdrawal.userId
            }
        });

        res.json({
            message: 'Withdrawal approved successfully',
            withdrawal: updatedWithdrawal
        });
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Reject withdrawal
router.put('/admin/withdrawal/:id/reject', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.user.id;

        // Check if user is admin
        const admin = await prisma.user.findUnique({
            where: { id: adminId },
            select: { isAdmin: true }
        });

        if (!admin || !admin.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const withdrawal = await prisma.walletWithdrawal.findUnique({
            where: { id }
        });

        if (!withdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'PENDING') {
            return res.status(400).json({ message: 'Withdrawal is not pending' });
        }

        const updatedWithdrawal = await prisma.walletWithdrawal.update({
            where: { id },
            data: {
                status: 'REJECTED',
                adminNotes
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'WALLET_WITHDRAWAL_REJECTED',
                description: `Withdrawal of ${withdrawal.amount} ETH rejected`,
                metadata: JSON.stringify({
                    withdrawalId: withdrawal.id,
                    amount: withdrawal.amount,
                    toAddress: withdrawal.toAddress,
                    adminNotes
                }),
                userId: withdrawal.userId
            }
        });

        res.json({
            message: 'Withdrawal rejected successfully',
            withdrawal: updatedWithdrawal
        });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
