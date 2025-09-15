const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Create an activity record
 * @param {string} userId - User ID
 * @param {string} type - Activity type (from ActivityType enum)
 * @param {string} description - Activity description
 * @param {string} nftId - Optional NFT ID
 * @param {object} metadata - Optional metadata
 */
const createActivity = async (userId, type, description, nftId = null, metadata = null) => {
    try {
        const activity = await prisma.activity.create({
            data: {
                userId,
                type,
                description,
                nftId,
                metadata
            }
        });

        console.log(`Activity created: ${type} for user ${userId}`);
        return activity;
    } catch (error) {
        console.error('Error creating activity:', error);
        // Don't throw error to avoid breaking the main operation
        return null;
    }
};

/**
 * Create NFT-related activities
 */
const createNFTActivity = {
    created: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_CREATED',
            `Created NFT "${nftName}"`,
            nftId,
            { nftName }
        );
    },

    updated: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_UPDATED',
            `Updated NFT "${nftName}"`,
            nftId,
            { nftName }
        );
    },

    deleted: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_DELETED',
            `Deleted NFT "${nftName}"`,
            nftId,
            { nftName }
        );
    },

    listed: async (userId, nftId, nftName, price) => {
        return await createActivity(
            userId,
            'NFT_LISTED',
            `Listed NFT "${nftName}" for ${price} ETH`,
            nftId,
            { nftName, price }
        );
    },

    unlisted: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_UNLISTED',
            `Unlisted NFT "${nftName}"`,
            nftId,
            { nftName }
        );
    },

    sold: async (userId, nftId, nftName, price) => {
        return await createActivity(
            userId,
            'NFT_SOLD',
            `Sold NFT "${nftName}" for ${price} ETH`,
            nftId,
            { nftName, price }
        );
    },

    purchased: async (userId, nftId, nftName, price) => {
        return await createActivity(
            userId,
            'NFT_PURCHASED',
            `Purchased NFT "${nftName}" for ${price} ETH`,
            nftId,
            { nftName, price }
        );
    },

    favorited: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_FAVORITED',
            `Added "${nftName}" to favorites`,
            nftId,
            { nftName }
        );
    },

    unfavorited: async (userId, nftId, nftName) => {
        return await createActivity(
            userId,
            'NFT_UNFAVORITED',
            `Removed "${nftName}" from favorites`,
            nftId,
            { nftName }
        );
    }
};

/**
 * Create bid-related activities
 */
const createBidActivity = {
    placed: async (userId, nftId, nftName, amount) => {
        return await createActivity(
            userId,
            'BID_PLACED',
            `Placed bid of ${amount} ETH on "${nftName}"`,
            nftId,
            { nftName, amount }
        );
    },

    accepted: async (userId, nftId, nftName, amount) => {
        return await createActivity(
            userId,
            'BID_ACCEPTED',
            `Bid of ${amount} ETH accepted for "${nftName}"`,
            nftId,
            { nftName, amount }
        );
    },

    rejected: async (userId, nftId, nftName, amount) => {
        return await createActivity(
            userId,
            'BID_REJECTED',
            `Bid of ${amount} ETH rejected for "${nftName}"`,
            nftId,
            { nftName, amount }
        );
    }
};

/**
 * Create profile-related activities
 */
const createProfileActivity = {
    updated: async (userId) => {
        return await createActivity(
            userId,
            'PROFILE_UPDATED',
            'Updated profile information'
        );
    },

    walletConnected: async (userId, walletAddress) => {
        return await createActivity(
            userId,
            'WALLET_CONNECTED',
            `Connected wallet: ${walletAddress}`,
            null,
            { walletAddress }
        );
    }
};

module.exports = {
    createActivity,
    createNFTActivity,
    createBidActivity,
    createProfileActivity
};
