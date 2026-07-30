/** Human-readable labels for enums / activity codes — never show raw DB values in UI. */

export const ROLE_KEYS = {
  OWNER: "roles.owner",
  MANAGER: "roles.manager",
  SELLER: "roles.seller",
} as const;

export const STORE_STATUS_KEYS = {
  ACTIVE: "status.active",
  CLOSED: "status.closed",
  INVENTORY: "status.inventory",
  ARCHIVED: "status.archived",
} as const;

export const ACTION_KEYS: Record<string, string> = {
  SALE_CREATE: "actions.saleCreate",
  BATCH_CREATE: "actions.batchCreate",
  TRANSFER_CREATE: "actions.transferCreate",
  WAREHOUSE_RETURN_IN: "actions.warehouseReturn",
  PRODUCT_CREATE: "actions.productCreate",
  PRODUCT_UPDATE: "actions.productUpdate",
  DISCOUNT_REQUEST: "actions.discountRequest",
  DISCOUNT_APPROVE: "actions.discountApprove",
  DISCOUNT_REJECT: "actions.discountReject",
  RETURN_REQUEST: "actions.returnRequest",
  RETURN_APPROVE: "actions.returnApprove",
  RETURN_REJECT: "actions.returnReject",
  LOGIN: "actions.login",
  PASSWORD_RESET: "actions.passwordReset",
  USER_CREATE: "actions.userCreate",
};

export const ENTITY_KEYS: Record<string, string> = {
  Sale: "entities.sale",
  Batch: "entities.batch",
  Transfer: "entities.transfer",
  Product: "entities.product",
  User: "entities.user",
  Store: "entities.store",
  Warehouse: "entities.warehouse",
  DiscountRequest: "entities.discount",
  SaleReturn: "entities.return",
};

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function labelRole(role: string | null | undefined, t: TranslateFn): string {
  if (!role) return "—";
  const key = ROLE_KEYS[role as keyof typeof ROLE_KEYS];
  return key ? t(key) : role;
}

export function labelStoreStatus(
  status: string,
  t: TranslateFn,
  isArchived?: boolean
): string {
  if (isArchived) return t(STORE_STATUS_KEYS.ARCHIVED);
  const key = STORE_STATUS_KEYS[status as keyof typeof STORE_STATUS_KEYS];
  return key ? t(key) : status;
}

export function labelAction(action: string, t: TranslateFn): string {
  const key = ACTION_KEYS[action];
  return key ? t(key) : action.replace(/_/g, " ").toLowerCase();
}

export function labelEntity(entityType: string, t: TranslateFn): string {
  const key = ENTITY_KEYS[entityType];
  return key ? t(key) : entityType;
}
