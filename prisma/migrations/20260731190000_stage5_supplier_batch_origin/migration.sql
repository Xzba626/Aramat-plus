-- Stage 5: Supplier + Batch purchase origin / supplier / creator
CREATE TYPE "BatchOrigin" AS ENUM ('PURCHASE', 'TRANSFER', 'RETURN', 'INITIAL', 'OTHER');

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");
CREATE INDEX "Supplier_companyId_isActive_idx" ON "Supplier"("companyId", "isActive");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Batch" ADD COLUMN "origin" "BatchOrigin" NOT NULL DEFAULT 'PURCHASE';
ALTER TABLE "Batch" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "Batch" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Batch" ADD COLUMN "originalQuantity" DECIMAL(14,3);

-- Backfill original qty from current remaining for existing rows
UPDATE "Batch" SET "originalQuantity" = "quantity" WHERE "originalQuantity" IS NULL;

CREATE INDEX "Batch_supplierId_idx" ON "Batch"("supplierId");
CREATE INDEX "Batch_origin_receivedAt_idx" ON "Batch"("origin", "receivedAt");

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
