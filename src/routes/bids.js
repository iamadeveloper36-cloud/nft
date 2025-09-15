const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's bids
router.get('/my-bids', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const userId = req.user.id;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const whereClause = {
            bidderId: userId
        };

        if (status) {
            whereClause.status = status;
        }

        const [bids, total] = await Promise.all([
            prisma.bid.findMany({
                where: whereClause,
                include: {
                    nft: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                            price: true,
                            isListed: true,
                            owner: {
                                select: {
                                    id: true,
                                    username: true,
                                    profileImage: true
                                }
                            },
                            bids: {
                                orderBy: { amount: 'desc' },
                                take: 1
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.bid.count({
                where: whereClause
            })
        ]);

        // Add bid status to each bid
        const bidsWithStatus = bids.map(bid => {
            const highestBid = bid.nft.bids[0];
            let status = 'PENDING';

            if (highestBid && highestBid.id === bid.id) {
                status = 'WINNING';
            } else if (highestBid && highestBid.amount > bid.amount) {
                status = 'OUTBID';
            }

            return {
                ...bid,
                status
            };
        });

        res.json({
            bids: bidsWithStatus,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get my bids error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get bid statistics
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const [
            totalBids,
            winningBids,
            outbidBids,
            totalBidAmount
        ] = await Promise.all([
            prisma.bid.count({
                where: { bidderId: userId }
            }),
            prisma.bid.count({
                where: {
                    bidderId: userId,
                    status: 'WINNING'
                }
            }),
            prisma.bid.count({
                where: {
                    bidderId: userId,
                    status: 'OUTBID'
                }
            }),
            prisma.bid.aggregate({
                where: { bidderId: userId },
                _sum: { amount: true }
            })
        ]);

        res.json({
            totalBids,
            winningBids,
            outbidBids,
            totalBidAmount: totalBidAmount._sum.amount || 0
        });
    } catch (error) {
        console.error('Get bid stats error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get bids for a specific NFT (for auction owners)
router.get('/nft/:nftId', authenticateToken, async (req, res) => {
    try {
        const { nftId } = req.params;
        const userId = req.user.id;

        // First check if the user owns this NFT
        const nft = await prisma.nFT.findUnique({
            where: { id: nftId },
            select: { ownerId: true, name: true, isAuction: true }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (nft.ownerId !== userId) {
            return res.status(403).json({ message: 'You can only view bids for your own NFTs' });
        }

        if (!nft.isAuction) {
            return res.status(400).json({ message: 'This NFT is not an auction' });
        }

        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        const [bids, total] = await Promise.all([
            prisma.bid.findMany({
                where: { nftId },
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
                where: { nftId }
            })
        ]);

        // Add bid status to each bid
        const bidsWithStatus = bids.map((bid, index) => {
            let status = 'PENDING';
            if (index === 0) {
                status = 'HIGHEST';
            } else {
                status = 'OUTBID';
            }

            return {
                ...bid,
                status
            };
        });

        res.json({
            bids: bidsWithStatus,
            nft: {
                id: nftId,
                name: nft.name
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get NFT bids error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Cancel a bid (if allowed)
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const bid = await prisma.bid.findUnique({
            where: { id },
            include: {
                nft: true
            }
        });

        if (!bid) {
            return res.status(404).json({ message: 'Bid not found' });
        }

        if (bid.bidderId !== userId) {
            return res.status(403).json({ message: 'You can only cancel your own bids' });
        }

        // Check if bid can be cancelled (not the highest bid)
        const highestBid = await prisma.bid.findFirst({
            where: { nftId: bid.nftId },
            orderBy: { amount: 'desc' }
        });

        if (highestBid && highestBid.id === bid.id) {
            return res.status(400).json({ message: 'Cannot cancel the highest bid' });
        }

        await prisma.bid.delete({
            where: { id }
        });

        res.json({ message: 'Bid cancelled successfully' });
    } catch (error) {
        console.error('Cancel bid error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
