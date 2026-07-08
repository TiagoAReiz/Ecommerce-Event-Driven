-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CREDIT_CARD', 'PIX', 'BOLETO');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentSplitStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "mpPaymentId" TEXT,
    "mpPreferenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSplit" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "subOrderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "mpCollectorId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "platformFeeAmount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentSplitStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpWebhookEvent" (
    "id" TEXT NOT NULL,
    "mpEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "MpWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerPaymentProfile" (
    "sellerId" TEXT NOT NULL,
    "mpCollectorId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerPaymentProfile_pkey" PRIMARY KEY ("sellerId")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpPreferenceId_key" ON "Payment"("mpPreferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "MpWebhookEvent_mpEventId_key" ON "MpWebhookEvent"("mpEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedEvent_eventId_key" ON "ProcessedEvent"("eventId");

-- AddForeignKey
ALTER TABLE "PaymentSplit" ADD CONSTRAINT "PaymentSplit_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
