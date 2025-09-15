const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user activities with pagination
router.get('/', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 10, type, search } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {
            userId: userId
        };

        if (type) {
            where.type = type;
        }

        // Add search functionality
        if (search) {
            where.description = {
                contains: search
            };
        }

        const [activities, total] = await Promise.all([
            prisma.activity.findMany({
                where,
                include: {
                    nft: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                            price: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                skip,
                take: parseInt(limit)
            }),
            prisma.activity.count({ where })
        ]);

        const pages = Math.ceil(total / parseInt(limit));

        res.json({
            activities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages
            }
        });
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get recent activities for dashboard
router.get('/recent', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const limit = parseInt(req.query.limit) || 5;

        const activities = await prisma.activity.findMany({
            where: {
                userId: userId
            },
            include: {
                nft: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        price: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: limit
        });

        res.json({ activities });
    } catch (error) {
        console.error('Get recent activities error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create activity (internal use)
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { type, description, nftId, metadata } = req.body;
        const userId = req.user.id;

        const activity = await prisma.activity.create({
            data: {
                type,
                description,
                nftId: nftId || null,
                metadata: metadata || null,
                userId
            },
            include: {
                nft: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        price: true
                    }
                }
            }
        });

        res.status(201).json({ activity });
    } catch (error) {
        console.error('Create activity error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get activity statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [totalActivities, nftCreated, nftSold, nftPurchased] = await Promise.all([
            prisma.activity.count({
                where: { userId }
            }),
            prisma.activity.count({
                where: {
                    userId,
                    type: 'NFT_CREATED'
                }
            }),
            prisma.activity.count({
                where: {
                    userId,
                    type: 'NFT_SOLD'
                }
            }),
            prisma.activity.count({
                where: {
                    userId,
                    type: 'NFT_PURCHASED'
                }
            })
        ]);

        res.json({
            totalActivities,
            nftCreated,
            nftSold,
            nftPurchased
        });
    } catch (error) {
        console.error('Get activity stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get recent activities for admin dashboard
router.get('/recent', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const { limit = 10 } = req.query;

        const activities = await prisma.activity.findMany({
            take: parseInt(limit),
            orderBy: { createdAt: 'desc' },
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true
                    }
                }
            }
        });

        res.json({ activities });
    } catch (error) {
        console.error('Get recent activities error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
