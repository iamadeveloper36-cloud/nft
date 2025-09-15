const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to update auction statuses based on time
const updateAuctionStatuses = async () => {
    try {
        const now = new Date();

        // Update LIVE auctions that should be ENDED
        await prisma.nFT.updateMany({
            where: {
                isAuction: true,
                auctionStatus: 'LIVE',
                auctionEndTime: {
                    lte: now
                }
            },
            data: {
                auctionStatus: 'ENDED'
            }
        });
    } catch (error) {
        console.error('Error updating auction statuses:', error);
    }
};

// Get all auctions with filters
router.get('/', async (req, res) => {
    try {
        // Update auction statuses first
        await updateAuctionStatuses();

        const {
            page = 1,
            limit = 12,
            status = 'LIVE', // LIVE, SCHEDULED, ENDED, CANCELLED
            sortBy = 'auctionEndTime',
            sortOrder = 'asc'
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const where = {
            isAuction: true,
            auctionStatus: status
        };

        const [auctions, total] = await Promise.all([
            prisma.nFT.findMany({
                where,
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
                        orderBy: { amount: 'desc' },
                        take: 1,
                        include: {
                            bidder: {
                                select: {
                                    id: true,
                                    username: true,
                                    profileImage: true
                                }
                            }
                        }
                    },
                    _count: {
                        select: {
                            bids: true,
                            favorites: true
                        }
                    }
                },
                orderBy: {
                    [sortBy]: sortOrder
                },
                skip,
                take
            }),
            prisma.nFT.count({ where })
        ]);

        res.json({
            auctions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get auctions error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get auction details
router.get('/:id', async (req, res) => {
    try {
        // Update auction statuses first
        await updateAuctionStatuses();

        const { id } = req.params;

        const auction = await prisma.nFT.findUnique({
            where: { id },
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
                    orderBy: { amount: 'desc' },
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
                },
                _count: {
                    select: {
                        bids: true,
                        favorites: true
                    }
                }
            }
        });

        if (!auction || !auction.isAuction) {
            return res.status(404).json({ message: 'Auction not found' });
        }

        res.json({ auction });
    } catch (error) {
        console.error('Get auction error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Update auction status (admin only)
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        // Check if user is admin
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true }
        });

        if (!user || !user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const validStatuses = ['SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: 'Invalid auction status' });
        }

        const auction = await prisma.nFT.findUnique({
            where: { id },
            include: { bids: { orderBy: { amount: 'desc' }, take: 1 } }
        });

        if (!auction || !auction.isAuction) {
            return res.status(404).json({ message: 'Auction not found' });
        }

        const updatedAuction = await prisma.nFT.update({
            where: { id },
            data: { auctionStatus: status },
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
                    orderBy: { amount: 'desc' },
                    take: 1,
                    include: {
                        bidder: {
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

        res.json({
            message: 'Auction status updated successfully',
            auction: updatedAuction
        });
    } catch (error) {
        console.error('Update auction status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// End auction and select winner
router.post('/:id/end', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is admin or auction owner
        const auction = await prisma.nFT.findUnique({
            where: { id },
            include: {
                owner: true,
                bids: {
                    orderBy: { amount: 'desc' },
                    take: 1,
                    include: {
                        bidder: true
                    }
                }
            }
        });

        if (!auction || !auction.isAuction) {
            return res.status(404).json({ message: 'Auction not found' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { isAdmin: true }
        });

        if (auction.ownerId !== userId && (!user || !user.isAdmin)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        if (auction.auctionStatus === 'ENDED') {
            return res.status(400).json({ message: 'Auction has already ended' });
        }

        const highestBid = auction.bids[0];
        let winner = null;
        let sold = false;

        // Check if there's a winning bid that meets reserve price
        if (highestBid) {
            const meetsReserve = !auction.auctionReservePrice ||
                highestBid.amount >= auction.auctionReservePrice;

            if (meetsReserve) {
                winner = highestBid.bidder;
                sold = true;

                // Transfer ownership
                await prisma.nFT.update({
                    where: { id },
                    data: {
                        ownerId: winner.id,
                        auctionStatus: 'ENDED',
                        isListed: false
                    }
                });

                // Create transaction record
                await prisma.transaction.create({
                    data: {
                        type: 'NFT_PURCHASE',
                        amount: highestBid.amount,
                        status: 'COMPLETED',
                        description: `Won auction for ${auction.name}`,
                        userId: winner.id,
                        nftId: auction.id
                    }
                });

                // Create activity
                await prisma.activity.create({
                    data: {
                        type: 'NFT_SOLD',
                        description: `Won auction for ${auction.name}`,
                        metadata: JSON.stringify({
                            nftId: auction.id,
                            amount: highestBid.amount,
                            auctionId: auction.id
                        }),
                        userId: winner.id
                    }
                });
            }
        }

        // Update auction status
        const updatedAuction = await prisma.nFT.update({
            where: { id },
            data: { auctionStatus: 'ENDED' },
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
                    orderBy: { amount: 'desc' },
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
                }
            }
        });

        res.json({
            message: sold ? 'Auction ended successfully with winner' : 'Auction ended without sale',
            auction: updatedAuction,
            winner: winner ? {
                id: winner.id,
                username: winner.username,
                profileImage: winner.profileImage
            } : null,
            sold
        });
    } catch (error) {
        console.error('End auction error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get auction statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const [totalAuctions, liveAuctions, endedAuctions, totalVolume] = await Promise.all([
            prisma.nFT.count({
                where: { isAuction: true }
            }),
            prisma.nFT.count({
                where: { isAuction: true, auctionStatus: 'LIVE' }
            }),
            prisma.nFT.count({
                where: { isAuction: true, auctionStatus: 'ENDED' }
            }),
            prisma.bid.aggregate({
                where: {
                    nft: {
                        isAuction: true,
                        auctionStatus: 'ENDED'
                    }
                },
                _sum: {
                    amount: true
                }
            })
        ]);

        res.json({
            totalAuctions,
            liveAuctions,
            endedAuctions,
            totalVolume: totalVolume._sum.amount || 0
        });
    } catch (error) {
        console.error('Get auction stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
