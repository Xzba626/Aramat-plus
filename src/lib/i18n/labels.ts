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
  INITIAL_STORE_STOCK: "actions.initialStoreStock",
  STORE_TRANSFER_CREATE: "actions.storeTransferCreate",
  WAREHOUSE_RETURN_IN: "actions.warehouseReturn",
  PRODUCT_CREATE: "actions.productCreate",
  PRODUCT_UPDATE: "actions.productUpdate",
  PRODUCT_DEACTIVATE: "actions.productDeactivate",
  DISCOUNT_REQUEST: "actions.discountRequest",
  DISCOUNT_APPROVE: "actions.discountApprove",
  DISCOUNT_REJECT: "actions.discountReject",
  RETURN_REQUEST: "actions.returnRequest",
  RETURN_APPROVE: "actions.returnApprove",
  RETURN_REJECT: "actions.returnReject",
  LOGIN: "actions.login",
  LOGIN_FAIL: "actions.loginFail",
  LOGIN_LOCKED: "actions.loginLocked",
  PASSWORD_RESET: "actions.passwordReset",
  PASSWORD_CHANGE: "actions.passwordChange",
  USER_CREATE: "actions.userCreate",
  USER_UPDATE: "actions.userUpdate",
  WRITE_OFF: "actions.writeOff",
  EXPENSE_CREATE: "actions.expenseCreate",
  CATEGORY_CREATE: "actions.categoryCreate",
  CATEGORY_ARCHIVE: "actions.categoryArchive",
  CATEGORY_RESTORE: "actions.categoryRestore",
  CATEGORY_DELETE: "actions.categoryDelete",
  BRAND_CREATE: "actions.brandCreate",
  BRAND_UPDATE: "actions.brandUpdate",
  BRAND_ARCHIVE: "actions.brandArchive",
  BRAND_RESTORE: "actions.brandRestore",
  SUPPLIER_CREATE: "actions.supplierCreate",
  SUPPLIER_UPDATE: "actions.supplierUpdate",
  SUPPLIER_DEACTIVATE: "actions.supplierDeactivate",
  SUPPLIER_RESTORE: "actions.supplierRestore",
  PACKAGING_SKU_CREATE: "actions.packagingSkuCreate",
  PACKAGING_SKU_UPDATE: "actions.packagingSkuUpdate",
  PRICE_CHANGE: "actions.priceChange",
  COST_CHANGE: "actions.costChange",
  RESERVATION_CREATE: "actions.reservationCreate",
  RESERVATION_CANCEL: "actions.reservationCancel",
  RESERVATION_COMPLETE: "actions.reservationComplete",
  RESERVATION_EXPIRE: "actions.reservationExpire",
  REVISION_CREATE: "actions.revisionCreate",
  REVISION_COUNT: "actions.revisionCount",
  REVISION_APPROVE: "actions.revisionApprove",
  REVISION_CANCEL: "actions.revisionCancel",
  STORE_CREATE: "actions.storeCreate",
  STORE_UPDATE: "actions.storeUpdate",
  COMPANY_UPDATE: "actions.companyUpdate",
  UNIT_CREATE: "actions.unitCreate",
  CRM_WIPE: "actions.crmWipe",
};

export const ACTION_COMMENT_KEYS: Record<string, string> = {
  "cart cleared": "actionComments.cartCleared",
  bad_password: "actionComments.badPassword",
  unknown_or_inactive: "actionComments.unknownOrInactive",
  account_locked: "actionComments.accountLocked",
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
  PackagingSku: "entities.packagingSku",
  Reservation: "entities.reservation",
  InventorySession: "entities.inventorySession",
  Company: "entities.company",
  Unit: "entities.unit",
};

