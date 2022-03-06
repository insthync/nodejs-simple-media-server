/*
  Warnings:

  - Added the required column `playListId` to the `Videos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `videos` ADD COLUMN `playListId` VARCHAR(191) NOT NULL;
