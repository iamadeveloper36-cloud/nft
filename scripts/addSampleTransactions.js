const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addSampleTransactions() {
    try {
        // Get a sample user
        const user = await prisma.user.findFirst();

        if (!user) {
            console.log('No users found. Please create a user first.');
            return;
        }

        // Sample transactions
        const sampleTransactions = [
            {
                id: 'txn_001',
                userId: user.id,
                type: 'DEPOSIT',
                amount: 1.5,
                status: 'PENDING',
                description: 'Wallet deposit',
                transactionHash: '0x1234567890abcdef1234567890abcdef12345678'
            },
            {
                id: 'txn_002',
                userId: user.id,
                type: 'WITHDRAWAL',
                amount: 0.5,
                status: 'COMPLETED',
                description: 'Withdrawal to external wallet',
                transactionHash: '0xabcdef1234567890abcdef1234567890abcdef12'
            },
            {
                id: 'txn_003',
                userId: user.id,
                type: 'PURCHASE',
                amount: 0.25,
                status: 'COMPLETED',
                description: 'NFT purchase',
                transactionHash: '0x9876543210fedcba9876543210fedcba98765432'
            },
            {
                id: 'txn_004',
                userId: user.id,
                type: 'SALE',
                amount: 0.75,
                status: 'PENDING',
                description: 'NFT sale',
                transactionHash: '0xfedcba9876543210fedcba9876543210fedcba98'
            },
            {
                id: 'txn_005',
                userId: user.id,
                type: 'MINTING_FEE',
                amount: 0.1,
                status: 'COMPLETED',
                description: 'NFT minting fee',
                transactionHash: '0x1111222233334444555566667777888899990000'
            }
        ];

        // Add transactions
        for (const transaction of sampleTransactions) {
            await prisma.transaction.create({
                data: transaction
            });
            console.log(`Created transaction: ${transaction.id}`);
        }

        console.log('Sample transactions added successfully!');
    } catch (error) {
        console.error('Error adding sample transactions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addSampleTransactions();
