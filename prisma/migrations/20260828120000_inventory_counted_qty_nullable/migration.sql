-- Blind revision: countedQty stays null until physical count is entered.
ALTER TABLE "InventoryItem" ALTER COLUMN "countedQty" DROP NOT NULL;
