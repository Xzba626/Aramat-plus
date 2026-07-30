import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Top products and sellers from real COMPLETED sales (month-to-date). */
export async function getAnalyticsBreakdown(companyId: string) {
  const from = monthStart();

  const sales = await prisma.sale.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: from },
      store: { companyId },
    },
    include: {
      seller: { select: { id: true, name: true } },
      store: { select: { id: true, name: true, kind: true } },
      items: {
        include: { product: { select: { id: true, name: true } } },
      },
    },
  });

  const productMap = new Map<
    string,
    { name: string; sold: number; revenue: number; profit: number }
  >();
  const sellerMap = new Map<
    string,
    { name: string; store: string; checks: number; revenue: number }
  >();

  for (const sale of sales) {
    const total = decimalToNumber(sale.total);
    const sKey = sale.sellerId;
    const prevS = sellerMap.get(sKey) ?? {
      name: sale.seller.name,
      store: sale.store.name,
      checks: 0,
      revenue: 0,
    };
    prevS.checks += 1;
    prevS.revenue += total;
    sellerMap.set(sKey, prevS);

    for (const item of sale.items) {
      if (item.isGift) continue;
      const qty = decimalToNumber(item.quantity);
      const lineRev = decimalToNumber(item.salePrice) * qty;
      const lineCost = decimalToNumber(item.costPerUnit) * qty;
      const pKey = item.productId;
      const prev = productMap.get(pKey) ?? {
        name: item.product.name,
        sold: 0,
        revenue: 0,
        profit: 0,
      };
      prev.sold += qty;
      prev.revenue += lineRev;
      prev.profit += lineRev - lineCost;
      productMap.set(pKey, prev);
    }
  }

  const products = Array.from(productMap.values())
    .map((p) => ({
      name: p.name,
      sold: Math.round(p.sold * 1000) / 1000,
      revenue: Math.round(p.revenue * 100) / 100,
      profit: Math.round(p.profit * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 50);

  const sellers = Array.from(sellerMap.values())
    .map((s) => ({
      name: s.name,
      store: s.store,
      checks: s.checks,
      revenue: Math.round(s.revenue * 100) / 100,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 50);

  const expenses = await prisma.expense.findMany({
    where: {
      incurredAt: { gte: from },
      OR: [
        { store: { companyId } },
        { createdBy: { companyId } },
      ],
    },
    include: {
      expenseType: { select: { name: true } },
      store: { select: { name: true } },
    },
    orderBy: { incurredAt: "desc" },
    take: 100,
  });

  const expenseTotal = expenses.reduce(
    (sum, e) => sum + decimalToNumber(e.amount),
    0
  );

  return {
    products,
    sellers,
    expenses: {
      total: Math.round(expenseTotal * 100) / 100,
      items: expenses.map((e) => ({
        id: e.id,
        amount: decimalToNumber(e.amount),
        type: e.expenseType.name,
        store: e.store?.name ?? null,
        description: e.description,
        incurredAt: e.incurredAt.toISOString(),
      })),
    },
    periodFrom: from.toISOString(),
  };
}
