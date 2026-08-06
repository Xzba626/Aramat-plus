-- Additive: revision workflow needs PENDING_APPROVAL (schema already has it; DB did not).
-- Safe on live data: ADD VALUE IF NOT EXISTS (PG 9.1+ / IF NOT EXISTS PG 15+).
-- Use DO block for older Postgres compatibility.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'InventoryStatus'
      AND e.enumlabel = 'PENDING_APPROVAL'
  ) THEN
    ALTER TYPE "InventoryStatus" ADD VALUE 'PENDING_APPROVAL';
  END IF;
END
$$;
