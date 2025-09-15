/*
  Warnings:

  - You are about to drop the column `collectionId` on the `nfts` table. All the data in the column will be lost.
  - You are about to drop the `collections` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `collections` DROP FOREIGN KEY `collections_creatorId_fkey`;

-- DropForeignKey
ALTER TABLE `nfts` DROP FOREIGN KEY `nfts_collectionId_fkey`;

-- DropIndex
DROP INDEX `nfts_collectionId_fkey` ON `nfts`;

-- AlterTable
ALTER TABLE `nfts` DROP COLUMN `collectionId`;

-- DropTable
DROP TABLE `collections`;
