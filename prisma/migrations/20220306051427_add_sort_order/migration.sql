/*
  Warnings:

  - Added the required column `sortOrder` to the `Videos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `videos` ADD COLUMN `sortOrder` INTEGER NOT NULL;
