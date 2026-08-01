import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { sumAllocatedExpenses } from "@/lib/services/expense.service";
import {
  saleGrossMetricsNetOfReturnsSync,
  withNetProfit,
  type ReturnLineAdj,
} from "@/lib/services/profit.service";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function weekStart(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday-based
  x.setDate(x.getDate() - diff);
  return x;
}

export type AnalyticsPeriod = "today" | "week" | "month";

function periodFrom(period: AnalyticsPeriod, now = new Date()) {
  if (period === "today") return startOfDay(now);
  if (period === "week") return weekStart(now);
  return monthStart(now);
}

/** Deep analytics: products, sellers, categories, types, stores, net profit. */
export async function getAnalyticsBreakdown(
  companyId: string,
  period: AnalyticsPeriod = "month"
) {
  const now = new Date();
  const from = periodFrom(period, now);

  const sales = await prisma.sale.findMany({
    where: {
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
      createdAt: { gte: from, lte: now },
      store: { companyId },
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
  });

  const expenses = await sumAllocatedExpenses({
    companyId,
    from,
    to: startOfDay(now),
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

  const productMap = new Map<
    string,
    { name: string; sold: number; revenue: number; cogs: number; profit: number }
  >();
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

  const productsSorted = Array.from(productMap.values())
    .map((p) => ({
      name: p.name,
      sold: Math.round(p.sold * 1000) / 1000,
      revenue: Math.round(p.revenue * 100) / 100,
      cogs: Math.round(p.cogs * 100) / 100,
      profit: Math.round(p.profit * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const topSelling = productsSorted.slice(0, 50);
  const topUnsold = productsSorted
    .filter((p) => p.sold > 0)
    .sort((a, b) => a.sold - b.sold)
    .slice(0, 20);

  // Products with stock but zero sales in period
  const soldIds = new Set(productMap.keys());
  const activeProducts = await prisma.product.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true },
    take: 500,
  });
  const neverSold = activeProducts
    .filter((p) => !soldIds.has(p.id))
    .slice(0, 30)
    .map((p) => ({ name: p.name, sold: 0, revenue: 0, cogs: 0, profit: 0 }));

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

  const expenseRows = await prisma.expense.findMany({
    where: {
      startsAt: { lte: now },
      OR: [
        { store: { companyId } },
        { createdBy: { companyId } },
      ],
    },
    include: {
      expenseType: { select: { name: true } },
      store: { select: { name: true } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });

  return {
    period,
    periodFrom: from.toISOString(),
    periodTo: now.toISOString(),
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
    products: topSelling,
    topUnsold: [...topUnsold, ...neverSold].slice(0, 30),
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
    stores,
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
      items: expenseRows.map((e) => ({
        id: e.id,
        amount: decimalToNumber(e.amount),
        type: e.expenseType.name,
        store: e.store?.name ?? null,
        description: e.description,
        periodicity: e.periodicity,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt?.toISOString() ?? null,
        incurredAt: e.incurredAt.toISOString(),
      })),
    },
  };
}
