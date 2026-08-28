import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

/** Qualifying sale statuses for revenue / COGS analytics. */
export const COMPLETED_SALE_STATUSES = ["COMPLETED", "PARTIAL_RETURN"] as const;

export type SaleItemMetricsInput = {
  id?: string;
  quantity: { toNumber?: () => number } | number | string;
  salePrice?: { toNumber?: () => number } | number | string;
  costPerUnit: { toNumber?: () => number } | number | string;
  isGift?: boolean;
};

export type SaleMetricsInput = {
  id?: string;
  total: { toNumber?: () => number } | number | string;
  subtotal?: { toNumber?: () => number } | number | string;
  discountAmount?: { toNumber?: () => number } | number | string;
  items: SaleItemMetricsInput[];
};

/** @deprecated alias */
type SaleLike = SaleMetricsInput;

export type ReturnLineAdj = {
  saleId: string;
  quantity: { toNumber?: () => number } | number | string;
  salePrice: { toNumber?: () => number } | number | string;
  costPerUnit: { toNumber?: () => number } | number | string;
  saleItemId?: string;
};

export type SaleFinancialIssue =
  | "DISCOUNT_EXCEEDS_SUBTOTAL"
  | "NEGATIVE_SALE_TOTAL"
  | "SALE_TOTAL_MISMATCH"
  | "SALE_SUBTOTAL_MISMATCH"
  | "NEGATIVE_COST"
  | "PHANTOM_COGS_MATCHES_SALE_TOTAL"
  | "COGS_EXCEEDS_SUBTOTAL"
  | "COGS_DOUBLE_COUNT_PATTERN";

export function saleItemCogs(item: SaleItemMetricsInput): number {
  if (item.isGift) return 0;
  return decimalToNumber(item.costPerUnit) * decimalToNumber(item.quantity);
}

export function saleItemGrossLine(item: SaleItemMetricsInput): number {
  if (item.isGift) return 0;
  return decimalToNumber(item.salePrice ?? 0) * decimalToNumber(item.quantity);
}

/** Pre-discount subtotal from frozen SaleItem prices. */
export function saleSubtotalFromItems(sale: SaleMetricsInput): number {
  return sale.items.reduce((s, it) => s + saleItemGrossLine(it), 0);
}

/**
 * Post-discount share of list price (1.0 when no sale-level discount).
 * Used to allocate revenue to lines and net return adjustments.
 */
export function saleNetPriceRatio(sale: SaleMetricsInput): number {
  const sub =
    sale.subtotal != null
      ? decimalToNumber(sale.subtotal)
      : saleSubtotalFromItems(sale);
  if (sub <= 0) return 1;
  return decimalToNumber(sale.total) / sub;
}

export function saleItemNetRevenue(
  item: SaleItemMetricsInput,
  netRatio: number
): number {
  return saleItemGrossLine(item) * netRatio;
}

export function saleCogsFromItems(items: SaleItemMetricsInput[]): number {
  return items.reduce((s, it) => s + saleItemCogs(it), 0);
}

/**
 * Detect data patterns that inflate COGS without changing revenue.
 * Production symptom: gross ≈ −COGS while revenue matches history when
 * phantom rows carry costPerUnit × qty ≈ sale.total per receipt.
 */
