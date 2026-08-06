/** Factory / seed credentials — safe seed upserts OWNER back to these. */
export const SEED_OWNER_EMAIL = "owner@aromat.plus";
export const SEED_OWNER_PASSWORD = "owner1234";
export const SEED_OWNER_NAME = "Владелец";

export const SEED_ADMIN_EMAIL = "admin@aromat.plus";
export const SEED_ADMIN_PASSWORD = "admin12345";

export const SEED_MANAGER_EMAIL = "manager@aromat.plus";
export const SEED_MANAGER_PASSWORD = "manager12345";

export const SEED_SELLER_EMAIL = "seller@aromat.plus";
export const SEED_SELLER_PASSWORD = "seller12345";

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

/** Finance → Products: monthly sales baselines (scaled by period day count). */
export const SALES_PERFORMANCE_THRESHOLDS_SETTING_KEY =
  "salesPerformanceThresholds";

/** Reference length for monthly baselines (days). */
export const SALES_PERFORMANCE_REFERENCE_DAYS = 30;

export const DEFAULT_SALES_PERFORMANCE_THRESHOLDS = {
  /** Piece merchandise — units sold per reference month */
  monthlyPieces: 10,
  /** Weight merchandise — ml sold per reference month */
  monthlyMl: 200,
} as const;
