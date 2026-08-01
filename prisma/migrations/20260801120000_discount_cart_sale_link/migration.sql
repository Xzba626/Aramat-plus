-- AlterTable Sale
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountRequestId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountApprovedById" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountApprovedAt" TIMESTAMP(3);

-- AlterTable DiscountRequest
ALTER TABLE "DiscountRequest" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
ALTER TABLE "DiscountRequest" ADD COLUMN IF NOT EXISTS "storeId" TEXT;
ALTER TABLE "DiscountRequest" ADD COLUMN IF NOT EXISTS "originalAmount" DECIMAL(12,2);
ALTER TABLE "DiscountRequest" ADD COLUMN IF NOT EXISTS "cartSnapshot" JSONB;

-- Backfill company + originalAmount for existing rows
UPDATE "DiscountRequest" AS dr
SET
  "companyId" = u."companyId",
  "originalAmount" = COALESCE(dr."originalAmount", dr."amount")
FROM "User" AS u
WHERE u."id" = dr."requesterId"
  AND (dr."companyId" IS NULL OR dr."originalAmount" IS NULL);

-- Failsafe if orphan rows
UPDATE "DiscountRequest"
SET
  "companyId" = COALESCE("companyId", (SELECT "id" FROM "Company" LIMIT 1)),
  "originalAmount" = COALESCE("originalAmount", 0)
WHERE "companyId" IS NULL OR "originalAmount" IS NULL;

ALTER TABLE "DiscountRequest" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DiscountRequest" ALTER COLUMN "originalAmount" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Sale_discountRequestId_key" ON "Sale"("discountRequestId");
CREATE INDEX IF NOT EXISTS "DiscountRequest_companyId_status_idx" ON "DiscountRequest"("companyId", "status");
CREATE INDEX IF NOT EXISTS "DiscountRequest_storeId_idx" ON "DiscountRequest"("storeId");

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_discountRequestId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_discountRequestId_fkey" FOREIGN KEY ("discountRequestId") REFERENCES "DiscountRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_discountApprovedById_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_discountApprovedById_fkey" FOREIGN KEY ("discountApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DiscountRequest" DROP CONSTRAINT IF EXISTS "DiscountRequest_companyId_fkey";
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DiscountRequest" DROP CONSTRAINT IF EXISTS "DiscountRequest_storeId_fkey";
ALTER TABLE "DiscountRequest" ADD CONSTRAINT "DiscountRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
