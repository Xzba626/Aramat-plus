/**
 * MANAGER grantable permission keys (dot.notation).
 * OWNER/ADMIN bypass — see manager-permissions.ts.
 */

export const MANAGER_PERMISSION_KEYS = [
  "stores.view",
  "stores.create",
  "stores.edit",
  "stores.stock.bands",
  "sellers.view",
  "sellers.create",
  "sellers.assign",
  "transfers.view",
  "transfers.create",
  "sales.view",
  "sales.create",
  "inventory.audit.view",
  "inventory.audit.create",
  "notifications.low_stock",
  "notifications.out_of_stock",
  "notifications.transfers",
  "notifications.discrepancy",
  "notifications.audit",
] as const;

export type ManagerPermissionKey = (typeof MANAGER_PERMISSION_KEYS)[number];

/** Keys enabled by default when a MANAGER is created / backfilled. */
export const DEFAULT_MANAGER_GRANTS: readonly ManagerPermissionKey[] = [
  "stores.view",
  "stores.stock.bands",
  "transfers.view",
  "transfers.create",
  "inventory.audit.view",
  "inventory.audit.create",
  "notifications.low_stock",
  "notifications.out_of_stock",
  "notifications.transfers",
  "notifications.discrepancy",
  "notifications.audit",
] as const;

/** Never persisted for MANAGER — rejected on PUT even if OWNER UI sends them. */
export const NEVER_GRANTABLE_KEYS = [
  "finance.view",
  "finance.manage",
  "expenses.view",
  "expenses.manage",
  "cogs.view",
  "profit.view",
  "prices.view",
  "prices.edit",
  "cost.edit",
  "products.create",
  "products.edit",
  "products.delete",
  "stock.adjust",
  "stock.view.exact",
  "warehouse.view",
  "warehouse.receive",
  "warehouse.adjust",
  "inventory.audit.approve",
  "owner.manage",
  "system.settings",
  "security.manage",
  "role.assign.owner",
  "sales.edit",
  "sales.cancel",
  "sales.delete",
  "sales.refund",
] as const;

export type NeverGrantableKey = (typeof NEVER_GRANTABLE_KEYS)[number];

export const GRANTABLE_KEY_SET = new Set<string>(MANAGER_PERMISSION_KEYS);
export const NEVER_GRANTABLE_SET = new Set<string>(NEVER_GRANTABLE_KEYS);
export const DEFAULT_GRANT_SET = new Set<string>(DEFAULT_MANAGER_GRANTS);

/** OWNER UI groups → keys (never-grantable shown disabled separately). */
export const PERMISSION_UI_GROUPS: Array<{
  id: string;
  labelKey: string;
  keys: ManagerPermissionKey[];
}> = [
  {
    id: "stores",
    labelKey: "managerPerms.groupStores",
    keys: ["stores.view", "stores.create", "stores.edit", "stores.stock.bands"],
  },
  {
    id: "sales",
    labelKey: "managerPerms.groupSales",
    keys: ["sales.view", "sales.create"],
  },
  {
    id: "transfers",
    labelKey: "managerPerms.groupTransfers",
    keys: ["transfers.view", "transfers.create"],
  },
  {
    id: "sellers",
    labelKey: "managerPerms.groupSellers",
    keys: ["sellers.view", "sellers.create", "sellers.assign"],
  },
  {
    id: "audits",
    labelKey: "managerPerms.groupAudits",
    keys: ["inventory.audit.view", "inventory.audit.create"],
  },
  {
    id: "notifications",
    labelKey: "managerPerms.groupNotifications",
    keys: [
      "notifications.low_stock",
      "notifications.out_of_stock",
      "notifications.transfers",
      "notifications.discrepancy",
      "notifications.audit",
    ],
  },
];

export function isManagerPermissionKey(key: string): key is ManagerPermissionKey {
  return GRANTABLE_KEY_SET.has(key);
}
