-- CreateEnum
CREATE TYPE "ContainerSource" AS ENUM ('STORE_BOTTLE', 'CUSTOMER_BOTTLE');

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "containerSource" "ContainerSource";

-- Backfill: historical decant lines with a store bottle
UPDATE "SaleItem"
SET "containerSource" = 'STORE_BOTTLE'
WHERE "packagingProductId" IS NOT NULL AND "containerSource" IS NULL;

-- CreateIndex
CREATE INDEX "SaleItem_containerSource_idx" ON "SaleItem"("containerSource");
