const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function createAdmin() {
    try {
        // Check if admin already exists
        const existingAdmin = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: 'admin@demosea.com' },
                    { username: 'admin' }
                ]
            }
        });

        if (existingAdmin) {
            console.log('Admin user already exists!');
            console.log('Email:', existingAdmin.email);
            console.log('Username:', existingAdmin.username);
            console.log('Is Admin:', existingAdmin.isAdmin);
            return;
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash('admin123', 10);

        // Create admin user
        const admin = await prisma.user.create({
            data: {
                username: 'admin',
                email: 'admin@demosea.com',
                password: hashedPassword,
                firstName: 'Admin',
                lastName: 'User',
                bio: 'Platform Administrator',
                isVerified: true,
                isActive: true,
                isAdmin: true,
                walletAddress: '0xAdmin1234567890abcdef',
                ethBalance: 100.0 // Give admin some ETH for testing
            }
        });

        console.log('✅ Admin user created successfully!');
        console.log('Email: admin@demosea.com');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Is Admin: true');
        console.log('ETH Balance: 100.0 ETH');

    } catch (error) {
        console.error('❌ Error creating admin user:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createAdmin();
