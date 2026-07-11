/*
  Warnings:

  - Added the required column `userId` to the `SellerPaymentProfile` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "SellerPaymentProfile" ADD COLUMN     "userId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "SellerPaymentProfile_userId_idx" ON "SellerPaymentProfile"("userId");
