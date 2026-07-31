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
  WRITE_OFF: "actions.writeOff",
  EXPENSE_CREATE: "actions.expenseCreate",
  CATEGORY_CREATE: "actions.categoryCreate",
  BRAND_CREATE: "actions.brandCreate",
  SUPPLIER_CREATE: "actions.supplierCreate",
  SUPPLIER_UPDATE: "actions.supplierUpdate",
  PRICE_CHANGE: "actions.priceChange",
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
  WriteOff: "entities.writeOff",
  Expense: "entities.expense",
  Category: "entities.category",
  Brand: "entities.brand",
  Supplier: "entities.supplier",
};

export const SALE_STATUS_KEYS: Record<string, string> = {
  COMPLETED: "saleStatus.COMPLETED",
  RETURNED: "saleStatus.RETURNED",
  CANCELLED: "saleStatus.CANCELLED",
  PENDING: "saleStatus.PENDING",
};

export const DECISION_STATUS_KEYS: Record<string, string> = {
  PENDING: "decisionStatus.PENDING",
  APPROVED: "decisionStatus.APPROVED",
  REJECTED: "decisionStatus.REJECTED",
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
  return key ? t(key) : action;
}

export function labelEntity(entityType: string, t: TranslateFn): string {
  const key = ENTITY_KEYS[entityType];
  return key ? t(key) : entityType;
}

export function labelSaleStatus(status: string, t: TranslateFn): string {
  const key = SALE_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function labelDecisionStatus(status: string, t: TranslateFn): string {
  const key = DECISION_STATUS_KEYS[status];
  return key ? t(key) : status;
}

/** Prefer revisionPage.* keys already used by revision UI. */
export function labelRevisionStatus(status: string, t: TranslateFn): string {
  const map: Record<string, string> = {
    IN_PROGRESS: "revisionPage.statusInProgress",
    PENDING_APPROVAL: "revisionPage.statusPendingApproval",
    APPROVED: "revisionPage.statusApproved",
    COMPLETED: "revisionPage.statusApproved",
  };
  const key = map[status];
  return key ? t(key) : status;
}

/** DB stores canonical RU names; UI always goes through i18n. */
export const PRODUCT_TYPE_KEYS: Record<string, string> = {
  Парфюм: "productTypes.perfume",
  "Масляные духи": "productTypes.oilPerfume",
  Дезодорант: "productTypes.deodorant",
  "Освежитель воздуха": "productTypes.airFreshener",
  Часы: "productTypes.watches",
  Аксессуары: "productTypes.accessories",
  Подарки: "productTypes.gifts",
  Другое: "productTypes.other",
};

export function labelProductType(
  name: string | null | undefined,
  t: TranslateFn
): string {
  if (!name) return "—";
  const key = PRODUCT_TYPE_KEYS[name];
  return key ? t(key) : name;
}

/** Map API error codes to i18n keys under errors.* */
export function apiErrorMessage(
  code: string | undefined,
  t: TranslateFn,
  fallbackKey = "common.error"
): string {
  if (!code) return t(fallbackKey);
  const key = `errors.${code}`;
  const translated = t(key);
  return translated === key ? t(fallbackKey) : translated;
}

/** title field may store an i18n key (e.g. notif.discountRequest). */
export function resolveNotifTitle(
  title: string | null | undefined,
  titleKey: string | null | undefined,
  t: TranslateFn
): string {
  const key = titleKey || (title && /^[a-zA-Z][\w.]*$/.test(title) ? title : null);
  if (key) {
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return title ?? "";
}
