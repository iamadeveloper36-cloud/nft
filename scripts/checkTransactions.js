const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTransactions() {
    try {
        console.log('Checking transactions in database...\n');

        // Check deposits
        const deposits = await prisma.walletDeposit.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        console.log(`Found ${deposits.length} deposits:`);
        deposits.forEach(deposit => {
            console.log(`- ID: ${deposit.id}, Amount: ${deposit.amount} ETH, Status: ${deposit.status}, User: ${deposit.user?.username || 'Unknown'}`);
        });

        // Check withdrawals
        const withdrawals = await prisma.walletWithdrawal.findMany({
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        console.log(`\nFound ${withdrawals.length} withdrawals:`);
        withdrawals.forEach(withdrawal => {
            console.log(`- ID: ${withdrawal.id}, Amount: ${withdrawal.amount} ETH, Status: ${withdrawal.status}, User: ${withdrawal.user?.username || 'Unknown'}`);
        });

        console.log(`\nTotal transactions: ${deposits.length + withdrawals.length}`);

    } catch (error) {
        console.error('Error checking transactions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkTransactions();
