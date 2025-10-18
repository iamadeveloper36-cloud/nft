const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken, requireAdmin } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const axios = require('axios');
const emailService = require('../services/emailService');

const router = express.Router();
const prisma = new PrismaClient();

// Apply admin middleware to all routes
router.use(authenticateToken, requireAdmin);

// Get dashboard stats
router.get('/dashboard', async (req, res) => {
    try {
        const [
            totalUsers,
            totalNFTs,
            totalTransactions,
            totalVolume,
            pendingNFTs,
            pendingTransactions,
            recentUsers,
            recentNFTs
        ] = await Promise.all([
            prisma.user.count(),
            prisma.nFT.count(),
            prisma.transaction.count(),
            prisma.transaction.aggregate({
                _sum: { amount: true }
            }),
            prisma.nFT.count({ where: { status: 'PENDING' } }),
            prisma.transaction.count({ where: { status: 'PENDING' } }),
            prisma.user.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    createdAt: true,
                    isActive: true
                }
            }),
            prisma.nFT.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true
                        }
                    }
                }
            })
        ]);

        res.json({
            stats: {
                totalUsers,
                totalNFTs,
                totalTransactions,
                totalVolume: totalVolume._sum.amount || 0,
                pendingNFTs,
                pendingTransactions
            },
            recentUsers,
            recentNFTs
        });
    } catch (error) {
        console.error('Get admin dashboard error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all users
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', status = 'all' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (search) {
            where.OR = [
                { username: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (status !== 'all') {
            where.isActive = status === 'active';
        }

        // Fetch ETH to USD conversion rate
        let ethToUsdRate = 3000; // Fallback rate
        try {
            const conversionResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
            if (conversionResponse.data && conversionResponse.data.ethereum && conversionResponse.data.ethereum.usd) {
                ethToUsdRate = conversionResponse.data.ethereum.usd;
            }
        } catch (conversionError) {
            console.warn('Failed to fetch ETH conversion rate, using fallback:', conversionError.message);
        }

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    isActive: true,
                    isAdmin: true,
                    isVerified: true,
                    totalVolume: true,
                    totalSales: true,
                    ethBalance: true,
                    usdtBalance: true,
                    createdAt: true,
                    _count: {
                        select: {
                            nfts: true,
                            transactions: true
                        }
                    }
                }
            }),
            prisma.user.count({ where })
        ]);

        // Add USD balance calculation to each user
        const usersWithUsdBalance = users.map(user => ({
            ...user,
            usdBalance: user.ethBalance ? (user.ethBalance * ethToUsdRate) : 0,
            ethToUsdRate
        }));

        res.json({
            users: usersWithUsdBalance,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            },
            ethToUsdRate
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update user status
router.put('/users/:userId/status', async (req, res) => {
    try {
        const { userId } = req.params;
        const { isActive, isVerified, isAdmin } = req.body;

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                isActive: isActive !== undefined ? isActive : undefined,
                isVerified: isVerified !== undefined ? isVerified : undefined,
                isAdmin: isAdmin !== undefined ? isAdmin : undefined
            },
            select: {
                id: true,
                username: true,
                email: true,
                isActive: true,
                isVerified: true,
                isAdmin: true
            }
        });

        res.json({
            message: 'User status updated successfully',
            user
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update user wallet balance
router.put('/users/:userId/wallet', async (req, res) => {
    try {
        const { userId } = req.params;
        const { ethBalance, usdtBalance } = req.body;

        if (ethBalance === undefined || ethBalance < 0 || usdtBalance === undefined || usdtBalance < 0) {
            return res.status(400).json({ message: 'Valid ETH/USDT balance is required' });
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { ethBalance: parseFloat(ethBalance), usdtBalance: parseFloat(usdtBalance) },
            select: {
                id: true,
                username: true,
                email: true,
                ethBalance: true,
                usdtBalance: true
            }
        });

        res.json({
            message: 'User wallet balance updated successfully',
            user
        });
    } catch (error) {
        console.error('Update user wallet error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user exists
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, isAdmin: true }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Prevent deleting admin users
        if (user.isAdmin) {
            return res.status(400).json({ message: 'Cannot delete admin users' });
        }

        // Delete user (this will cascade delete related records due to Prisma relations)
        await prisma.user.delete({
            where: { id: userId }
        });

        res.json({
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all NFTs
router.get('/nfts', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status !== 'all') {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            profileImage: true
                        }
                    },
                    _count: {
                        select: { bids: true, favorites: true }
                    }
                }
            }),
            prisma.nFT.count({ where })
        ]);

        res.json({
            nfts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get NFTs error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update NFT status
router.put('/nfts/:nftId/status', async (req, res) => {
    try {
        const { nftId } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const nft = await prisma.nFT.update({
            where: { id: nftId },
            data: { status },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        // If NFT is approved, update the minting fee transaction status
        if (status === 'APPROVED') {
            await prisma.transaction.updateMany({
                where: {
                    nftId: nftId,
                    type: 'MINTING_FEE',
                    status: 'PENDING'
                },
                data: { status: 'COMPLETED' }
            });
        }

        res.json({
            message: 'NFT status updated successfully',
            nft
        });
    } catch (error) {
        console.error('Update NFT status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all deposits
router.get('/deposits', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status !== 'all' && status !== '') {
            where.status = status;
        }
        if (search && search.trim() !== '') {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [deposits, total] = await Promise.all([
            prisma.walletDeposit.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            profileImage: true,
                            ethBalance: true
                        }
                    }
                }
            }),
            prisma.walletDeposit.count({ where })
        ]);

        res.json({
            deposits,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get deposits error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all withdrawals
router.get('/withdrawals', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status !== 'all' && status !== '') {
            where.status = status;
        }
        if (search && search.trim() !== '') {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [withdrawals, total] = await Promise.all([
            prisma.walletWithdrawal.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            profileImage: true,
                            ethBalance: true
                        }
                    }
                }
            }),
            prisma.walletWithdrawal.count({ where })
        ]);

        res.json({
            withdrawals,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all transactions (from wallet_deposit and wallet_withdrawal tables)
router.get('/transactions', async (req, res) => {
    try {
        const { page = 1, limit = 20, type = 'all', status = 'all', search = '' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where conditions for deposits
        const depositWhere = {};
        if (status !== 'all') {
            depositWhere.status = status;
        }
        if (search && search.trim() !== '') {
            depositWhere.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        // Build where conditions for withdrawals
        const withdrawalWhere = {};
        if (status !== 'all') {
            withdrawalWhere.status = status;
        }
        if (search && search.trim() !== '') {
            withdrawalWhere.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { user: { username: { contains: search, mode: 'insensitive' } } },
                { user: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        let deposits = [];
        let withdrawals = [];
        let totalDeposits = 0;
        let totalWithdrawals = 0;

        // Fetch deposits if type is 'all' or 'deposit'
        if (type === 'all' || type === 'DEPOSIT') {
            console.log('Fetching deposits with where:', depositWhere);
            [deposits, totalDeposits] = await Promise.all([
                prisma.walletDeposit.findMany({
                    where: depositWhere,
                    skip: type === 'DEPOSIT' ? skip : 0,
                    take: type === 'DEPOSIT' ? take : undefined,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                                profileImage: true,
                                ethBalance: true
                            }
                        }
                    }
                }),
                prisma.walletDeposit.count({ where: depositWhere })
            ]);
            console.log('Found deposits:', deposits.length);
        }

        // Fetch withdrawals if type is 'all' or 'withdrawal'
        if (type === 'all' || type === 'WITHDRAWAL') {
            console.log('Fetching withdrawals with where:', withdrawalWhere);
            [withdrawals, totalWithdrawals] = await Promise.all([
                prisma.walletWithdrawal.findMany({
                    where: withdrawalWhere,
                    skip: type === 'WITHDRAWAL' ? skip : 0,
                    take: type === 'WITHDRAWAL' ? take : undefined,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                                profileImage: true,
                                ethBalance: true
                            }
                        }
                    }
                }),
                prisma.walletWithdrawal.count({ where: withdrawalWhere })
            ]);
            console.log('Found withdrawals:', withdrawals.length);
        }

        // Transform data to unified format
        const allTransactions = [
            ...deposits.map(deposit => ({
                id: deposit.id,
                type: 'DEPOSIT',
                amount: deposit.amount,
                status: deposit.status,
                createdAt: deposit.createdAt,
                updatedAt: deposit.updatedAt,
                user: deposit.user,
                transactionHash: deposit.txHash,
                description: 'Wallet deposit'
            })),
            ...withdrawals.map(withdrawal => ({
                id: withdrawal.id,
                type: 'WITHDRAWAL',
                amount: withdrawal.amount,
                status: withdrawal.status,
                createdAt: withdrawal.createdAt,
                updatedAt: withdrawal.updatedAt,
                user: withdrawal.user,
                transactionHash: withdrawal.txHash,
                description: 'Wallet withdrawal'
            }))
        ];

        // Sort by creation date
        allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Apply pagination if type is 'all'
        const total = totalDeposits + totalWithdrawals;
        const paginatedTransactions = type === 'all'
            ? allTransactions.slice(skip, skip + take)
            : allTransactions;

        console.log('API Debug - Total deposits:', totalDeposits);
        console.log('API Debug - Total withdrawals:', totalWithdrawals);
        console.log('API Debug - All transactions count:', allTransactions.length);
        console.log('API Debug - Paginated transactions count:', paginatedTransactions.length);

        res.json({
            transactions: paginatedTransactions,
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

// Update deposit status
router.put('/deposits/:depositId/status', async (req, res) => {
    try {
        const { depositId } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        // Get the deposit first to check its details
        const existingDeposit = await prisma.walletDeposit.findUnique({
            where: { id: depositId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        ethBalance: true
                    }
                }
            }
        });

        if (!existingDeposit) {
            return res.status(404).json({ message: 'Deposit not found' });
        }

        // Update deposit status
        const updatedDeposit = await prisma.walletDeposit.update({
            where: { id: depositId },
            data: { status },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        // Update user wallet balance if deposit is completed
        if (status === 'COMPLETED') {
            const newBalance = existingDeposit.user.ethBalance + existingDeposit.amount;
            await prisma.user.update({
                where: { id: existingDeposit.user.id },
                data: { ethBalance: newBalance }
            });
        }

        res.json({
            message: 'Deposit status updated successfully',
            deposit: updatedDeposit
        });
    } catch (error) {
        console.error('Update deposit status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update withdrawal status
router.put('/withdrawals/:withdrawalId/status', async (req, res) => {
    try {
        const { withdrawalId } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        // Get the withdrawal first to check its details
        const existingWithdrawal = await prisma.walletWithdrawal.findUnique({
            where: { id: withdrawalId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        ethBalance: true
                    }
                }
            }
        });

        if (!existingWithdrawal) {
            return res.status(404).json({ message: 'Withdrawal not found' });
        }

        // Update withdrawal status
        const updatedWithdrawal = await prisma.walletWithdrawal.update({
            where: { id: withdrawalId },
            data: { status },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        // Update user wallet balance if withdrawal is completed
        if (status === 'COMPLETED') {
            const newBalance = existingWithdrawal.user.ethBalance - existingWithdrawal.amount;
            await prisma.user.update({
                where: { id: existingWithdrawal.user.id },
                data: { ethBalance: newBalance }
            });
        }

        res.json({
            message: 'Withdrawal status updated successfully',
            withdrawal: updatedWithdrawal
        });
    } catch (error) {
        console.error('Update withdrawal status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update transaction status (for wallet deposits and withdrawals)
router.put('/transactions/:transactionId/status', async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        // Try to find the transaction in wallet deposits first
        let existingTransaction = await prisma.walletDeposit.findUnique({
            where: { id: transactionId },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        ethBalance: true
                    }
                }
            }
        });

        let transactionType = 'DEPOSIT';
        let updatedTransaction;

        if (existingTransaction) {
            // Update deposit status
            updatedTransaction = await prisma.walletDeposit.update({
                where: { id: transactionId },
                data: { status },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                }
            });
        } else {
            // Try to find in wallet withdrawals
            existingTransaction = await prisma.walletWithdrawal.findUnique({
                where: { id: transactionId },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            ethBalance: true
                        }
                    }
                }
            });

            if (existingTransaction) {
                transactionType = 'WITHDRAWAL';
                // Update withdrawal status
                updatedTransaction = await prisma.walletWithdrawal.update({
                    where: { id: transactionId },
                    data: { status },
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true
                            }
                        }
                    }
                });
            } else {
                return res.status(404).json({ message: 'Transaction not found' });
            }
        }

        // Update user wallet balance if transaction is completed and it's a deposit
        if (status === 'COMPLETED' && transactionType === 'DEPOSIT') {
            const newBalance = existingTransaction.user.ethBalance + existingTransaction.amount;
            await prisma.user.update({
                where: { id: existingTransaction.user.id },
                data: { ethBalance: newBalance }
            });
        }

        // Transform response to match frontend expectations
        const responseTransaction = {
            id: updatedTransaction.id,
            type: transactionType,
            amount: updatedTransaction.amount,
            status: updatedTransaction.status,
            createdAt: updatedTransaction.createdAt,
            updatedAt: updatedTransaction.updatedAt,
            user: updatedTransaction.user,
            transactionHash: updatedTransaction.txHash,
            description: transactionType === 'DEPOSIT' ? 'Wallet deposit' : 'Wallet withdrawal'
        };

        // Send email notification to user
        try {
            await emailService.sendTransactionNotification(updatedTransaction.user, responseTransaction);
        } catch (emailError) {
            console.error('Failed to send transaction notification email:', emailError);
            // Don't fail the transaction update if email fails
        }

        res.json({
            message: 'Transaction status updated successfully',
            transaction: responseTransaction
        });
    } catch (error) {
        console.error('Update transaction status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all messages
router.get('/messages', async (req, res) => {
    try {
        const { page = 1, limit = 20, unreadOnly = false } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (unreadOnly === 'true') {
            where.isRead = false;
        }

        const [messages, total] = await Promise.all([
            prisma.message.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    sender: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true
                        }
                    },
                    receiver: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true
                        }
                    }
                }
            }),
            prisma.message.count({ where })
        ]);

        res.json({
            messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Mark message as read
router.put('/messages/:messageId/read', async (req, res) => {
    try {
        const { messageId } = req.params;

        await prisma.message.update({
            where: { id: messageId },
            data: { isRead: true }
        });

        res.json({ message: 'Message marked as read' });
    } catch (error) {
        console.error('Mark message as read error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get analytics
router.get('/analytics', async (req, res) => {
    try {
        const { period = '30d' } = req.query;

        let startDate = new Date();
        switch (period) {
            case '7d':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(startDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(startDate.getDate() - 90);
                break;
            default:
                startDate.setDate(startDate.getDate() - 30);
        }

        const [
            userStats,
            nftStats,
            transactionStats,
            volumeByDay
        ] = await Promise.all([
            prisma.user.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startDate }
                },
                _count: { id: true }
            }),
            prisma.nFT.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startDate }
                },
                _count: { id: true }
            }),
            prisma.transaction.groupBy({
                by: ['type', 'status'],
                where: {
                    createdAt: { gte: startDate }
                },
                _count: { id: true },
                _sum: { amount: true }
            }),
            prisma.transaction.groupBy({
                by: ['createdAt'],
                where: {
                    createdAt: { gte: startDate },
                    status: 'COMPLETED'
                },
                _sum: { amount: true }
            })
        ]);

        res.json({
            userStats,
            nftStats,
            transactionStats,
            volumeByDay,
            period
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get all NFTs
router.get('/nfts', async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {};
        if (status !== 'all' && status !== '') {
            where.status = status;
        }
        if (search && search.trim() !== '') {
            where.OR = [
                { id: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { owner: { username: { contains: search, mode: 'insensitive' } } },
                { owner: { email: { contains: search, mode: 'insensitive' } } }
            ];
        }

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            profileImage: true
                        }
                    }
                }
            }),
            prisma.nFT.count({ where })
        ]);

        res.json({
            nfts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get NFTs error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update NFT status
router.put('/nfts/:nftId/status', async (req, res) => {
    try {
        const { nftId } = req.params;
        const { status } = req.body;

        if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const existingNft = await prisma.nFT.findUnique({
            where: { id: nftId },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        if (!existingNft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        const updatedNft = await prisma.nFT.update({
            where: { id: nftId },
            data: { status },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        // If NFT is approved, also update the associated minting fee transaction
        if (status === 'APPROVED') {
            await prisma.transaction.updateMany({
                where: {
                    nftId: nftId,
                    type: 'MINTING_FEE',
                    status: 'PENDING'
                },
                data: { status: 'COMPLETED' }
            });
        } else if (status === 'REJECTED') {
            await prisma.transaction.updateMany({
                where: {
                    nftId: nftId,
                    type: 'MINTING_FEE',
                    status: 'PENDING'
                },
                data: { status: 'FAILED' }
            });
        }

        res.json({
            success: true,
            message: 'NFT status updated successfully',
            nft: updatedNft
        });
    } catch (error) {
        console.error('Update NFT status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete NFT
router.delete('/nfts/:nftId', async (req, res) => {
    try {
        const { nftId } = req.params;

        const existingNft = await prisma.nFT.findUnique({
            where: { id: nftId },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        if (!existingNft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        // Delete the NFT (this will cascade delete related records due to onDelete: Cascade)
        await prisma.nFT.delete({
            where: { id: nftId }
        });

        res.json({
            success: true,
            message: 'NFT deleted successfully'
        });
    } catch (error) {
        console.error('Delete NFT error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get payment method
router.get('/payment-method', async (req, res) => {
    try {
        const paymentMethod = await prisma.paymentMethod.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json({
            paymentMethod
        });
    } catch (error) {
        console.error('Get payment method error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create default payment method
router.post('/payment-method', async (req, res) => {
    try {
        const { ethAddress, qrCodeImage } = req.body;

        // Check if a payment method already exists
        const existingPaymentMethod = await prisma.paymentMethod.findFirst();
        if (existingPaymentMethod) {
            return res.status(400).json({ message: 'Payment method already exists' });
        }

        const paymentMethod = await prisma.paymentMethod.create({
            data: {
                ethAddress,
                qrCodeImage
            }
        });

        res.json({
            success: true,
            message: 'Payment method created successfully',
            paymentMethod
        });
    } catch (error) {
        console.error('Create payment method error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update payment method
router.put('/payment-method', upload.single('qrCode'), async (req, res) => {
    try {
        const { ethAddress } = req.body;
        let qrCodeImage = null;

        // Handle file upload if present
        if (req.file) {
            qrCodeImage = req.file.path; // Cloudinary returns the URL in 'path' field
        }

        // Get existing payment method
        const existingPaymentMethod = await prisma.paymentMethod.findFirst();
        if (!existingPaymentMethod) {
            return res.status(404).json({ message: 'Payment method not found' });
        }

        // Update data
        const updateData = { ethAddress };
        if (qrCodeImage) {
            updateData.qrCodeImage = qrCodeImage;
        }

        const updatedPaymentMethod = await prisma.paymentMethod.update({
            where: { id: existingPaymentMethod.id },
            data: updateData
        });

        res.json({
            success: true,
            message: 'Payment method updated successfully',
            paymentMethod: updatedPaymentMethod
        });
    } catch (error) {
        console.error('Update payment method error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
