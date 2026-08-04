import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { sumAllocatedExpenses, listAllocatedExpenseItems } from "@/lib/services/expense.service";
import {
  saleGrossMetricsNetOfReturnsSync,
  withNetProfit,
  type ReturnLineAdj,
} from "@/lib/services/profit.service";
import {
  isMerchandiseProduct,
  merchandiseProductWhere,
} from "@/lib/product-kind";
import {
  getProductPerformanceCategory,
  getSalesPerformanceThresholds,
  scaleSalesPerformanceThresholds,
} from "@/lib/services/sales-performance.service";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export type AnalyticsPeriod = "today" | "week" | "month" | "year";

type ProductAgg = {
  name: string;
  sold: number;
  revenue: number;
  cogs: number;
  profit: number;
  accountingType: "PIECE" | "WEIGHT";
};

function serializeProductRow(p: ProductAgg) {
  return {
    name: p.name,
    sold: Math.round(p.sold * 1000) / 1000,
    revenue: Math.round(p.revenue * 100) / 100,
    cogs: Math.round(p.cogs * 100) / 100,
    profit: Math.round(p.profit * 100) / 100,
    accountingType: p.accountingType,
  };
}

/**
 * Inclusive period start for analytics / finance filters.
 *
 * - today  → 00:00 today … now
 * - week   → last 7 calendar days (today + 6 previous days) … now
 * - month  → 1st of current calendar month … now
 * - year   → 1 Jan of current calendar year … now
 *
 * Week is rolling 7 days (same as dashboard sparkline), NOT Mon–Sun.
 */
export function analyticsPeriodFrom(
  period: AnalyticsPeriod,
  now = new Date()
): Date {
  if (period === "today") return startOfDay(now);
  if (period === "week") {
    return startOfDay(new Date(now.getTime() - 6 * 86400000));
  }
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return monthStart(now);
}

/** @deprecated use analyticsPeriodFrom — kept name alias for callers */
function periodFrom(period: AnalyticsPeriod, now = new Date()) {
  return analyticsPeriodFrom(period, now);
}

