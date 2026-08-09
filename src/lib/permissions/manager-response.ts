/**
 * Strip exact inventory quantities from MANAGER API payloads.
 * Transfer line quantities (sent amounts) are operational and kept
 * when parent object is clearly a transfer item — we only strip
 * known stock aggregate / balance field names.
 */
import { Role } from "@prisma/client";
import type { SessionUser } from "@/lib/rbac";

const EXACT_STOCK_KEYS = new Set(
  [
    "quantity",
    "qty",
    "physicalQty",
    "reservedQty",
    "unitsTotal",
    "exactQuantity",
    "stockQuantity",
    "availableQuantity",
    "onHand",
    "onHandQty",
    "minStock",
    "warehouseQty",
    "storeQty",
    "storeQtys",
    "systemQty",
    "expectedQty",
    "diffQty",
  ].map((k) => k.toLowerCase())
);

/** Keys that mean transfer/sale line qty — strip only at stock-shaped objects. */
function isExactStockKey(key: string): boolean {
  return EXACT_STOCK_KEYS.has(key.toLowerCase());
}

/**
 * Objects that are stock balances / catalog stock rows (not TransferItem).
 * Heuristic: has productId+quantity without transferId, or unitsTotal, or stockBalances.
 */
function stripDeep(value: unknown, ctx: { inTransferItem: boolean }): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripDeep(v, ctx));
  }
  if (typeof value !== "object") return value;

  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "Decimal" || ctor === "Date" || value instanceof Date) {
    return value;
  }

  const src = value as Record<string, unknown>;
  const isTransferRoot =
    ("toStoreId" in src && Array.isArray(src.items)) ||
    ("fromWarehouseId" in src && "toStoreId" in src);

  const inTransferItem =
    ctx.inTransferItem ||
    ("transferId" in src && "productId" in src);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (!inTransferItem && isExactStockKey(k)) {
      continue;
    }
    if (k.toLowerCase() === "unitstotal") continue;

    if (v && typeof v === "object") {
      const nextCtx = {
        inTransferItem:
          inTransferItem || (isTransferRoot && (k === "items" || k === "TransferItem")),
      };
      out[k] = stripDeep(v, nextCtx);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function stripExactStockForManager<T>(
  user: SessionUser | { role: string },
  data: T
): T {
  if (user.role !== Role.MANAGER) return data;
  return stripDeep(data, { inTransferItem: false }) as T;
}
