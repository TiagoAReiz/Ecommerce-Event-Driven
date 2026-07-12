-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PAYMENT_REFUNDED';

-- CreateTable
CREATE TABLE "UserContact" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserContact_pkey" PRIMARY KEY ("userId")
);
