-- Stage 5: Supplier + purchase history fields on Batch

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "comment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");
CREATE INDEX "Supplier_companyId_isActive_idx" ON "Supplier"("companyId", "isActive");

ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Batch: preserve original receipt qty + supplier + who received
ALTER TABLE "Batch" ADD COLUMN "initialQuantity" DECIMAL(14,3);
UPDATE "Batch" SET "initialQuantity" = "quantity" WHERE "initialQuantity" IS NULL;
ALTER TABLE "Batch" ALTER COLUMN "initialQuantity" SET NOT NULL;

ALTER TABLE "Batch" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "Batch" ADD COLUMN "createdById" TEXT;

CREATE INDEX "Batch_supplierId_idx" ON "Batch"("supplierId");
CREATE INDEX "Batch_createdById_idx" ON "Batch"("createdById");

ALTER TABLE "Batch" ADD CONSTRAINT "Batch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
