/**
 * Manager finance visibility (Option A):
 * Manager may see revenue / counts / ops volume — not COGS, margin, or profit.
 */
import type { SessionUser } from "@/lib/rbac";
import { canViewWarehouseFinance } from "@/lib/rbac";

/** True when the session may see COGS / margin / net profit. */
export function canViewOwnerFinance(user: SessionUser): boolean {
  return canViewWarehouseFinance(user);
}

type AnyRecord = Record<string, unknown>;

function scrubMoneyKeys(obj: AnyRecord, keys: string[]) {
  for (const k of keys) {
    if (k in obj) delete obj[k];
  }
}

const FINANCE_KEYS = [
  "cogs",
  "cost",
  "grossProfit",
  "profit",
  "netProfit",
  "packagingCost",
  "netFromLayers",
  "storesNetSum",
  "storesNetMatchesNetwork",
] as const;

/**
 * Deep-scrub dashboard / analytics payloads for Manager.
 * Mutates a shallow clone — call with JSON-serializable data.
 */
export function stripFinanceForRole<T>(user: SessionUser, data: T): T {
  if (canViewOwnerFinance(user)) return data;
  return stripFinanceDeep(data) as T;
}

function stripFinanceDeep(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map(stripFinanceDeep);
  }
  if (typeof value !== "object") return value;
  const src = value as AnyRecord;
  const out: AnyRecord = { ...src };
  scrubMoneyKeys(out, [...FINANCE_KEYS]);
  // Nested yesterday / deltas / stores / network / byProduct etc.
  for (const [k, v] of Object.entries(out)) {
    if (v && typeof v === "object") {
      out[k] = stripFinanceDeep(v);
    }
  }
  // Deltas that only exist for profit metrics
  if (out.deltas && typeof out.deltas === "object") {
    const d = { ...(out.deltas as AnyRecord) };
    scrubMoneyKeys(d, ["profit", "netProfit", "grossProfit"]);
    out.deltas = d;
  }
  return out;
}
