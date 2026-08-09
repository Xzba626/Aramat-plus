/**
 * Manager / Seller finance visibility (Option A):
 * May see revenue / counts / ops volume — not COGS, margin, or profit.
 *
 * Scrub is deep and key-pattern based so prefixed KPIs
 * (todayCogs, stockCost, monthProfit, …) cannot bypass an exact-name list.
 */
import type { SessionUser } from "@/lib/rbac";
import { canViewWarehouseFinance } from "@/lib/rbac";

/** True when the session may see COGS / margin / net profit. */
export function canViewOwnerFinance(user: SessionUser): boolean {
  return canViewWarehouseFinance(user);
}

type AnyRecord = Record<string, unknown>;

/** Exact names always scrubbed (defense in depth). */
const FINANCE_KEYS_EXACT = new Set(
  [
    "cogs",
    "cost",
    "costPerUnit",
    "packagingCostPerUnit",
    "defaultCostPerUnit",
    "defaultCost",
    "grossProfit",
    "profit",
    "netProfit",
    "packagingCost",
    "netFromLayers",
    "storesNetSum",
    "storesNetMatchesNetwork",
    "stockCost",
    "totalCost",
    "todayCogs",
    "todayProfit",
    "todayGrossProfit",
    "todayNetProfit",
    "monthProfit",
    "monthCogs",
    "monthGrossProfit",
    "monthNetProfit",
    "margin",
    "grossMargin",
    "netMargin",
  ].map((k) => k.toLowerCase())
);

/**
 * True if this object key is a finance/COGS/profit field.
 * Keeps revenue / counts (todayRevenue, todaySalesCount, unitsTotal, …).
 */
export function isFinanceFieldKey(key: string): boolean {
  const n = key.toLowerCase();
  if (FINANCE_KEYS_EXACT.has(n)) return true;
  if (n.includes("cogs")) return true;
  if (n.includes("profit")) return true;
  if (n.includes("margin") && !n.includes("image")) return true;
  if (n.includes("costperunit")) return true;
  if (n.includes("defaultcost")) return true;
  if (n.includes("packagingcost")) return true;
  // stockCost, totalCost, purchaseCost — not "lowCostFlag"-style ops names
  if (n === "cost" || n.endsWith("cost")) return true;
  return false;
}

/**
 * Deep-scrub dashboard / analytics / sale payloads for non-owner-finance roles.
 */
export function stripFinanceForRole<T>(user: SessionUser, data: T): T {
  if (canViewOwnerFinance(user)) return data;
  return stripFinanceDeep(data) as T;
}

/** Scrub without a session (e.g. after role already known as non-owner). */
export function stripFinanceData<T>(data: T): T {
  return stripFinanceDeep(data) as T;
}

function stripFinanceDeep(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map(stripFinanceDeep);
  }
  if (typeof value !== "object") return value;

  // Prisma Decimal / Date — leave as-is (no finance keys inside)
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name;
  if (ctor === "Decimal" || ctor === "Date" || value instanceof Date) {
    return value;
  }

  const src = value as AnyRecord;
  const out: AnyRecord = {};
  for (const [k, v] of Object.entries(src)) {
    if (isFinanceFieldKey(k)) continue;
    if (v && typeof v === "object") {
      out[k] = stripFinanceDeep(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
