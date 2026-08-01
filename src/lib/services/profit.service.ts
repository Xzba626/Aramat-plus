import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

type SaleLike = {
  id?: string;
  total: { toNumber?: () => number } | number | string;
  items: Array<{
    id?: string;
    quantity: { toNumber?: () => number } | number | string;
    costPerUnit: { toNumber?: () => number } | number | string;
    isGift?: boolean;
  }>;
};

export type ReturnLineAdj = {
  saleId: string;
  quantity: { toNumber?: () => number } | number | string;
  salePrice: { toNumber?: () => number } | number | string;
  costPerUnit: { toNumber?: () => number } | number | string;
  saleItemId?: string;
};

/** Gross profit = revenue − COGS (from FIFO-frozen SaleItem costs). */
export function saleGrossMetrics(sales: SaleLike[]) {
  const revenue = sales.reduce((s, sale) => s + decimalToNumber(sale.total), 0);
  const cost = sales.reduce(
    (s, sale) =>
      s +
      sale.items.reduce((a, it) => {
        if (it.isGift) return a;
        return (
          a + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity)
        );
      }, 0),
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
  saleIds: Set<string>
) {
  let revOut = 0;
  let costOut = 0;
  let qtyOut = 0;
  for (const r of retItems) {
    if (!saleIds.has(r.saleId)) continue;
    const qty = decimalToNumber(r.quantity);
    revOut += decimalToNumber(r.salePrice) * qty;
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
  return applyReturnAdjustments(base, retItems, new Set(saleIds));
}

/** Sync version when returns already loaded. */
export function saleGrossMetricsNetOfReturnsSync(
  sales: SaleLike[],
  preloadedReturns: ReturnLineAdj[]
) {
  const base = saleGrossMetrics(sales);
  const saleIds = sales.map((s) => s.id).filter(Boolean) as string[];
  if (!saleIds.length) return base;
  return applyReturnAdjustments(base, preloadedReturns, new Set(saleIds));
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
