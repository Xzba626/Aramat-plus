/**
 * Map ActivityLog.action → UI/filter category.
 * Unknown actions fall into "other" so future events still appear.
 *
 * Categories are server filter keys (`?category=`), not cosmetic tabs only.
 */

export type ActivityLogCategory =
  | "logins"
  | "passwords"
  | "sales"
  | "returns"
  | "discounts"
  | "warehouse"
  | "products"
  | "users"
  | "settings"
  | "other";

/** Primary tabs shown in Journal UI (order matters). */
export const JOURNAL_TAB_CATEGORIES: Array<ActivityLogCategory | "all"> = [
  "all",
  "logins",
  "passwords",
  "sales",
  "returns",
  "discounts",
  "warehouse",
  "products",
  "users",
  "settings",
  "other",
];

export const ACTIVITY_LOG_CATEGORIES: ActivityLogCategory[] = [
  "logins",
  "passwords",
  "sales",
  "returns",
  "discounts",
  "warehouse",
  "products",
  "users",
  "settings",
  "other",
];

const LOGIN_ACTIONS = new Set(["LOGIN", "LOGIN_FAIL", "LOGIN_LOCKED"]);

const PASSWORD_ACTIONS = new Set(["PASSWORD_CHANGE", "PASSWORD_RESET"]);

const SALES_ACTIONS = new Set([
  "SALE_CREATE",
  "RESERVATION_CREATE",
  "RESERVATION_CANCEL",
  "RESERVATION_COMPLETE",
  "RESERVATION_EXPIRE",
]);

const RETURN_ACTIONS = new Set([
  "RETURN_REQUEST",
  "RETURN_APPROVE",
  "RETURN_REJECT",
]);

const DISCOUNT_ACTIONS = new Set([
  "DISCOUNT_REQUEST",
  "DISCOUNT_APPROVE",
  "DISCOUNT_REJECT",
]);

const WAREHOUSE_ACTIONS = new Set([
  "BATCH_CREATE",
  "TRANSFER_CREATE",
  "STORE_TRANSFER_CREATE",
  "WAREHOUSE_RETURN_IN",
  "WRITE_OFF",
  "REVISION_CREATE",
  "REVISION_COUNT",
  "REVISION_APPROVE",
  "REVISION_CANCEL",
  "PACKAGING_SKU_CREATE",
  "PACKAGING_SKU_UPDATE",
]);

const PRODUCT_ACTIONS = new Set([
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "PRODUCT_DEACTIVATE",
  "PRICE_CHANGE",
  "COST_CHANGE",
  "CATEGORY_CREATE",
  "CATEGORY_ARCHIVE",
  "CATEGORY_RESTORE",
  "CATEGORY_DELETE",
  "BRAND_CREATE",
  "BRAND_UPDATE",
  "BRAND_ARCHIVE",
  "BRAND_RESTORE",
  "SUPPLIER_CREATE",
  "SUPPLIER_UPDATE",
  "SUPPLIER_DEACTIVATE",
  "SUPPLIER_RESTORE",
  "UNIT_CREATE",
]);

const USER_ACTIONS = new Set(["USER_CREATE", "USER_UPDATE"]);

const SETTINGS_ACTIONS = new Set([
  "COMPANY_UPDATE",
  "STORE_CREATE",
  "STORE_UPDATE",
  "EXPENSE_CREATE",
  "CRM_WIPE",
]);

/** @deprecated use logins — kept for old bookmarks `?category=security` */
const LEGACY_SECURITY = new Set([
  ...LOGIN_ACTIONS,
  ...PASSWORD_ACTIONS,
  "CRM_WIPE",
]);

/** All known actions grouped by category (for server-side `action in [...]`). */
export function actionsForCategory(
  category: ActivityLogCategory | "security"
): string[] | null {
  if (category === "other") return null;
  if (category === "security") return [...LEGACY_SECURITY];
  if (category === "logins") return [...LOGIN_ACTIONS];
  if (category === "passwords") return [...PASSWORD_ACTIONS];
  if (category === "sales") return [...SALES_ACTIONS];
  if (category === "returns") return [...RETURN_ACTIONS];
  if (category === "discounts") return [...DISCOUNT_ACTIONS];
  if (category === "warehouse") return [...WAREHOUSE_ACTIONS];
  if (category === "products") return [...PRODUCT_ACTIONS];
  if (category === "users") return [...USER_ACTIONS];
  if (category === "settings") return [...SETTINGS_ACTIONS];
  return null;
}

export function allKnownActions(): string[] {
  return [
    ...LOGIN_ACTIONS,
    ...PASSWORD_ACTIONS,
    ...SALES_ACTIONS,
    ...RETURN_ACTIONS,
    ...DISCOUNT_ACTIONS,
    ...WAREHOUSE_ACTIONS,
    ...PRODUCT_ACTIONS,
    ...USER_ACTIONS,
    ...SETTINGS_ACTIONS,
  ];
}

export function categorizeActivityAction(action: string): ActivityLogCategory {
  if (LOGIN_ACTIONS.has(action)) return "logins";
  if (PASSWORD_ACTIONS.has(action)) return "passwords";
  if (SALES_ACTIONS.has(action)) return "sales";
  if (RETURN_ACTIONS.has(action)) return "returns";
  if (DISCOUNT_ACTIONS.has(action)) return "discounts";
  if (WAREHOUSE_ACTIONS.has(action)) return "warehouse";
  if (PRODUCT_ACTIONS.has(action)) return "products";
  if (USER_ACTIONS.has(action)) return "users";
  if (SETTINGS_ACTIONS.has(action)) return "settings";
  return "other";
}

export function isActivityLogCategory(
  value: string
): value is ActivityLogCategory {
  return (ACTIVITY_LOG_CATEGORIES as string[]).includes(value);
}

/** Accept journal tab keys including legacy `security`. */
export function isJournalCategoryParam(
  value: string
): value is ActivityLogCategory | "security" {
  return isActivityLogCategory(value) || value === "security";
}

export type ActivitySeverity = "info" | "warning" | "critical" | "security";

/**
 * Visual importance only — not stored in DB.
 * Single source of truth for journal cards, CSV export, and audits.
 *
 * LOGIN* → SECURITY · PASSWORD_RESET / CRM_WIPE → CRITICAL
 * PASSWORD_CHANGE / WRITE_OFF / returns / discounts → WARNING · else INFO
 */
export function getActivitySeverity(
  action: string,
  result?: string | null
): ActivitySeverity {
  if (result && result !== "SUCCESS") {
    if (action.startsWith("LOGIN")) return "security";
    return "warning";
  }
  if (
    action === "LOGIN_FAIL" ||
    action === "LOGIN_LOCKED" ||
    action === "LOGIN"
  ) {
    return "security";
  }
  if (action === "PASSWORD_RESET" || action === "CRM_WIPE") {
    return "critical";
  }
  if (
    action === "PASSWORD_CHANGE" ||
    action === "WRITE_OFF" ||
    action.startsWith("RETURN_") ||
    action.startsWith("DISCOUNT_") ||
    action === "PRODUCT_DEACTIVATE" ||
    action === "USER_UPDATE"
  ) {
    return "warning";
  }
  return "info";
}

/** @deprecated use getActivitySeverity */
export function severityForActivity(params: {
  action: string;
  result?: string | null;
}): ActivitySeverity {
  return getActivitySeverity(params.action, params.result);
}
