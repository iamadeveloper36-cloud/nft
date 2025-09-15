const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { createNFTSchema, bidSchema } = require('../utils/validation');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const { createNFTActivity } = require('../utils/activityHelper');

const router = express.Router();
const prisma = new PrismaClient();

// Upload image endpoint
router.post('/upload/image', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file provided' });
        }

        res.json({
            message: 'Image uploaded successfully',
            url: req.file.path
        });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ message: 'Failed to upload image' });
    }
});

// Get all NFTs with pagination and filters
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 12,
            search = '',
            status = 'APPROVED',
            minPrice = 0,
            maxPrice = 999999,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where clause
        const where = {
            status: status,
            isListed: true
        };

        // Only add price filter if both min and max are valid numbers
        if (!isNaN(parseFloat(minPrice)) && !isNaN(parseFloat(maxPrice))) {
            where.price = {
                gte: parseFloat(minPrice),
                lte: parseFloat(maxPrice)
            };
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }

        // Build orderBy clause
        const orderBy = {};
        orderBy[sortBy] = sortOrder;

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where,
                skip,
                take,
                orderBy,
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true
                        }
                    },
                    bids: {
                        select: {
                            id: true,
                            amount: true,
                            status: true,
                            createdAt: true,
                            bidder: {
                                select: {
                                    id: true,
                                    username: true,
                                    profileImage: true
                                }
                            }
                        },
                        orderBy: { amount: 'desc' },
                        take: 5
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

// Get current user's NFTs (authenticated) - MUST be before /:id route
router.get('/my-nfts', authenticateToken, async (req, res) => {
    try {
        console.log('My NFTs endpoint called by user:', req.user.id);
        const { page = 1, limit = 12, status } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where clause
        const where = { ownerId: req.user.id };
        if (status) {
            where.status = status;
        }

        console.log('Query params:', { page, limit, status, skip, take });
        console.log('Where clause:', where);

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
                            profileImage: true,
                            isVerified: true
                        }
                    },
                    winner: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                            firstName: true,
                            lastName: true,
                            profileImage: true,
                            isVerified: true
                        }
                    },
                    _count: {
                        select: { bids: true, favorites: true }
                    }
                }
            }),
            prisma.nFT.count({ where })
        ]);

        console.log('Found NFTs:', nfts.length, 'Total:', total);

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
        console.error('Get my NFTs error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get current user's won auctions (authenticated)
router.get('/won-auctions', authenticateToken, async (req, res) => {
    try {
        console.log('Won auctions endpoint called by user:', req.user.id);
        const { page = 1, limit = 12 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where: {
                    winnerId: req.user.id,
                    isAuction: true
                },
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
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
            }),
            prisma.nFT.count({
                where: {
                    winnerId: req.user.id,
                    isAuction: true
                }
            })
        ]);

        console.log('Found won auctions:', nfts.length, 'Total:', total);

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
        console.error('Get won auctions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get ended auctions (authenticated)
router.get('/ended-auctions', authenticateToken, async (req, res) => {
    try {
        console.log('Ended auctions endpoint called by user:', req.user.id);
        const { page = 1, limit = 12 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where: {
                    auctionStatus: 'ENDED',
                    isAuction: true
                },
                skip,
                take,
                orderBy: { updatedAt: 'desc' },
                include: {
                    owner: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true
                        }
                    },
                    winner: {
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
            }),
            prisma.nFT.count({
                where: {
                    auctionStatus: 'ENDED',
                    isAuction: true
                }
            })
        ]);

        console.log('Found ended auctions:', nfts.length, 'Total:', total);

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
        console.error('Get ended auctions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Search NFTs
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        const userId = req.user?.id; // Get current user ID if authenticated

        if (!q || q.trim().length === 0) {
            return res.json({ nfts: [] });
        }

        const whereClause = {
            OR: [
                {
                    name: {
                        contains: q
                    }
                },
                {
                    description: {
                        contains: q
                    }
                }
            ]
        };

        // Exclude NFTs owned by current user if authenticated
        if (userId) {
            whereClause.ownerId = {
                not: userId
            };
        }

        const nfts = await prisma.nFT.findMany({
            where: whereClause,
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
                    select: {
                        bids: true,
                        favorites: true
                    }
                }
            },
            take: 20,
            orderBy: {
                createdAt: 'desc'
            }
        });

        res.json({ nfts });
    } catch (error) {
        console.error('NFT search error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get NFT statistics for admin dashboard
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (!req.user.isAdmin) {
            return res.status(403).json({ message: 'Access denied. Admin only.' });
        }

        const [totalNFTs, pendingNFTs, approvedNFTs, activeAuctions, totalBids] = await Promise.all([
            prisma.nFT.count(),
            prisma.nFT.count({ where: { status: 'PENDING' } }),
            prisma.nFT.count({ where: { status: 'APPROVED' } }),
            prisma.nFT.count({
                where: {
                    isAuction: true,
                    auctionStatus: 'LIVE'
                }
            }),
            prisma.bid.count()
        ]);

        res.json({
            totalNFTs,
            pendingNFTs,
            approvedNFTs,
            activeAuctions,
            totalBids
        });
    } catch (error) {
        console.error('Get NFT stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get single NFT
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const nft = await prisma.nFT.findUnique({
            where: { id },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true,
                        isVerified: true,
                        bio: true,
                        totalSales: true,
                        totalVolume: true
                    }
                },
                bids: {
                    include: {
                        bidder: {
                            select: {
                                id: true,
                                username: true,
                                profileImage: true,
                                isVerified: true
                            }
                        }
                    },
                    orderBy: { amount: 'desc' }
                },
                transactions: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                profileImage: true
                            }
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                },
                _count: {
                    select: { bids: true, favorites: true }
                }
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        res.json({ nft });
    } catch (error) {
        console.error('Get NFT error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Create NFT
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        // Validate input
        const { error, value } = createNFTSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'NFT image is required' });
        }

        const { name, description, price, isAuction, auctionStartPrice, auctionReservePrice, auctionEndTime } = value;
        const imageUrl = req.file.path;

        // Determine auction status
        let auctionStatus = 'NOT_AUCTION';
        if (isAuction === 'true' || isAuction === true) {
            // All new auctions start as LIVE for simplicity
            // In a real system, you'd have a separate start time field
            auctionStatus = 'LIVE';
        }

        // Create NFT
        const nft = await prisma.nFT.create({
            data: {
                name,
                description: description || null,
                image: imageUrl,
                price: price ? parseFloat(price) : null,
                ownerId: req.user.id,
                status: 'PENDING',
                isListed: !!(price || isAuction),
                // Auction fields
                isAuction: isAuction === 'true' || isAuction === true,
                auctionStartPrice: auctionStartPrice ? parseFloat(auctionStartPrice) : null,
                auctionReservePrice: auctionReservePrice ? parseFloat(auctionReservePrice) : null,
                auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
                auctionStatus: auctionStatus
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true,
                        isVerified: true
                    }
                }
            }
        });

        // Create transaction record for minting fee
        await prisma.transaction.create({
            data: {
                type: 'MINTING_FEE',
                amount: parseFloat(process.env.MINTING_FEE_ETH || '0.001'),
                status: 'PENDING',
                description: `Minting fee for NFT: ${name}`,
                userId: req.user.id,
                nftId: nft.id
            }
        });

        // Create activity record
        await createNFTActivity.created(req.user.id, nft.id, name);

        res.status(201).json({
            message: 'NFT created successfully. Please complete the minting fee payment.',
            nft,
            paymentInfo: {
                walletAddress: process.env.PAYMENT_WALLET_ADDRESS,
                amount: process.env.MINTING_FEE_ETH || '0.001',
                status: 'PENDING'
            }
        });
    } catch (error) {
        console.error('Create NFT error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Place bid on NFT
router.post('/:id/bid', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { error, value } = bidSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const { amount } = value;

        // Check if NFT exists and is listed
        const nft = await prisma.nFT.findUnique({
            where: { id },
            include: { owner: true }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (!nft.isListed) {
            return res.status(400).json({ message: 'NFT is not listed for sale' });
        }

        if (nft.ownerId === req.user.id) {
            return res.status(400).json({ message: 'Cannot bid on your own NFT' });
        }

        if (nft.status !== 'APPROVED') {
            return res.status(400).json({ message: 'NFT is not approved for bidding' });
        }

        // Check if user has sufficient balance (simplified check)
        // In a real app, you'd check actual wallet balance
        const userBalance = 1.0; // Mock balance
        if (userBalance < amount) {
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Create bid
        const bid = await prisma.bid.create({
            data: {
                amount: parseFloat(amount),
                nftId: id,
                bidderId: req.user.id
            },
            include: {
                bidder: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true,
                        isVerified: true
                    }
                }
            }
        });

        // Create transaction record
        await prisma.transaction.create({
            data: {
                type: 'BID_PLACEMENT',
                amount: parseFloat(amount),
                status: 'PENDING',
                description: `Bid placed on NFT: ${nft.name}`,
                userId: req.user.id,
                nftId: id
            }
        });

        res.status(201).json({
            message: 'Bid placed successfully',
            bid
        });
    } catch (error) {
        console.error('Place bid error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Accept bid
router.post('/:id/accept-bid/:bidId', authenticateToken, async (req, res) => {
    try {
        const { id, bidId } = req.params;

        // Check if NFT exists and belongs to user
        const nft = await prisma.nFT.findUnique({
            where: { id },
            include: { owner: true }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (nft.ownerId !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized to accept bids for this NFT' });
        }

        // Get the bid
        const bid = await prisma.bid.findUnique({
            where: { id: bidId },
            include: { bidder: true }
        });

        if (!bid || bid.nftId !== id) {
            return res.status(404).json({ message: 'Bid not found' });
        }

        if (bid.status !== 'PENDING') {
            return res.status(400).json({ message: 'Bid is no longer pending' });
        }

        // Update bid status
        await prisma.bid.update({
            where: { id: bidId },
            data: { status: 'ACCEPTED' }
        });

        // Reject all other bids for this NFT
        await prisma.bid.updateMany({
            where: {
                nftId: id,
                id: { not: bidId },
                status: 'PENDING'
            },
            data: { status: 'REJECTED' }
        });

        // Update NFT ownership
        await prisma.nFT.update({
            where: { id },
            data: {
                ownerId: bid.bidderId,
                isListed: false,
                price: null
            }
        });

        // Create transaction records
        await prisma.transaction.createMany([
            {
                type: 'BID_ACCEPTANCE',
                amount: bid.amount,
                status: 'COMPLETED',
                description: `Bid accepted for NFT: ${nft.name}`,
                userId: req.user.id,
                nftId: id
            },
            {
                type: 'NFT_PURCHASE',
                amount: bid.amount,
                status: 'COMPLETED',
                description: `Purchased NFT: ${nft.name}`,
                userId: bid.bidderId,
                nftId: id
            }
        ]);

        res.json({ message: 'Bid accepted successfully' });
    } catch (error) {
        console.error('Accept bid error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Add/remove from favorites
router.post('/:id/favorite', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if NFT exists
        const nft = await prisma.nFT.findUnique({ where: { id } });
        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        // Check if already favorited
        const existingFavorite = await prisma.userFavorite.findUnique({
            where: {
                userId_nftId: {
                    userId: req.user.id,
                    nftId: id
                }
            }
        });

        if (existingFavorite) {
            // Remove from favorites
            await prisma.userFavorite.delete({
                where: {
                    userId_nftId: {
                        userId: req.user.id,
                        nftId: id
                    }
                }
            });
            res.json({ message: 'Removed from favorites', favorited: false });
        } else {
            // Add to favorites
            await prisma.userFavorite.create({
                data: {
                    userId: req.user.id,
                    nftId: id
                }
            });
            res.json({ message: 'Added to favorites', favorited: true });
        }
    } catch (error) {
        console.error('Toggle favorite error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get user's NFTs
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 12 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [nfts, total] = await Promise.all([
            prisma.nFT.findMany({
                where: { ownerId: userId },
                skip,
                take,
                orderBy: { createdAt: 'desc' },
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
            }),
            prisma.nFT.count({ where: { ownerId: userId } })
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
        console.error('Get user NFTs error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update NFT (owner only)
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { name, description, price, isListed, image } = req.body;

        // Check if NFT exists and belongs to user
        const nft = await prisma.nFT.findFirst({
            where: {
                id: id, // ID is a string (CUID), not integer
                ownerId: userId
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found or you do not have permission to edit it' });
        }

        // Update the NFT
        const updatedNFT = await prisma.nFT.update({
            where: { id: id },
            data: {
                name: name || nft.name,
                description: description || nft.description,
                price: price !== undefined ? parseFloat(price) : nft.price,
                isListed: isListed !== undefined ? isListed : nft.isListed,
                image: image || nft.image
            },
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
        });

        // Create activity record for update
        await createNFTActivity.updated(userId, id, updatedNFT.name);

        res.json(updatedNFT);
    } catch (error) {
        console.error('Update NFT error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete NFT (owner only)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        console.log('Delete NFT request:', { id, userId });

        // Check if NFT exists and belongs to user
        const nft = await prisma.nFT.findFirst({
            where: {
                id: id, // ID is a string (CUID), not integer
                ownerId: userId
            }
        });

        if (!nft) {
            console.log('NFT not found or no permission');
            return res.status(404).json({ message: 'NFT not found or you do not have permission to delete it' });
        }

        // Create activity record before deletion
        await createNFTActivity.deleted(userId, id, nft.name);

        // Delete the NFT
        await prisma.nFT.delete({
            where: { id: id }
        });

        console.log('NFT deleted successfully');
        res.json({ message: 'NFT deleted successfully' });
    } catch (error) {
        console.error('Delete NFT error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get NFT statistics for dashboard
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [totalNFTs, approvedNFTs, pendingNFTs, listedNFTs, totalFavorites, totalBids] = await Promise.all([
            prisma.nFT.count({ where: { ownerId: userId } }),
            prisma.nFT.count({ where: { ownerId: userId, status: 'APPROVED' } }),
            prisma.nFT.count({ where: { ownerId: userId, status: 'PENDING' } }),
            prisma.nFT.count({ where: { ownerId: userId, isListed: true } }),
            prisma.userFavorite.count({
                where: {
                    nft: { ownerId: userId }
                }
            }),
            prisma.bid.count({
                where: {
                    nft: { ownerId: userId }
                }
            })
        ]);

        res.json({
            totalNFTs,
            approvedNFTs,
            pendingNFTs,
            listedNFTs,
            totalViews: totalFavorites, // Using favorites as views for now
            totalLikes: totalBids // Using bids as likes for now
        });
    } catch (error) {
        console.error('Get NFT stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Toggle NFT listing status
router.patch('/:id/toggle-listing', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if NFT exists and belongs to user
        const nft = await prisma.nFT.findFirst({
            where: {
                id: parseInt(id),
                ownerId: userId
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found or you do not have permission to modify it' });
        }

        // Toggle listing status
        const updatedNFT = await prisma.nFT.update({
            where: { id: parseInt(id) },
            data: { isListed: !nft.isListed },
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
        });

        res.json(updatedNFT);
    } catch (error) {
        console.error('Toggle listing error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});


// Place a bid on NFT
router.post('/:id/bid', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount } = req.body;
        const userId = req.user.id;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid bid amount is required' });
        }

        // Check if NFT exists and is listed
        const nft = await prisma.nFT.findUnique({
            where: { id },
            include: {
                owner: true,
                bids: {
                    orderBy: { amount: 'desc' },
                    take: 1
                }
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (!nft.isListed) {
            return res.status(400).json({ message: 'NFT is not available for bidding' });
        }

        if (nft.ownerId === userId) {
            return res.status(400).json({ message: 'You cannot bid on your own NFT' });
        }

        // Check if bid is higher than current highest bid
        const currentHighestBid = nft.bids[0]?.amount || nft.price || 0;
        if (amount <= currentHighestBid) {
            return res.status(400).json({ message: 'Bid must be higher than current highest bid' });
        }

        // Check user's wallet balance
        const bidder = await prisma.user.findUnique({
            where: { id: userId },
            select: { ethBalance: true }
        });

        if (!bidder) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (bidder.ethBalance < amount) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        // Create the bid
        const bid = await prisma.bid.create({
            data: {
                amount,
                nftId: id,
                bidderId: userId
            },
            include: {
                bidder: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true,
                        isVerified: true
                    }
                }
            }
        });

        // Create activity
        await prisma.activity.create({
            data: {
                type: 'BID_PLACED',
                description: `Placed a bid of ${amount} ETH on ${nft.name}`,
                metadata: {
                    nftId: id,
                    nftName: nft.name,
                    bidAmount: amount
                },
                userId,
                nftId: id
            }
        });

        res.json({
            message: 'Bid placed successfully',
            bid
        });
    } catch (error) {
        console.error('Place bid error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get NFT bids
router.get('/:id/bids', async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 20 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [bids, total] = await Promise.all([
            prisma.bid.findMany({
                where: { nftId: id },
                include: {
                    bidder: {
                        select: {
                            id: true,
                            username: true,
                            profileImage: true,
                            isVerified: true
                        }
                    }
                },
                orderBy: { amount: 'desc' },
                skip,
                take
            }),
            prisma.bid.count({
                where: { nftId: id }
            })
        ]);

        res.json({
            bids,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get bids error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
