const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkPaymentMethod() {
    try {
        console.log('Checking payment methods...');

        const paymentMethods = await prisma.paymentMethod.findMany();
        console.log('Found payment methods:', paymentMethods.length);

        if (paymentMethods.length > 0) {
            paymentMethods.forEach((pm, index) => {
                console.log(`Payment Method ${index + 1}:`);
                console.log(`  ID: ${pm.id}`);
                console.log(`  ETH Address: ${pm.ethAddress}`);
                console.log(`  QR Code Image: ${pm.qrCodeImage}`);
                console.log(`  Is Active: ${pm.isActive}`);
                console.log(`  Created: ${pm.createdAt}`);
                console.log('---');
            });
        } else {
            console.log('No payment methods found in database');
        }

    } catch (error) {
        console.error('Error checking payment methods:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPaymentMethod();
