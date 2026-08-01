-- Block 4 Phase 4a: PackagingSku + ProductKind + SaleItem/Return packaging fields
-- stock.service / FIFO unchanged

CREATE TYPE "ProductKind" AS ENUM ('STANDARD', 'PACKAGING');

CREATE TABLE "PackagingSku" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "volumeMl" DECIMAL(14,3) NOT NULL,
    "material" TEXT NOT NULL DEFAULT 'glass',
    "color" TEXT NOT NULL DEFAULT '',
    "cap" TEXT NOT NULL DEFAULT '',
    "skuCode" TEXT,
    "defaultCost" DECIMAL(12,4),
    "isDefaultForVolume" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingSku_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackagingSku_companyId_volumeMl_material_color_cap_key"
  ON "PackagingSku"("companyId", "volumeMl", "material", "color", "cap");

CREATE INDEX "PackagingSku_companyId_volumeMl_idx" ON "PackagingSku"("companyId", "volumeMl");
CREATE INDEX "PackagingSku_companyId_isActive_idx" ON "PackagingSku"("companyId", "isActive");

ALTER TABLE "PackagingSku" ADD CONSTRAINT "PackagingSku_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "kind" "ProductKind" NOT NULL DEFAULT 'STANDARD';
ALTER TABLE "Product" ADD COLUMN "packagingSkuId" TEXT;

CREATE INDEX "Product_companyId_kind_idx" ON "Product"("companyId", "kind");
CREATE INDEX "Product_packagingSkuId_idx" ON "Product"("packagingSkuId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_packagingSkuId_fkey"
  FOREIGN KEY ("packagingSkuId") REFERENCES "PackagingSku"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleItem" ADD COLUMN "isDecant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SaleItem" ADD COLUMN "packagingProductId" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "packagingQuantity" DECIMAL(14,3);
ALTER TABLE "SaleItem" ADD COLUMN "packagingCostPerUnit" DECIMAL(12,4);

CREATE INDEX "SaleItem_packagingProductId_idx" ON "SaleItem"("packagingProductId");

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_packagingProductId_fkey"
  FOREIGN KEY ("packagingProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleReturnItem" ADD COLUMN "packagingReturned" BOOLEAN NOT NULL DEFAULT false;
