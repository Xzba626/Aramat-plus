/** Factory / seed credentials — wipe resets OWNER back to these. */
export const SEED_OWNER_EMAIL = "owner@aromat.plus";
export const SEED_OWNER_PASSWORD = "owner1234";
export const SEED_OWNER_NAME = "Владелец";

/** Shared archive retention (days). Soft-deleted entities purged after this. */
export const ARCHIVE_RETENTION_SETTING_KEY = "archiveRetentionDays";
export const DEFAULT_ARCHIVE_RETENTION_DAYS = 30;

/** Unified low-stock thresholds (company Setting JSON). */
export const LOW_STOCK_THRESHOLDS_SETTING_KEY = "lowStockThresholds";

export const DEFAULT_LOW_STOCK_THRESHOLDS = {
  /** Central warehouse — piece products (pcs) */
  warehousePiece: 100,
  /** Store — piece products (pcs) */
  storePiece: 20,
  /** Store — weight / bulk products (ml) */
  storeWeightMl: 200,
  /** Packaging bottles at store (pcs) */
  bottlePiece: 5,
} as const;