export const EXPENSE_PERIODICITY_KEYS: Record<string, string> = {
  ONCE: "storeDetail.periodOnce",
  DAILY: "storeDetail.periodDaily",
  WEEKLY: "storeDetail.periodWeekly",
  MONTHLY: "storeDetail.periodMonthly",
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

export const WRITE_OFF_REASON_KEYS: Record<string, string> = {
  SPOILED: "writeOffReason.SPOILED",
  BROKEN: "writeOffReason.BROKEN",
  TESTER: "writeOffReason.TESTER",
  STOLEN: "writeOffReason.STOLEN",
  LOSS: "writeOffReason.LOSS",
  EXPIRED: "writeOffReason.EXPIRED",
  OTHER: "writeOffReason.OTHER",
};

export const RETURN_REASON_KEYS: Record<string, string> = {
  DEFECT: "returnReason.DEFECT",
  SELLER_ERROR: "returnReason.SELLER_ERROR",
  CUSTOMER_ERROR: "returnReason.CUSTOMER_ERROR",
  EXPIRED: "returnReason.EXPIRED",
  DAMAGED: "returnReason.DAMAGED",
  OTHER: "returnReason.OTHER",
};

/** Stable batch.notes markers written by the system (never English prose). */
export const BATCH_NOTE_MARKERS = {
  INITIAL_STOCK: "INITIAL_STOCK",
  INITIAL_STORE_STOCK: "INITIAL_STORE_STOCK",
  PACKAGING_RECEIVE: "PACKAGING_RECEIVE",
  PACKAGING_TRANSFER: "PACKAGING_TRANSFER",
} as const;

const BATCH_NOTE_KEYS: Record<string, string> = {
  INITIAL_STOCK: "warehouse.notesInitialStock",
  "Initial stock": "warehouse.notesInitialStock",
  INITIAL_STORE_STOCK: "warehouse.notesInitialStoreStock",
  PACKAGING_RECEIVE: "warehouse.notesPackagingReceive",
  "packaging receive": "warehouse.notesPackagingReceive",
  PACKAGING_TRANSFER: "warehouse.notesTransfer",
  "packaging transfer": "warehouse.notesTransfer",
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

export function labelActionComment(
  comment: string | null | undefined,
  t: TranslateFn
): string | null {
  if (!comment) return null;
  const key = ACTION_COMMENT_KEYS[comment];
  if (key) return t(key);
  // Legacy lock messages from auth: lock:60000ms / locked_until:ISO
  if (comment.startsWith("lock:") || comment.startsWith("locked_until:")) {
    return t("actionComments.accountLocked");
  }
  return comment;
}

/** Actor line for activity feeds — never blame the account owner for failed logins. */
export function labelActivityActor(
  log: {
    action: string;
    userName?: string | null;
    role?: string | null;
    email?: string | null;
    metadata?: { email?: string | null } | null;
  },
  t: TranslateFn
): string {
  const email =
    log.email?.trim() ||
    (typeof log.metadata?.email === "string" ? log.metadata.email.trim() : "") ||
    "";
  if (log.action === "LOGIN_FAIL" || log.action === "LOGIN_LOCKED") {
    return email
      ? t("dashboard.loginAttempt", { email })
      : t("dashboard.loginAttemptUnknown");
  }
  const name = log.userName?.trim() || t("dashboard.systemUser");
  if (log.role) return `${name} · ${labelRole(log.role, t)}`;
  return name;
}

export function labelEntity(entityType: string, t: TranslateFn): string {
  const key = ENTITY_KEYS[entityType];
  return key ? t(key) : entityType;
}

export function labelExpensePeriodicity(
  periodicity: string | null | undefined,
  t: TranslateFn
): string {
  if (!periodicity) return t(EXPENSE_PERIODICITY_KEYS.ONCE);
  const key = EXPENSE_PERIODICITY_KEYS[periodicity];
  return key ? t(key) : periodicity;
}

/**
 * Human-readable expense description for UI and exports.
 * Maps AUTO_BOTTLE / legacy sale:<cuid> markers — never show raw tech tokens.
 */
export function formatExpenseDescription(
  description: string | null | undefined,
  t: TranslateFn
): string {
  const raw = (description ?? "").trim();
  if (!raw) return "";

  if (raw === "AUTO_BOTTLE") {
    return t("exportCsv.expenseBottleSale");
  }
  const autoNamed = raw.match(/^AUTO_BOTTLE\|(.+)$/);
  if (autoNamed) {
    return t("exportCsv.expenseBottleSaleNamed", { name: autoNamed[1].trim() });
  }

  const legacy = raw.match(/^sale:[a-z0-9]+(?:\s*[·•|]\s*(.+))?$/i);
  if (legacy) {
    const name = legacy[1]?.trim();
    return name
      ? t("exportCsv.expenseBottleSaleNamed", { name })
      : t("exportCsv.expenseBottleSale");
  }

  if (/sale:[a-z0-9]{8,}/i.test(raw)) {
    const cleaned = raw
      .replace(/sale:[a-z0-9]+/gi, "")
      .replace(/^[·•|\-\s]+|[·•|\-\s]+$/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return cleaned
      ? t("exportCsv.expenseBottleSaleNamed", { name: cleaned })
      : t("exportCsv.expenseBottleSale");
  }

  return raw;
}

export function labelSaleStatus(status: string, t: TranslateFn): string {
  const key = SALE_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function labelDecisionStatus(status: string, t: TranslateFn): string {
  const key = DECISION_STATUS_KEYS[status];
  return key ? t(key) : status;
}

export function labelWriteOffReason(
  code: string | null | undefined,
  t: TranslateFn
): string {
  if (!code) return "—";
  const key = WRITE_OFF_REASON_KEYS[code];
  return key ? t(key) : code;
}

export function labelReturnReason(
  code: string | null | undefined,
  t: TranslateFn
): string {
  if (!code) return "—";
  const key = RETURN_REASON_KEYS[code];
  return key ? t(key) : code;
}

/**
 * Human batch / receipt notes. Maps system markers + legacy English strings.
 * Tech transfer/return ids stay as structured short labels, not raw cuid dumps.
 */
export function labelBatchNotes(
  notes: string | null | undefined,
  t: TranslateFn
): string {
  if (!notes?.trim()) return "";
  const raw = notes.trim();
  const direct = BATCH_NOTE_KEYS[raw];
  if (direct) return t(direct);

  if (/^transfer:/i.test(raw)) return t("warehouse.notesTransfer");
  if (/^INITIAL_STORE_STOCK(?::|$)/i.test(raw)) {
    return t("warehouse.notesInitialStoreStock");
  }
  if (/^store_transfer:/i.test(raw)) return t("warehouse.notesStoreTransfer");
  if (/^warehouse_return:/i.test(raw)) return t("warehouse.notesWarehouseReturn");
  if (/^sale_return:/i.test(raw)) return t("warehouse.notesSaleReturn");
  if (/^revision:/i.test(raw)) return t("warehouse.notesRevision");

  return raw;
}

/** Deep-link from ActivityLog / notifications into a working screen. */
export function entityHref(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
  action?: string | null
): string | null {
  if (action === "DISCOUNT_REQUEST" || entityType === "DiscountRequest") {
    return "/discounts";
  }
  if (action === "RETURN_REQUEST" || entityType === "SaleReturn") {
    return entityId ? `/returns` : "/returns";
  }
  if (!entityType) return null;
  switch (entityType) {
    case "Product":
      return entityId ? `/warehouse/${entityId}` : "/warehouse/products";
    case "Store":
      return entityId ? `/stores/${entityId}` : "/stores";
    case "Sale":
      return "/analytics?view=network";
    case "Transfer":
      return "/warehouse/transfers";
    case "Batch":
      return "/warehouse/batches";
    case "WriteOff":
      return "/warehouse/write-offs";
    case "Expense":
      return "/analytics?view=expenses";
    case "User":
      return "/users";
    case "Supplier":
      return "/warehouse/suppliers";
    case "InventorySession":
      return "/revision";
    case "Reservation":
      return "/reservations";
    default:
      return null;
  }
}

/** Prefer revisionPage.* keys already used by revision UI. */
export function labelRevisionStatus(status: string, t: TranslateFn): string {
  const map: Record<string, string> = {
    IN_PROGRESS: "revisionPage.statusInProgress",
    PENDING_APPROVAL: "revisionPage.statusPendingApproval",
    APPROVED: "revisionPage.statusApproved",
    COMPLETED: "revisionPage.statusApproved",
    CANCELLED: "revisionPage.statusCancelled",
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
