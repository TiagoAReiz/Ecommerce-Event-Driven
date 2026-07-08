/*
  Warnings:

  - Added the required column `updatedAt` to the `OutboxEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OutboxEvent" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
