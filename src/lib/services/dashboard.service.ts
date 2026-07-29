import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { LocationType } from "@prisma/client";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) {
    if (current === 0) return { pct: 0, label: "0%" };
    return { pct: 100, label: "+100%" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    pct,
    label: `${pct > 0 ? "+" : ""}${pct}%`,
  };
}

function saleMetrics(
  sales: Array<{
    total: { toNumber?: () => number } | number | string;
    items: Array<{
      quantity: { toNumber?: () => number } | number | string;
      costPerUnit: { toNumber?: () => number } | number | string;
    }>;
  }>
) {
  const revenue = sales.reduce((s, sale) => s + decimalToNumber(sale.total), 0);
  const cost = sales.reduce(
    (s, sale) =>
      s +
      sale.items.reduce(
        (a, it) => a + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
        0
      ),
    0
  );
  const itemsSold = sales.reduce(
    (s, sale) => s + sale.items.reduce((a, it) => a + decimalToNumber(it.quantity), 0),
    0
  );
  const count = sales.length;
  const profit = revenue - cost;
  const avgCheck = count ? revenue / count : 0;
  return { revenue, profit, count, itemsSold, avgCheck };
}

export async function getDashboardPayload(companyId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const elapsedMs = now.getTime() - todayStart.getTime();
  const yesterdayStart = startOfDay(new Date(now.getTime() - 86400000));
  const yesterdaySame = new Date(yesterdayStart.getTime() + elapsedMs);

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });

  const [salesToday, salesYesterdaySlice, stores] = await Promise.all([
    prisma.sale.findMany({
      where: {
        store: { companyId },
        status: "COMPLETED",
        createdAt: { gte: todayStart, lte: now },
      },
      include: { items: true, store: { select: { id: true, name: true } } },
    }),
    prisma.sale.findMany({
      where: {
        store: { companyId },
        status: "COMPLETED",
        createdAt: { gte: yesterdayStart, lte: yesterdaySame },
      },
      include: { items: true },
    }),
    prisma.store.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const today = saleMetrics(salesToday);
  const yday = saleMetrics(salesYesterdaySlice);

  const storeToday = stores.map((store) => {
    const storeSales = salesToday.filter((s) => s.store.id === store.id);
    const m = saleMetrics(storeSales);
    return {
      id: store.id,
      name: store.name,
      revenue: m.revenue,
      profit: m.profit,
      salesCount: m.count,
    };
  });

  const lowStock = warehouse
    ? await prisma.stockBalance.findMany({
        where: {
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: { lte: 5 },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              unit: { select: { symbol: true } },
              accountingType: true,
            },
          },
        },
        orderBy: { quantity: "asc" },
        take: 12,
      })
    : [];

  const weekStart = startOfDay(new Date(now.getTime() - 6 * 86400000));
  const [warehouseBalances, salesWeek] = await Promise.all([
    warehouse
      ? prisma.stockBalance.findMany({
          where: {
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: { gt: 0 },
          },
          select: { quantity: true },
        })
      : Promise.resolve([]),
    prisma.sale.findMany({
      where: {
        store: { companyId },
        status: "COMPLETED",
        createdAt: { gte: weekStart, lte: now },
      },
      select: { total: true, createdAt: true },
    }),
  ]);

  const warehouseUnits = warehouseBalances.reduce(
    (s, b) => s + decimalToNumber(b.quantity),
    0
  );
  const warehouseSku = warehouseBalances.length;

  const sparkline: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = startOfDay(new Date(now.getTime() - i * 86400000));
    const next = new Date(day.getTime() + 86400000);
    const dayRev = salesWeek
      .filter((s) => s.createdAt >= day && s.createdAt < next)
      .reduce((sum, s) => sum + decimalToNumber(s.total), 0);
    sparkline.push(Math.round(dayRev * 100) / 100);
  }

  const storesWithSales = storeToday.filter((s) => s.salesCount > 0).length;

  const [pendingDiscounts, pendingReturns] = await Promise.all([
    prisma.discountRequest.findMany({
      where: {
        status: "PENDING",
        OR: [
          { sale: { store: { companyId } } },
          { requester: { companyId } },
        ],
      },
      include: {
        requester: { select: { id: true, name: true } },
        sale: {
          include: {
            store: { select: { id: true, name: true } },
            items: {
              take: 3,
              include: { product: { select: { name: true, salePrice: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.saleReturn.findMany({
      where: { status: "PENDING", sale: { store: { companyId } } },
      include: {
        requester: { select: { id: true, name: true } },
        sale: {
          include: {
            store: { select: { id: true, name: true } },
            items: {
              take: 3,
              include: { product: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const decisions = [
    ...pendingDiscounts.map((d) => ({
      id: d.id,
      type: "DISCOUNT" as const,
      priority: "urgent" as const,
      createdAt: d.createdAt.toISOString(),
      storeName: d.sale?.store.name ?? "—",
      actorName: d.requester.name,
      title: "Запрос скидки",
      amount: decimalToNumber(d.amount),
      percent: d.percent != null ? decimalToNumber(d.percent) : null,
      reason: d.reason,
      products:
        d.sale?.items.map((i) => i.product.name).join(", ") ||
        "Корзина / чек",
      originalTotal: d.sale ? decimalToNumber(d.sale.total) : null,
    })),
    ...pendingReturns.map((r) => ({
      id: r.id,
      type: "RETURN" as const,
      priority: "urgent" as const,
      createdAt: r.createdAt.toISOString(),
      storeName: r.sale.store.name,
      actorName: r.requester.name,
      title: "Запрос возврата",
      amount: decimalToNumber(r.sale.total),
      percent: null as number | null,
      reason: r.reason,
      products: r.sale.items.map((i) => i.product.name).join(", ") || "—",
      originalTotal: decimalToNumber(r.sale.total),
    })),
  ].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const decisionSummary = {
    total: decisions.length,
    discount: decisions.filter((d) => d.type === "DISCOUNT").length,
    return: decisions.filter((d) => d.type === "RETURN").length,
    price: 0,
    writeOff: 0,
    batch: 0,
  };

  const notifications = [
    ...decisions.slice(0, 5).map((d) => ({
      id: `dec-${d.type}-${d.id}`,
      tone: "warning" as const,
      title: d.title,
      message: `${d.storeName} · ${d.actorName}`,
      href:
        d.type === "DISCOUNT" ? "/dashboard#decisions" : "/returns",
      createdAt: d.createdAt,
    })),
    ...lowStock.slice(0, 5).map((b) => ({
      id: `stock-${b.id}`,
      tone:
        decimalToNumber(b.quantity) <= 0
          ? ("danger" as const)
          : ("warning" as const),
      title:
        decimalToNumber(b.quantity) <= 0
          ? "Нет в наличии"
          : "Заканчивается товар",
      message: `${b.product.name} · ${decimalToNumber(b.quantity)}${b.product.unit?.symbol ?? ""}`,
      href: `/warehouse/${b.product.id}`,
      createdAt: new Date().toISOString(),
    })),
  ].slice(0, 5);

  const recent = await prisma.activityLog.findMany({
    where: { companyId },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return {
    generatedAt: now.toISOString(),
    today: {
      ...today,
      deltas: {
        revenue: pctChange(today.revenue, yday.revenue),
        profit: pctChange(today.profit, yday.profit),
        count: pctChange(today.count, yday.count),
        itemsSold: pctChange(today.itemsSold, yday.itemsSold),
        avgCheck: pctChange(today.avgCheck, yday.avgCheck),
      },
    },
    pulse: {
      warehouseUnits: Math.round(warehouseUnits * 1000) / 1000,
      warehouseSku,
      lowStockCount: lowStock.length,
      storesOpen: storesWithSales,
      storesTotal: stores.length,
      sparkline,
    },
    stores: storeToday,
    lowStock: lowStock.map((b) => ({
      id: b.id,
      productId: b.product.id,
      name: b.product.name,
      quantity: decimalToNumber(b.quantity),
      unit: b.product.unit?.symbol ?? "",
      empty: decimalToNumber(b.quantity) <= 0,
    })),
    decisions,
    decisionSummary,
    notifications,
    recent: recent.map((log) => ({
      id: log.id,
      action: log.action,
      comment: log.comment,
      createdAt: log.createdAt.toISOString(),
      userName: log.user?.name ?? "Система",
      role: log.user?.role ?? "",
    })),
  };
}

export type DashboardPayload = Awaited<ReturnType<typeof getDashboardPayload>>;
