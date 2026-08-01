-- Stage 5 follow-up: BatchOrigin on Batch (Supplier already created in 20260731180000)
CREATE TYPE "BatchOrigin" AS ENUM ('PURCHASE', 'TRANSFER', 'RETURN', 'INITIAL', 'ADJUSTMENT', 'OTHER');

ALTER TABLE "Batch" ADD COLUMN "origin" "BatchOrigin" NOT NULL DEFAULT 'PURCHASE';

UPDATE "Batch" SET "origin" = 'TRANSFER' WHERE "transferItemId" IS NOT NULL;
UPDATE "Batch" SET "origin" = 'RETURN'
WHERE "notes" LIKE 'warehouse_return:%' OR "notes" LIKE 'sale_return:%';

CREATE INDEX "Batch_origin_receivedAt_idx" ON "Batch"("origin", "receivedAt");