/** Deep analytics: products, sellers, categories, types, stores, net profit. */
export async function getAnalyticsBreakdown(
  companyId: string,
  period: AnalyticsPeriod = "month",
  opts?: { storeId?: string | null }
) {
  const now = new Date();
  const from = periodFrom(period, now);
  const storeIdFilter =
    opts?.storeId === null
      ? "__none__"
      : opts?.storeId
        ? opts.storeId
        : undefined;
  const saleStoreWhere = storeIdFilter
    ? { companyId, id: storeIdFilter }
    : { companyId };

  const [sales, monthlyThresholds] = await Promise.all([
    prisma.sale.findMany({
      where: {
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
        createdAt: { gte: from, lte: now },
        store: saleStoreWhere,
      },
      include: {
        seller: { select: { id: true, name: true } },
        store: { select: { id: true, name: true, kind: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                kind: true,
                categoryId: true,
                productTypeId: true,
                accountingType: true,
                category: { select: { id: true, name: true } },
                productType: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    getSalesPerformanceThresholds(companyId),
  ]);

  const performanceThresholds = scaleSalesPerformanceThresholds({
    monthly: monthlyThresholds,
    from,
    to: now,
  });

  const expenses = await sumAllocatedExpenses({
    companyId,
    from,
    to: startOfDay(now),
    storeId: storeIdFilter,
  });

  const allReturnItems = await prisma.saleReturnItem.findMany({
    where: {
      return: {
        saleId: { in: sales.map((s) => s.id) },
        status: "APPROVED",
      },
    },
    include: { return: { select: { saleId: true } } },
  });
  const preloadedReturns: ReturnLineAdj[] = allReturnItems.map((r) => ({
    saleId: r.return.saleId,
    saleItemId: r.saleItemId,
    quantity: r.quantity,
    salePrice: r.salePrice,
    costPerUnit: r.costPerUnit,
  }));
  const retQtyBySaleItem = new Map<string, number>();
  for (const r of allReturnItems) {
    retQtyBySaleItem.set(
      r.saleItemId,
      (retQtyBySaleItem.get(r.saleItemId) ?? 0) + decimalToNumber(r.quantity)
    );
  }

  const networkGross = saleGrossMetricsNetOfReturnsSync(
    sales,
    preloadedReturns
  );
  const network = withNetProfit(networkGross, expenses.total);

  const productMap = new Map<string, ProductAgg>();
  const sellerMap = new Map<
    string,
    { name: string; store: string; checks: number; revenue: number; profit: number }
  >();
  const storeMap = new Map<
    string,
    {
      name: string;
      revenue: number;
      cogs: number;
      grossProfit: number;
      checks: number;
    }
  >();
  // Always list every active store — even with 0 sales in the period
  const companyStores = await prisma.store.findMany({
    where: { companyId, isArchived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  for (const s of companyStores) {
    storeMap.set(s.id, {
      name: s.name,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      checks: 0,
    });
  }
  const categoryMap = new Map<
    string,
    { name: string; sold: number; revenue: number; profit: number }
  >();
  const typeMap = new Map<
    string,
    { name: string; sold: number; revenue: number; profit: number }
  >();

  for (const sale of sales) {
    const saleGross = saleGrossMetricsNetOfReturnsSync(
      [sale],
      preloadedReturns
    );

    const sKey = sale.sellerId;
    const prevS = sellerMap.get(sKey) ?? {
      name: sale.seller.name,
      store: sale.store.name,
      checks: 0,
      revenue: 0,
      profit: 0,
    };
    prevS.checks += 1;
    prevS.revenue += saleGross.revenue;
    prevS.profit += saleGross.grossProfit;
    sellerMap.set(sKey, prevS);

    const st = storeMap.get(sale.storeId) ?? {
      name: sale.store.name,
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      checks: 0,
    };
    st.revenue += saleGross.revenue;
    st.cogs += saleGross.cogs;
    st.grossProfit += saleGross.grossProfit;
    st.checks += 1;
    storeMap.set(sale.storeId, st);

    for (const item of sale.items) {
      if (item.isGift) continue;
      // Bottles are consumables (PACKAGING), never merchandise rankings
      if (!isMerchandiseProduct(item.product)) continue;
      const qty =
        decimalToNumber(item.quantity) - (retQtyBySaleItem.get(item.id) ?? 0);
      if (qty <= 0) continue;
      const lineRev = decimalToNumber(item.salePrice) * qty;
      const lineCost = decimalToNumber(item.costPerUnit) * qty;
      const lineProfit = lineRev - lineCost;

      const pKey = item.productId;
      const prev = productMap.get(pKey) ?? {
        name: item.product.name,
        sold: 0,
        revenue: 0,
        cogs: 0,
        profit: 0,
        accountingType:
          item.product.accountingType === "WEIGHT" ? "WEIGHT" : "PIECE",
      };
      prev.sold += qty;
      prev.revenue += lineRev;
      prev.cogs += lineCost;
      prev.profit += lineProfit;
      productMap.set(pKey, prev);

      const catKey = item.product.categoryId ?? "_none";
      const cat = categoryMap.get(catKey) ?? {
        name: item.product.category?.name ?? "—",
        sold: 0,
        revenue: 0,
        profit: 0,
      };
      cat.sold += qty;
      cat.revenue += lineRev;
      cat.profit += lineProfit;
      categoryMap.set(catKey, cat);

      const typeKey = item.product.productTypeId ?? item.product.accountingType;
      const typ = typeMap.get(typeKey) ?? {
        name:
          item.product.productType?.name ??
          (item.product.accountingType === "WEIGHT" ? "Разливной" : "Штучный"),
        sold: 0,
        revenue: 0,
        profit: 0,
      };
      typ.sold += qty;
      typ.revenue += lineRev;
      typ.profit += lineProfit;
      typeMap.set(typeKey, typ);
    }
  }

  // Partition via single classifier — lists never overlap (except ranking).
  const soldMerchandise = Array.from(productMap.values());
  const onPace: ReturnType<typeof serializeProductRow>[] = [];
  const weakSellers: ReturnType<typeof serializeProductRow>[] = [];
  for (const p of soldMerchandise) {
    const cat = getProductPerformanceCategory({
      sold: p.sold,
      accountingType: p.accountingType,
      thresholds: performanceThresholds,
    });
    if (cat === "LEADER") onPace.push(serializeProductRow(p));
    else if (cat === "LOW") weakSellers.push(serializeProductRow(p));
    // NO_SALES cannot appear in productMap (qty > 0 only)
  }
  onPace.sort((a, b) => b.sold - a.sold || b.revenue - a.revenue);
  weakSellers.sort((a, b) => a.sold - b.sold || a.name.localeCompare(b.name));

  /** Absolute ranking by volume — no threshold. May overlap with onPace. */
  const topSales = soldMerchandise
    .map(serializeProductRow)
    .sort((a, b) => b.sold - a.sold || b.revenue - a.revenue)
    .slice(0, 50);

  // Merchandise with zero sales in period (existing query — not per-SKU).
  const soldIds = new Set(productMap.keys());
  const activeProducts = await prisma.product.findMany({
    where: merchandiseProductWhere({ companyId, isActive: true }),
    select: { id: true, name: true, accountingType: true },
    take: 500,
  });
  const noSales = activeProducts
    .filter((p) => !soldIds.has(p.id))
    .map((p) => ({
      name: p.name,
      sold: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
      accountingType:
        p.accountingType === "WEIGHT"
          ? ("WEIGHT" as const)
          : ("PIECE" as const),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 100);

  const stores = Array.from(storeMap.entries()).map(([id, s]) => {
    const exp = expenses.byStore.get(id) ?? 0;
    const net = withNetProfit({ grossProfit: s.grossProfit }, exp);
    return {
      id,
      name: s.name,
      revenue: Math.round(s.revenue * 100) / 100,
      cogs: Math.round(s.cogs * 100) / 100,
      grossProfit: Math.round(s.grossProfit * 100) / 100,
      expenses: net.expenses,
      netProfit: net.netProfit,
      profit: net.netProfit,
      checks: s.checks,
    };
  });

  const expenseItems = await listAllocatedExpenseItems({
    companyId,
    from,
    to: now,
  });

  return {
    period,
    periodFrom: from.toISOString(),
    periodTo: now.toISOString(),
    performanceThresholds: {
      monthlyPieces: monthlyThresholds.monthlyPieces,
      monthlyMl: monthlyThresholds.monthlyMl,
      scaledPieces: Math.round(performanceThresholds.pieces * 1000) / 1000,
      scaledMl: Math.round(performanceThresholds.ml * 1000) / 1000,
      dayCount: performanceThresholds.dayCount,
    },
    network: {
      revenue: Math.round(network.revenue * 100) / 100,
      cogs: Math.round(network.cogs * 100) / 100,
      grossProfit: Math.round(network.grossProfit * 100) / 100,
      expenses: network.expenses,
      netProfit: network.netProfit,
      profit: network.netProfit,
      salesCount: network.count,
      itemsSold: Math.round(network.itemsSold * 1000) / 1000,
    },
    /**
     * Absolute volume ranking (no threshold). May overlap with `products`
     * (on-pace / above threshold) — that is intentional.
     */
    topSales,
    /** On-pace: sold at/above scaled threshold (category LEADER). */
    products: onPace,
    /** Weak sellers only (sold > 0 and below threshold). Kept key for API compat. */
    topUnsold: weakSellers,
    /** Active merchandise with zero sales in the filtered period. */
    noSales,
    sellers: Array.from(sellerMap.values())
      .map((s) => ({
        name: s.name,
        store: s.store,
        checks: s.checks,
        revenue: Math.round(s.revenue * 100) / 100,
        profit: Math.round(s.profit * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 50),
    stores: stores.sort(
      (a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)
    ),
    categories: Array.from(categoryMap.values())
      .map((c) => ({
        name: c.name,
        sold: Math.round(c.sold * 1000) / 1000,
        revenue: Math.round(c.revenue * 100) / 100,
        profit: Math.round(c.profit * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    productTypes: Array.from(typeMap.values())
      .map((t) => ({
        name: t.name,
        sold: Math.round(t.sold * 1000) / 1000,
        revenue: Math.round(t.revenue * 100) / 100,
        profit: Math.round(t.profit * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue),
    expenses: {
      total: expenses.total,
      items: expenseItems,
    },
  };
}
