-- Store ↔ Store transfers: optional warehouse source, optional store source
ALTER TABLE "Transfer" ALTER COLUMN "fromWarehouseId" DROP NOT NULL;
ALTER TABLE "Transfer" ADD COLUMN IF NOT EXISTS "fromStoreId" TEXT;

CREATE INDEX IF NOT EXISTS "Transfer_fromStoreId_idx" ON "Transfer"("fromStoreId");

DO $$ BEGIN
  ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromStoreId_fkey"
    FOREIGN KEY ("fromStoreId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
