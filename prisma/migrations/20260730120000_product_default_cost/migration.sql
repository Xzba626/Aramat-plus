-- AlterTable
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "defaultCostPerUnit" DECIMAL(12,2);
