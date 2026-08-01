-- Stage 3 P0/P1: recurring expenses, net profit support, revision ADJUSTMENT,
-- partial returns, lockout fields, price/cost history reasons.

-- Enums
CREATE TYPE "ExpensePeriodicity" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ReturnReasonCode" AS ENUM ('DEFECT', 'SELLER_ERROR', 'CUSTOMER_ERROR', 'EXPIRED', 'DAMAGED', 'OTHER');
CREATE TYPE "WriteOffReasonCode" AS ENUM ('SPOILED', 'BROKEN', 'TESTER', 'STOLEN', 'LOSS', 'EXPIRED', 'OTHER');
ALTER TYPE "BatchOrigin" ADD VALUE IF NOT EXISTS 'ADJUSTMENT';

-- User lockout
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedUntil" TIMESTAMP(3);

-- Expense recurrence
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "periodicity" "ExpensePeriodicity" NOT NULL DEFAULT 'ONCE';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);

UPDATE "Expense" SET "startsAt" = "incurredAt" WHERE "startsAt" IS NULL;
ALTER TABLE "Expense" ALTER COLUMN "startsAt" SET NOT NULL;
ALTER TABLE "Expense" ALTER COLUMN "startsAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Expense_storeId_startsAt_endsAt_idx" ON "Expense"("storeId", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "Expense_periodicity_startsAt_idx" ON "Expense"("periodicity", "startsAt");

-- Price / cost history
ALTER TABLE "PriceHistory" ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE TABLE IF NOT EXISTS "CostHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "oldCost" DECIMAL(12,2),
    "newCost" DECIMAL(12,2),
    "reason" TEXT,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CostHistory_productId_createdAt_idx" ON "CostHistory"("productId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CostHistory" ADD CONSTRAINT "CostHistory_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sale returns: reason code + partial lines
ALTER TABLE "returns" ADD COLUMN IF NOT EXISTS "reasonCode" "ReturnReasonCode";

CREATE TABLE IF NOT EXISTS "SaleReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "costPerUnit" DECIMAL(12,4) NOT NULL,
    "salePrice" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "SaleReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SaleReturnItem_returnId_idx" ON "SaleReturnItem"("returnId");
CREATE INDEX IF NOT EXISTS "SaleReturnItem_saleItemId_idx" ON "SaleReturnItem"("saleItemId");

DO $$ BEGIN
  ALTER TABLE "SaleReturnItem" ADD CONSTRAINT "SaleReturnItem_returnId_fkey"
    FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
