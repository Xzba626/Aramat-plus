-- Phase 3+: Batch.salePrice (nullable during backfill; NOT NULL in a later migration)
-- A: add column
ALTER TABLE "Batch" ADD COLUMN IF NOT EXISTS "salePrice" DECIMAL(12,2);

-- B: block if any Product lacks salePrice (schema requires it; safety check)
DO $$
DECLARE
  null_products INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_products FROM "Product" WHERE "salePrice" IS NULL;
  IF null_products > 0 THEN
    RAISE EXCEPTION 'Migration blocked: Products without salePrice: %', null_products;
  END IF;
END $$;

-- C: backfill from Product catalog price
UPDATE "Batch" b
SET "salePrice" = p."salePrice"
FROM "Product" p
WHERE b."productId" = p.id
  AND b."salePrice" IS NULL;

-- D: assert no Batch left without salePrice
DO $$
DECLARE
  null_batches INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_batches FROM "Batch" WHERE "salePrice" IS NULL;
  IF null_batches > 0 THEN
    RAISE EXCEPTION 'Migration blocked: Batches without salePrice after backfill: %', null_batches;
  END IF;
END $$;
