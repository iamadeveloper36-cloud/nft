const express = require('express');
const axios = require('axios');

const router = express.Router();

// Cache for ETH rate to reduce API calls
let ethRateCache = {
    rate: 4620.96, // Fallback rate
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutes cache
};

// Get ETH to USD conversion rate
router.get('/eth-to-usd', async (req, res) => {
    try {
        const now = Date.now();

        // Check if we have a valid cached rate
        if (ethRateCache.timestamp && (now - ethRateCache.timestamp) < ethRateCache.ttl) {
            return res.json({
                success: true,
                rate: ethRateCache.rate,
                currency: 'USD',
                timestamp: new Date(ethRateCache.timestamp).toISOString(),
                cached: true
            });
        }

        // Using CoinGecko API (free tier)
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', {
            timeout: 5000 // 5 second timeout
        });

        if (response.data && response.data.ethereum && response.data.ethereum.usd) {
            const ethToUsd = response.data.ethereum.usd;

            // Update cache
            ethRateCache.rate = ethToUsd;
            ethRateCache.timestamp = now;

            res.json({
                success: true,
                rate: ethToUsd,
                currency: 'USD',
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error('Invalid response from CoinGecko API');
        }
    } catch (error) {
        console.error('ETH to USD conversion error:', error);

        // Use cached rate if available, otherwise fallback
        const rate = ethRateCache.rate;

        res.json({
            success: false,
            rate: rate,
            currency: 'USD',
            timestamp: new Date().toISOString(),
            fallback: true,
            error: 'Using cached/fallback rate due to API error'
        });
    }
});

module.exports = router;