export function detectSaleFinancialIssues(
  sale: SaleMetricsInput
): SaleFinancialIssue[] {
  const issues: SaleFinancialIssue[] = [];
  const sub =
    sale.subtotal != null
      ? decimalToNumber(sale.subtotal)
      : saleSubtotalFromItems(sale);
  const discount =
    sale.discountAmount != null ? decimalToNumber(sale.discountAmount) : 0;
  const total = decimalToNumber(sale.total);

  if (discount > sub + 1e-6) issues.push("DISCOUNT_EXCEEDS_SUBTOTAL");
  if (total < -1e-6) issues.push("NEGATIVE_SALE_TOTAL");
  if (Math.abs(total - (sub - discount)) > 0.02) {
    issues.push("SALE_TOTAL_MISMATCH");
  }
  if (sale.subtotal != null) {
    const itemSub = saleSubtotalFromItems(sale);
    if (Math.abs(itemSub - sub) > 0.05) issues.push("SALE_SUBTOTAL_MISMATCH");
  }

  const cogs = saleCogsFromItems(sale.items);
  if (cogs > sub + 0.02) issues.push("COGS_EXCEEDS_SUBTOTAL");

  for (const it of sale.items) {
    if (it.isGift) continue;
    if (decimalToNumber(it.costPerUnit) < 0) issues.push("NEGATIVE_COST");
    const lineCogs = saleItemCogs(it);
    if (total > 0 && Math.abs(lineCogs - total) < 0.02) {
      issues.push("PHANTOM_COGS_MATCHES_SALE_TOTAL");
    }
  }

  const phantomLike = sale.items.some(
    (it) =>
      !it.isGift && total > 0 && Math.abs(saleItemCogs(it) - total) < 0.02
  );
  if (phantomLike && cogs > total) {
    issues.push("COGS_DOUBLE_COUNT_PATTERN");
  }

  return [...new Set(issues)];
}

/** Throws on hard invariant violations at sale commit time. */
export function assertSaleFinancialInvariants(sale: SaleMetricsInput): void {
  const issues = detectSaleFinancialIssues(sale);
  const hard: SaleFinancialIssue[] = [
    "DISCOUNT_EXCEEDS_SUBTOTAL",
    "NEGATIVE_SALE_TOTAL",
    "SALE_TOTAL_MISMATCH",
    "SALE_SUBTOTAL_MISMATCH",
    "NEGATIVE_COST",
    "PHANTOM_COGS_MATCHES_SALE_TOTAL",
  ];
  for (const code of issues) {
    if (hard.includes(code)) {
      throw new Error(code);
    }
  }
}

function netReturnUnitRevenue(
  sale: SaleMetricsInput | undefined,
  unitListPrice: number
): number {
  if (!sale) return unitListPrice;
  return unitListPrice * saleNetPriceRatio(sale);
}

/** Gross profit = revenue − COGS (from FIFO-frozen SaleItem costs). */
export function saleGrossMetrics(sales: SaleLike[]) {
  const revenue = sales.reduce((s, sale) => s + decimalToNumber(sale.total), 0);
  const cost = sales.reduce(
    (s, sale) => s + saleCogsFromItems(sale.items),
    0
  );
  const itemsSold = sales.reduce(
    (s, sale) =>
      s +
      sale.items.reduce((a, it) => {
        if (it.isGift) return a;
        return a + decimalToNumber(it.quantity);
      }, 0),
    0
  );
  const count = sales.length;
  const grossProfit = revenue - cost;
  const avgCheck = count ? revenue / count : 0;
  return {
    revenue,
    cost,
    cogs: cost,
    grossProfit,
    profit: grossProfit,
    count,
    itemsSold,
    avgCheck,
  };
}

function applyReturnAdjustments(
  base: ReturnType<typeof saleGrossMetrics>,
  retItems: ReturnLineAdj[],
  sales: SaleLike[]
) {
  const saleIds = new Set(sales.map((s) => s.id).filter(Boolean) as string[]);
  const saleById = new Map(
    sales
      .filter((s): s is SaleLike & { id: string } => Boolean(s.id))
      .map((s) => [s.id, s])
  );

  let revOut = 0;
  let costOut = 0;
  let qtyOut = 0;
  for (const r of retItems) {
    if (!saleIds.has(r.saleId)) continue;
    const qty = decimalToNumber(r.quantity);
    const sale = saleById.get(r.saleId);
    revOut +=
      netReturnUnitRevenue(sale, decimalToNumber(r.salePrice)) * qty;
    costOut += decimalToNumber(r.costPerUnit) * qty;
    qtyOut += qty;
  }
  if (revOut === 0 && costOut === 0) return base;

  const revenue = Math.round((base.revenue - revOut) * 100) / 100;
  const cost = Math.round((base.cost - costOut) * 100) / 100;
  const itemsSold = Math.round((base.itemsSold - qtyOut) * 1000) / 1000;
  const grossProfit = Math.round((revenue - cost) * 100) / 100;
  return {
    revenue,
    cost,
    cogs: cost,
    grossProfit,
    profit: grossProfit,
    count: base.count,
    itemsSold,
    avgCheck: base.count ? revenue / base.count : 0,
  };
}

