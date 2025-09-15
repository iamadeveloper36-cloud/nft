const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

const router = express.Router();
const prisma = new PrismaClient();

// Get current user profile
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
                isActive: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        nfts: true,
                        followers: true,
                        following: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get current user profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user profile by username
router.get('/profile/:username', async (req, res) => {
    try {
        const { username } = req.params;

        const user = await prisma.user.findUnique({
            where: { username: username.toLowerCase() },
            select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                bio: true,
                website: true,
                twitter: true,
                instagram: true,
                discord: true,
                isVerified: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true,
                _count: {
                    select: {
                        nfts: true,
                        followers: true,
                        following: true
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Follow/Unfollow user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        if (userId === req.user.id) {
            return res.status(400).json({ message: 'Cannot follow yourself' });
        }

        // Check if user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if already following
        const existingFollow = await prisma.userFollow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: req.user.id,
                    followingId: userId
                }
            }
        });

        if (existingFollow) {
            // Unfollow
            await prisma.userFollow.delete({
                where: {
                    followerId_followingId: {
                        followerId: req.user.id,
                        followingId: userId
                    }
                }
            });
            res.json({ message: 'Unfollowed successfully', following: false });
        } else {
            // Follow
            await prisma.userFollow.create({
                data: {
                    followerId: req.user.id,
                    followingId: userId
                }
            });
            res.json({ message: 'Followed successfully', following: true });
        }
    } catch (error) {
        console.error('Follow/Unfollow error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user's followers
router.get('/:userId/followers', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [followers, total] = await Promise.all([
            prisma.userFollow.findMany({
                where: { followingId: userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    follower: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true,
                            totalSales: true,
                            totalVolume: true
                        }
                    }
                }
            }),
            prisma.userFollow.count({ where: { followingId: userId } })
        ]);

        res.json({
            followers: followers.map(f => f.follower),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get followers error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user's following
router.get('/:userId/following', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [following, total] = await Promise.all([
            prisma.userFollow.findMany({
                where: { followerId: userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    following: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true,
                            totalSales: true,
                            totalVolume: true
                        }
                    }
                }
            }),
            prisma.userFollow.count({ where: { followerId: userId } })
        ]);

        res.json({
            following: following.map(f => f.following),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get following error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user's favorites
router.get('/:userId/favorites', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 12 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [favorites, total] = await Promise.all([
            prisma.userFavorite.findMany({
                where: { userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
                include: {
                    nft: {
                        include: {
                            owner: {
                                select: {
                                    id: true,
                                    username: true,
                                    profileImage: true,
                                    isVerified: true
                                }
                            },
                            _count: {
                                select: { bids: true, favorites: true }
                            }
                        }
                    }
                }
            }),
            prisma.userFavorite.count({ where: { userId } })
        ]);

        res.json({
            favorites: favorites.map(f => f.nft),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get favorites error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Check if user is following another user
router.get('/:userId/follow-status', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        const followStatus = await prisma.userFollow.findUnique({
            where: {
                followerId_followingId: {
                    followerId: req.user.id,
                    followingId: userId
                }
            }
        });

        res.json({ following: !!followStatus });
    } catch (error) {
        console.error('Check follow status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update current user profile
router.put('/me', authenticateToken, async (req, res) => {
    try {
        const { firstName, lastName, bio, website, twitter, instagram, discord } = req.body;

        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                firstName: firstName || null,
                lastName: lastName || null,
                bio: bio || null,
                website: website || null,
                twitter: twitter || null,
                instagram: instagram || null,
                discord: discord || null
            },
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
                isActive: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        nfts: true,
                        followers: true,
                        following: true
                    }
                }
            }
        });

        res.json({
            message: 'Profile updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Upload profile picture
router.post('/me/profile-picture', authenticateToken, upload.single('profileImage'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Profile image is required' });
        }

        // Update user profile with new image
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                profileImage: req.file.path
            },
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
                isActive: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        nfts: true,
                        followers: true,
                        following: true
                    }
                }
            }
        });

        res.json({
            message: 'Profile picture updated successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Remove profile picture
router.delete('/me/profile-picture', authenticateToken, async (req, res) => {
    try {
        // Update user profile to remove image
        const updatedUser = await prisma.user.update({
            where: { id: req.user.id },
            data: {
                profileImage: null
            },
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
                isActive: true,
                walletAddress: true,
                totalVolume: true,
                totalSales: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        nfts: true,
                        followers: true,
                        following: true
                    }
                }
            }
        });

        res.json({
            message: 'Profile picture removed successfully',
            user: updatedUser
        });
    } catch (error) {
        console.error('Remove profile picture error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Search users
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const userId = req.user?.id; // Get current user ID if authenticated

        if (!q || q.trim().length === 0) {
            return res.json({ users: [] });
        }

        const whereClause = {
            OR: [
                {
                    username: {
                        contains: q
                    }
                },
                {
                    firstName: {
                        contains: q
                    }
                },
                {
                    lastName: {
                        contains: q
                    }
                }
            ],
            isActive: true
        };

        // Exclude current user from results if authenticated
        if (userId) {
            whereClause.id = {
                not: userId
            };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                profileImage: true,
                bio: true,
                isVerified: true,
                createdAt: true,
                _count: {
                    select: {
                        nfts: true
                    }
                }
            },
            take: 20,
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ users });
    } catch (error) {
        console.error('User search error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user statistics for admin dashboard
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const [totalUsers, activeUsers, verifiedUsers, newUsersToday, newUsersThisWeek] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { isActive: true } }),
            prisma.user.count({ where: { isVerified: true } }),
            prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            }),
            prisma.user.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    }
                }
            })
        ]);

        res.json({
            totalUsers,
            activeUsers,
            verifiedUsers,
            newUsersToday,
            newUsersThisWeek
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
