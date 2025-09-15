const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function addTestTransactions() {
    try {
        console.log('Adding test transactions...\n');

        // Get a sample user
        const user = await prisma.user.findFirst();

        if (!user) {
            console.log('No users found. Please create a user first.');
            return;
        }

        console.log(`Using user: ${user.username} (${user.email})`);

        // Add test deposits
        const testDeposits = [
            {
                userId: user.id,
                amount: 1.5,
                txHash: '0x1234567890abcdef1234567890abcdef12345678',
                status: 'PENDING',
                adminNotes: 'Test deposit 1'
            },
            {
                userId: user.id,
                amount: 2.0,
                txHash: '0xabcdef1234567890abcdef1234567890abcdef12',
                status: 'COMPLETED',
                adminNotes: 'Test deposit 2'
            },
            {
                userId: user.id,
                amount: 0.5,
                txHash: '0x9876543210fedcba9876543210fedcba98765432',
                status: 'PENDING',
                adminNotes: 'Test deposit 3'
            }
        ];

        // Add test withdrawals
        const testWithdrawals = [
            {
                userId: user.id,
                amount: 0.5,
                toAddress: '0x1111111111111111111111111111111111111111',
                txHash: '0xfedcba9876543210fedcba9876543210fedcba98',
                status: 'PENDING',
                adminNotes: 'Test withdrawal 1'
            },
            {
                userId: user.id,
                amount: 1.0,
                toAddress: '0x2222222222222222222222222222222222222222',
                txHash: '0x1111222233334444555566667777888899990000',
                status: 'COMPLETED',
                adminNotes: 'Test withdrawal 2'
            }
        ];

        // Create deposits
        for (const deposit of testDeposits) {
            const created = await prisma.walletDeposit.create({
                data: deposit
            });
            console.log(`Created deposit: ${created.id} - ${created.amount} ETH (${created.status})`);
        }

        // Create withdrawals
        for (const withdrawal of testWithdrawals) {
            const created = await prisma.walletWithdrawal.create({
                data: withdrawal
            });
            console.log(`Created withdrawal: ${created.id} - ${created.amount} ETH (${created.status})`);
        }

        console.log('\nTest transactions added successfully!');

    } catch (error) {
        console.error('Error adding test transactions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

addTestTransactions();
