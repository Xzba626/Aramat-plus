-- R1: MANAGER permissions + store scope (additive)

CREATE TYPE "ManagerScopeMode" AS ENUM ('LEGACY_SINGLE', 'ALL_STORES', 'SELECTED_STORES');

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerScopeMode" "ManagerScopeMode" NOT NULL DEFAULT 'LEGACY_SINGLE';

CREATE TABLE IF NOT EXISTS "ManagerPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagerPermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ManagerStoreAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    CONSTRAINT "ManagerStoreAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ManagerPermission_userId_key_key" ON "ManagerPermission"("userId", "key");
CREATE INDEX IF NOT EXISTS "ManagerPermission_userId_idx" ON "ManagerPermission"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "ManagerStoreAccess_userId_storeId_key" ON "ManagerStoreAccess"("userId", "storeId");
CREATE INDEX IF NOT EXISTS "ManagerStoreAccess_userId_idx" ON "ManagerStoreAccess"("userId");
CREATE INDEX IF NOT EXISTS "ManagerStoreAccess_storeId_idx" ON "ManagerStoreAccess"("storeId");

DO $$ BEGIN
  ALTER TABLE "ManagerPermission" ADD CONSTRAINT "ManagerPermission_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ManagerStoreAccess" ADD CONSTRAINT "ManagerStoreAccess_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ManagerStoreAccess" ADD CONSTRAINT "ManagerStoreAccess_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