/** Load approved return lines for given sales (1 query). */
export async function loadApprovedReturnLines(
  saleIds: string[]
): Promise<ReturnLineAdj[]> {
  if (!saleIds.length) return [];
  const rows = await prisma.saleReturnItem.findMany({
    where: {
      return: { saleId: { in: saleIds }, status: "APPROVED" },
    },
    select: {
      saleItemId: true,
      quantity: true,
      salePrice: true,
      costPerUnit: true,
      return: { select: { saleId: true } },
    },
  });
  return rows.map((r) => ({
    saleId: r.return.saleId,
    saleItemId: r.saleItemId,
    quantity: r.quantity,
    salePrice: r.salePrice,
    costPerUnit: r.costPerUnit,
  }));
}

/**
 * Gross metrics minus APPROVED return lines.
 * Pass `preloadedReturns` to avoid N+1 when calling per-store/per-sale.
 */
export async function saleGrossMetricsNetOfReturns(
  sales: SaleLike[],
  preloadedReturns?: ReturnLineAdj[]
) {
  const base = saleGrossMetrics(sales);
  const saleIds = sales.map((s) => s.id).filter(Boolean) as string[];
  if (!saleIds.length) return base;

  const retItems =
    preloadedReturns ?? (await loadApprovedReturnLines(saleIds));
  return applyReturnAdjustments(base, retItems, sales);
}

/** Sync version when returns already loaded. */
export function saleGrossMetricsNetOfReturnsSync(
  sales: SaleLike[],
  preloadedReturns: ReturnLineAdj[]
) {
  const base = saleGrossMetrics(sales);
  const saleIds = sales.map((s) => s.id).filter(Boolean) as string[];
  if (!saleIds.length) return base;
  return applyReturnAdjustments(base, preloadedReturns, sales);
}

export function withNetProfit<T extends { grossProfit: number }>(
  metrics: T,
  expensesAllocated: number
) {
  const expenses = Math.round(expensesAllocated * 100) / 100;
  const netProfit = Math.round((metrics.grossProfit - expenses) * 100) / 100;
  return {
    ...metrics,
    expenses,
    netProfit,
    profit: netProfit,
  };
}

export type ProfitHealth = "OK" | "VALID_NEGATIVE" | "DATA_INTEGRITY_ANOMALY";

const INTEGRITY_ISSUES: SaleFinancialIssue[] = [
  "PHANTOM_COGS_MATCHES_SALE_TOTAL",
  "COGS_DOUBLE_COUNT_PATTERN",
  "COGS_EXCEEDS_SUBTOTAL",
  "SALE_TOTAL_MISMATCH",
  "SALE_SUBTOTAL_MISMATCH",
];

/** Distinguish legitimate loss from corrupted financial data. */
export function classifyStoreProfitHealth(params: {
  revenue: number;
  cogs: number;
  grossProfit: number;
  sales: SaleMetricsInput[];
}): {
  health: ProfitHealth;
  anomalies: Array<{ saleId?: string; issues: SaleFinancialIssue[] }>;
} {
  const anomalies: Array<{ saleId?: string; issues: SaleFinancialIssue[] }> =
    [];
  for (const sale of params.sales) {
    const issues = detectSaleFinancialIssues(sale);
    const critical = issues.filter((i) => INTEGRITY_ISSUES.includes(i));
    if (critical.length) {
      anomalies.push({
        saleId: "id" in sale ? String(sale.id) : undefined,
        issues: critical,
      });
    }
  }
  if (anomalies.length) {
    return { health: "DATA_INTEGRITY_ANOMALY", anomalies };
  }
  if (params.grossProfit < -0.01) {
    return { health: "VALID_NEGATIVE", anomalies: [] };
  }
  return { health: "OK", anomalies: [] };
}
