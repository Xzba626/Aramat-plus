-- Phase 3+: finalize Batch.salePrice as NOT NULL after backfill + green sale path
DO $$
DECLARE
  null_batches INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_batches FROM "Batch" WHERE "salePrice" IS NULL;
  IF null_batches > 0 THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: Batches without salePrice: %', null_batches;
  END IF;
END
$$;

ALTER TABLE "Batch" ALTER COLUMN "salePrice" SET NOT NULL;
