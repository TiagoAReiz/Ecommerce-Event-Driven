/*
  Warnings:

  - Added the required column `addressId` to the `FreightQuote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `orderId` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Shipment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FreightQuote" ADD COLUMN     "addressId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN     "orderId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL;
