const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { authenticateToken } = require('../middlewares/auth');
const emailService = require('../services/emailService');

const router = express.Router();
const prisma = new PrismaClient();

// Select winner for auction (auction owner only)
router.post('/:nftId/select-winner', authenticateToken, async (req, res) => {
    try {
        const { nftId } = req.params;
        const { bidderId } = req.body;
        const userId = req.user.id;

        // Check if NFT exists and user owns it
        const nft = await prisma.nFT.findUnique({
            where: { id: nftId },
            include: {
                owner: true,
                bids: {
                    where: { bidderId },
                    include: {
                        bidder: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (nft.ownerId !== userId) {
            return res.status(403).json({ message: 'Only the auction owner can select a winner' });
        }

        if (!nft.isAuction) {
            return res.status(400).json({ message: 'This NFT is not an auction' });
        }

        if (nft.isWinnerSelected) {
            return res.status(400).json({ message: 'Winner has already been selected for this auction' });
        }

        // Check if the bidder has actually bid on this NFT
        const bid = nft.bids[0];
        if (!bid) {
            return res.status(400).json({ message: 'Selected user has not bid on this auction' });
        }

        // Update NFT with winner
        const updatedNft = await prisma.nFT.update({
            where: { id: nftId },
            data: {
                winnerId: bidderId,
                isWinnerSelected: true,
                auctionStatus: 'ENDED',
                isListed: false
            },
            include: {
                winner: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        // Update the winning bid status
        await prisma.bid.update({
            where: { id: bid.id },
            data: { status: 'WON' }
        });

        // Update all other bids to REJECTED
        await prisma.bid.updateMany({
            where: {
                nftId: nftId,
                id: { not: bid.id }
            },
            data: { status: 'REJECTED' }
        });

        // Create transaction record for the sale
        await prisma.transaction.create({
            data: {
                type: 'NFT_PURCHASE',
                amount: bid.amount,
                status: 'PENDING',
                description: `Auction won: ${nft.name}`,
                userId: bidderId,
                nftId: nftId
            }
        });

        // Send email notification to winner
        try {
            await emailService.sendCustomEmail({
                to: bid.bidder.email,
                subject: '🎉 Congratulations! You Won the Auction',
                html: `
                    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                        <h2 style="color: #4F46E5;">Congratulations ${bid.bidder.firstName || bid.bidder.username}!</h2>
                        <p>You have won the auction for <strong>${nft.name}</strong> with a bid of <strong>${bid.amount} ETH</strong>.</p>
                        <p>The auction owner will contact you shortly to complete the transaction.</p>
                        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <h3>NFT Details:</h3>
                            <p><strong>Name:</strong> ${nft.name}</p>
                            <p><strong>Winning Bid:</strong> ${bid.amount} ETH</p>
                            <p><strong>Auction Owner:</strong> ${nft.owner.username}</p>
                        </div>
                        <p>Thank you for participating in MetaOpenVerse!</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Failed to send winner notification email:', emailError);
        }

        res.json({
            message: 'Winner selected successfully',
            auction: updatedNft,
            winner: bid.bidder
        });

    } catch (error) {
        console.error('Select winner error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get bidders for auction (auction owner only)
router.get('/:nftId/bidders', authenticateToken, async (req, res) => {
    try {
        const { nftId } = req.params;
        const userId = req.user.id;

        // Check if NFT exists and user owns it
        const nft = await prisma.nFT.findUnique({
            where: { id: nftId },
            select: {
                id: true,
                ownerId: true,
                isAuction: true,
                isWinnerSelected: true,
                name: true
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (nft.ownerId !== userId) {
            return res.status(403).json({ message: 'Only the auction owner can view bidders' });
        }

        if (!nft.isAuction) {
            return res.status(400).json({ message: 'This NFT is not an auction' });
        }

        // Get all bidders with their highest bid
        const bidders = await prisma.bid.findMany({
            where: { nftId },
            include: {
                bidder: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        firstName: true,
                        lastName: true,
                        profileImage: true,
                        isVerified: true
                    }
                }
            },
            orderBy: { amount: 'desc' }
        });

        // Group by bidder and get their highest bid
        const bidderMap = new Map();
        bidders.forEach(bid => {
            const bidderId = bid.bidderId;
            if (!bidderMap.has(bidderId) || bid.amount > bidderMap.get(bidderId).amount) {
                bidderMap.set(bidderId, {
                    ...bid.bidder,
                    highestBid: bid.amount,
                    bidId: bid.id,
                    bidStatus: bid.status,
                    bidDate: bid.createdAt
                });
            }
        });

        const uniqueBidders = Array.from(bidderMap.values());

        res.json({
            bidders: uniqueBidders,
            auction: {
                name: nft.name,
                isWinnerSelected: nft.isWinnerSelected
            }
        });

    } catch (error) {
        console.error('Get bidders error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Send message to bidder (auction owner to bidder)
router.post('/:nftId/message-bidder', authenticateToken, async (req, res) => {
    try {
        const { nftId } = req.params;
        const { bidderId, message } = req.body;
        const userId = req.user.id;

        // Check if NFT exists and user owns it
        const nft = await prisma.nFT.findUnique({
            where: { id: nftId },
            select: { ownerId: true, isAuction: true, name: true }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        if (nft.ownerId !== userId) {
            return res.status(403).json({ message: 'Only the auction owner can send messages' });
        }

        if (!nft.isAuction) {
            return res.status(400).json({ message: 'This NFT is not an auction' });
        }

        // Get bidder info
        const bidder = await prisma.user.findUnique({
            where: { id: bidderId },
            select: { id: true, username: true, email: true, firstName: true, lastName: true }
        });

        if (!bidder) {
            return res.status(404).json({ message: 'Bidder not found' });
        }

        // Create message
        const newMessage = await prisma.message.create({
            data: {
                content: message,
                senderId: userId,
                receiverId: bidderId,
                metadata: {
                    nftId: nftId,
                    nftName: nft.name,
                    messageType: 'auction_communication'
                }
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true
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
        });

        // Send email notification to bidder
        try {
            await emailService.sendCustomEmail({
                to: bidder.email,
                subject: `Message from Auction Owner - ${nft.name}`,
                html: `
                    <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                        <h2 style="color: #4F46E5;">Message from Auction Owner</h2>
                        <p>You have received a message regarding the auction for <strong>${nft.name}</strong>.</p>
                        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                            <p><strong>Message:</strong></p>
                            <p style="font-style: italic;">"${message}"</p>
                        </div>
                        <p>Please log in to MetaOpenVerse to respond to this message.</p>
                    </div>
                `
            });
        } catch (emailError) {
            console.error('Failed to send message notification email:', emailError);
        }

        res.json({
            message: 'Message sent successfully',
            messageData: newMessage
        });

    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get auction messages (for both auction owner and bidders)
router.get('/:nftId/messages', authenticateToken, async (req, res) => {
    try {
        const { nftId } = req.params;
        const userId = req.user.id;

        // Check if user is either auction owner or has bid on this NFT
        const nft = await prisma.nFT.findUnique({
            where: { id: nftId },
            include: {
                owner: true,
                bids: {
                    where: { bidderId: userId }
                }
            }
        });

        if (!nft) {
            return res.status(404).json({ message: 'NFT not found' });
        }

        const isOwner = nft.ownerId === userId;
        const hasBid = nft.bids.length > 0;

        if (!isOwner && !hasBid) {
            return res.status(403).json({ message: 'You can only view messages for auctions you own or have bid on' });
        }

        // Get messages related to this auction
        const messages = await prisma.message.findMany({
            where: {
                OR: [
                    {
                        senderId: userId,
                        metadata: {
                            path: ['nftId'],
                            equals: nftId
                        }
                    },
                    {
                        receiverId: userId,
                        metadata: {
                            path: ['nftId'],
                            equals: nftId
                        }
                    }
                ]
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true
                    }
                },
                receiver: {
                    select: {
                        id: true,
                        username: true,
                        profileImage: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        res.json({ messages });

    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
