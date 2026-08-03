-- Soft-delete timestamps for archive retention purge
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

UPDATE "Store" SET "archivedAt" = "updatedAt" WHERE "isArchived" = true AND "archivedAt" IS NULL;
UPDATE "Product" SET "archivedAt" = "updatedAt" WHERE "isActive" = false AND "archivedAt" IS NULL;
UPDATE "Category" SET "archivedAt" = "updatedAt" WHERE "isArchived" = true AND "archivedAt" IS NULL;
UPDATE "Brand" SET "archivedAt" = "updatedAt" WHERE "isArchived" = true AND "archivedAt" IS NULL;
