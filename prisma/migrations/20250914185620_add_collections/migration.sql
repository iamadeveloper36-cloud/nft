-- AlterTable
ALTER TABLE `nfts` ADD COLUMN `auctionEndTime` DATETIME(3) NULL,
    ADD COLUMN `auctionReservePrice` DOUBLE NULL,
    ADD COLUMN `auctionStartPrice` DOUBLE NULL,
    ADD COLUMN `auctionStatus` ENUM('NOT_AUCTION', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED') NOT NULL DEFAULT 'NOT_AUCTION',
    ADD COLUMN `collectionId` VARCHAR(191) NULL,
    ADD COLUMN `isAuction` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `collections` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `bannerImage` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `twitter` VARCHAR(191) NULL,
    `discord` VARCHAR(191) NULL,
    `instagram` VARCHAR(191) NULL,
    `isVerified` BOOLEAN NOT NULL DEFAULT false,
    `floorPrice` DOUBLE NULL,
    `totalVolume` DOUBLE NULL,
    `totalSupply` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `collections` ADD CONSTRAINT `collections_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `nfts` ADD CONSTRAINT `nfts_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
