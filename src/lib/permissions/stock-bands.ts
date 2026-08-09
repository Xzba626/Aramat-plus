import type { AccountingType, LocationType } from "@prisma/client";
import {
  resolveStockStatus,
  type LowStockThresholds,
  thresholdForProduct,
} from "@/lib/services/low-stock-thresholds.service";

/** Operational stock band for MANAGER (no exact quantity). */
export type StockBand = "OUT_OF_STOCK" | "VERY_LOW" | "LOW" | "NORMAL";

export function quantityToStockBand(params: {
  quantity: number;
  accountingType: AccountingType | string | null | undefined;
  locationType: LocationType | "WAREHOUSE" | "STORE";
  thresholds: LowStockThresholds;
}): StockBand {
  const qty = params.quantity;
  const status = resolveStockStatus(params);
  if (status === "OUT" || !(qty > 0)) return "OUT_OF_STOCK";
  if (status === "OK") return "NORMAL";

  const threshold = thresholdForProduct({
    accountingType: params.accountingType,
    locationType: params.locationType,
    thresholds: params.thresholds,
  });
  if (threshold > 0 && qty <= threshold * 0.5) return "VERY_LOW";
  return "LOW";
}

/** Strip numeric qty fields from a stock row for MANAGER responses. */
export function toManagerStockRow<T extends Record<string, unknown>>(row: T): Omit<
  T,
  "quantity" | "physicalQty" | "reservedQty" | "minStock"
> & { band: StockBand; needsAttention: boolean } {
  const quantity = Number(row.quantity ?? 0);
  const accountingType =
    (row.product as { accountingType?: string } | undefined)?.accountingType ??
    null;
  // Caller should pass band already; fallback OUT if missing thresholds path
  const band =
    (row.band as StockBand | undefined) ??
    (quantity > 0 ? "NORMAL" : "OUT_OF_STOCK");
  const {
    quantity: _q,
    physicalQty: _p,
    reservedQty: _r,
    minStock: _m,
    ...rest
  } = row as T & {
    quantity?: unknown;
    physicalQty?: unknown;
    reservedQty?: unknown;
    minStock?: unknown;
    band?: StockBand;
  };
  void _q;
  void _p;
  void _r;
  void _m;
  void accountingType;
  return {
    ...(rest as Omit<T, "quantity" | "physicalQty" | "reservedQty" | "minStock">),
    band,
    needsAttention: band !== "NORMAL",
  };
}
