import { AccountingType, LocationType, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LOW_STOCK_THRESHOLDS,
  LOW_STOCK_THRESHOLDS_SETTING_KEY,
} from "@/lib/seed-defaults";
import { notifyCompanyRoles } from "@/lib/services/notification.service";

export type LowStockThresholds = {
  warehousePiece: number;
  storePiece: number;
  storeWeightMl: number;
  bottlePiece: number;
};

export type StockStatus = "OK" | "LOW" | "OUT";

function clampNonNeg(n: number, fallback: number): number {
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function parseThresholds(raw: unknown): LowStockThresholds {
  const d = DEFAULT_LOW_STOCK_THRESHOLDS;
  if (!raw || typeof raw !== "object") {
    return { ...d };
  }
  const o = raw as Record<string, unknown>;
  return {
    warehousePiece: clampNonNeg(Number(o.warehousePiece), d.warehousePiece),
    storePiece: clampNonNeg(Number(o.storePiece), d.storePiece),
    storeWeightMl: clampNonNeg(Number(o.storeWeightMl), d.storeWeightMl),
    bottlePiece: clampNonNeg(Number(o.bottlePiece), d.bottlePiece),
  };
}

export async function getLowStockThresholds(
  companyId: string
): Promise<LowStockThresholds> {
  const row = await prisma.setting.findUnique({
    where: {
      companyId_key: { companyId, key: LOW_STOCK_THRESHOLDS_SETTING_KEY },
    },
  });
  return parseThresholds(row?.value);
}

export async function setLowStockThresholds(
  companyId: string,
  input: Partial<LowStockThresholds>
): Promise<LowStockThresholds> {
  const current = await getLowStockThresholds(companyId);
  const next: LowStockThresholds = {
    warehousePiece: clampNonNeg(
      Number(input.warehousePiece ?? current.warehousePiece),
      DEFAULT_LOW_STOCK_THRESHOLDS.warehousePiece
    ),
    storePiece: clampNonNeg(
      Number(input.storePiece ?? current.storePiece),
      DEFAULT_LOW_STOCK_THRESHOLDS.storePiece
    ),
    storeWeightMl: clampNonNeg(
      Number(input.storeWeightMl ?? current.storeWeightMl),
      DEFAULT_LOW_STOCK_THRESHOLDS.storeWeightMl
    ),
    bottlePiece: clampNonNeg(
      Number(input.bottlePiece ?? current.bottlePiece),
      DEFAULT_LOW_STOCK_THRESHOLDS.bottlePiece
    ),
  };
  await prisma.setting.upsert({
    where: {
      companyId_key: { companyId, key: LOW_STOCK_THRESHOLDS_SETTING_KEY },
    },
    create: {
      companyId,
      key: LOW_STOCK_THRESHOLDS_SETTING_KEY,
      value: next,
    },
    update: { value: next },
  });
  return next;
}

/**
 * Single source of truth for card / alert stock status.
 * Does NOT use Product.minStock or Category.lowStockThreshold.
 */
export function resolveStockStatus(params: {
  quantity: number;
  accountingType: AccountingType | string | null | undefined;
  locationType: LocationType | "WAREHOUSE" | "STORE";
  thresholds: LowStockThresholds;
}): StockStatus {
  const qty = params.quantity;
  if (!(qty > 0)) return "OUT";

  const isWeight = params.accountingType === "WEIGHT";
  const loc = String(params.locationType);
  let threshold: number;
  if (isWeight) {
    threshold = params.thresholds.storeWeightMl;
  } else if (loc === "WAREHOUSE") {
    threshold = params.thresholds.warehousePiece;
  } else {
    threshold = params.thresholds.storePiece;
  }

  if (qty <= threshold) return "LOW";
  return "OK";
}

export function thresholdForProduct(params: {
  accountingType: AccountingType | string | null | undefined;
  locationType: LocationType | "WAREHOUSE" | "STORE";
  thresholds: LowStockThresholds;
}): number {
  const isWeight = params.accountingType === "WEIGHT";
  if (isWeight) return params.thresholds.storeWeightMl;
  if (String(params.locationType) === "WAREHOUSE") {
    return params.thresholds.warehousePiece;
  }
  return params.thresholds.storePiece;
}

/** Notify owner when qty is at/below threshold (same pattern as bottles). */
export async function maybeNotifyLowMerchandiseStock(params: {
  companyId: string;
  locationType: LocationType;
  locationName: string;
  productId: string;
  productName: string;
  accountingType: AccountingType | string;
  qtyAfter: number;
  thresholds?: LowStockThresholds;
  /** When set for STORE locations: respect Store.notifyLowStock toggle. */
  storeId?: string;
}) {
  if (
    String(params.locationType) === "STORE" &&
    params.storeId
  ) {
    const store = await prisma.store.findFirst({
      where: { id: params.storeId, companyId: params.companyId },
      select: { notifyLowStock: true },
    });
    if (store && !store.notifyLowStock) return;
  }

  const thresholds =
    params.thresholds ?? (await getLowStockThresholds(params.companyId));
  const status = resolveStockStatus({
    quantity: params.qtyAfter,
    accountingType: params.accountingType,
    locationType: params.locationType,
    thresholds,
  });
  if (status === "OK") return;

  const unit =
    params.accountingType === "WEIGHT" ? "мл" : "шт";
  const title =
    status === "OUT" ? "notif.outOfStock" : "notif.lowStock";
  await notifyCompanyRoles({
    companyId: params.companyId,
    type: NotificationType.LOW_STOCK,
    title,
    message: `${params.locationName}: «${params.productName}» — ${params.qtyAfter} ${unit}`,
    entityType: "Product",
    entityId: params.productId,
  });
}
