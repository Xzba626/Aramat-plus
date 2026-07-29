-- CreateEnum
CREATE TYPE "StoreKind" AS ENUM ('BRANCH', 'OWNER_DIRECT');

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "kind" "StoreKind" NOT NULL DEFAULT 'BRANCH';

-- CreateIndex
CREATE INDEX "Store_companyId_kind_idx" ON "Store"("companyId", "kind");
