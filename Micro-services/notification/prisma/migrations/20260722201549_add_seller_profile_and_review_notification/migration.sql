-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_RECEIVED';

-- CreateTable
CREATE TABLE "SellerProfile" (
    "sellerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("sellerId")
);
