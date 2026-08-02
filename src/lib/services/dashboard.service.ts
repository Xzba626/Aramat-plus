import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { LocationType } from "@prisma/client";
import { sumAllocatedExpenses } from "@/lib/services/expense.service";
import {
  loadApprovedReturnLines,
  saleGrossMetricsNetOfReturnsSync,
  withNetProfit,
} from "@/lib/services/profit.service";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function pctChange(current: number, previous: number) {
  const abs = Math.round((current - previous) * 100) / 100;
  const absLabel =
    abs === 0 ? "0 с." : `${abs > 0 ? "+" : ""}${abs} с.`;
  if (previous === 0) {
    if (current === 0)
      return {
        pct: 0,
        label: "0%",
        abs,
        absLabel,
        current,
        previous,
      };
    return {
      pct: 100,
      label: "+100%",
      abs,
      absLabel,
      current,
      previous,
    };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    pct,
    label: `${pct > 0 ? "+" : ""}${pct}%`,
    abs,
    absLabel,
    current,
    previous,
  };
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

  const [salesToday, salesYesterdaySlice, stores, expensesToday, expensesYday] =
    await Promise.all([
      prisma.sale.findMany({
        where: {
          store: { companyId },
          status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
          createdAt: { gte: todayStart, lte: now },
        },
        include: {
          items: {
            include: { product: { select: { id: true, name: true } } },
          },
          store: { select: { id: true, name: true } },
        },
      }),
      prisma.sale.findMany({
        where: {
          store: { companyId },
          status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
          createdAt: { gte: yesterdayStart, lte: yesterdaySame },
        },
        include: { items: true },
      }),
      prisma.store.findMany({
        where: { companyId, isActive: true, kind: "BRANCH" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      sumAllocatedExpenses({
        companyId,
        from: todayStart,
        to: todayStart,
      }),
      sumAllocatedExpenses({
        companyId,
        from: yesterdayStart,
        to: yesterdayStart,
      }),
    ]);

  const returnLines = await loadApprovedReturnLines(
    [...salesToday, ...salesYesterdaySlice].map((s) => s.id)
  );

  const todayGross = saleGrossMetricsNetOfReturnsSync(salesToday, returnLines);
  const ydayGross = saleGrossMetricsNetOfReturnsSync(
    salesYesterdaySlice,
    returnLines
  );
  const today = withNetProfit(todayGross, expensesToday.total);
  const yday = withNetProfit(ydayGross, expensesYday.total);

  const packagingCost = expensesToday.packaging;
  const operationalExpenses = expensesToday.operational;
  // Net must equal gross − packaging − operational (same as − total expenses)
  const netCheck =
    Math.round((today.grossProfit - packagingCost - operationalExpenses) * 100) /
    100;

  // Weight vs piece split for today
  let weightSold = 0;
  let pieceSold = 0;
  const productIds = [
    ...new Set(salesToday.flatMap((s) => s.items.map((i) => i.productId))),
  ];
  if (productIds.length) {
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, accountingType: true },
    });
    const typeMap = new Map(products.map((p) => [p.id, p.accountingType]));
    for (const sale of salesToday) {
      for (const it of sale.items) {
        if (it.isGift) continue;
        const qty = decimalToNumber(it.quantity);
        if (typeMap.get(it.productId) === "WEIGHT") weightSold += qty;
        else pieceSold += qty;
      }
    }
  }

  const storeTodayBase = stores.map((store) => {
    const storeSales = salesToday.filter((s) => s.store.id === store.id);
    const g = saleGrossMetricsNetOfReturnsSync(storeSales, returnLines);
    const storeExp = expensesToday.byStore.get(store.id) ?? 0;
    const m = withNetProfit(g, storeExp);

    const productRev = new Map<string, { name: string; revenue: number }>();
    for (const sale of storeSales) {
      for (const it of sale.items) {
        if (it.isGift) continue;
        const rev =
          decimalToNumber(it.quantity) * decimalToNumber(it.salePrice);
        const prev = productRev.get(it.productId);
        if (prev) prev.revenue += rev;
        else
          productRev.set(it.productId, {
            name: it.product.name,
            revenue: rev,
          });
      }
    }
    const top = [...productRev.values()].sort((a, b) => b.revenue - a.revenue)[0];

    return {
      id: store.id,
      name: store.name,
      revenue: m.revenue,
      cogs: m.cogs,
      grossProfit: m.grossProfit,
      packagingCost: Math.round(
        (expensesToday.byStorePackaging.get(store.id) ?? 0) * 100
      ) / 100,
      operationalExpenses: Math.round(
        (expensesToday.byStoreOperational.get(store.id) ?? 0) * 100
      ) / 100,
      expenses: m.expenses,
      netProfit: m.netProfit,
      profit: m.netProfit,
      salesCount: m.count,
      topProductName: top?.name ?? null,
      topProductRevenue: top ? Math.round(top.revenue * 100) / 100 : null,
    };
  });

  const lowStock = warehouse
    ? await prisma.stockBalance.findMany({
        where: {
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          product: { companyId, isActive: true },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              minStock: true,
              unit: { select: { symbol: true } },
              accountingType: true,
            },
          },
        },
        orderBy: { quantity: "asc" },
        take: 80,
      })
    : [];

  const lowStockFiltered = lowStock
    .filter((b) => {
      const qty = decimalToNumber(b.quantity);
      const min = decimalToNumber(b.product.minStock);
      const threshold = min > 0 ? min : 5;
      return qty <= threshold;
    })
    .slice(0, 12);

  const weekStart = startOfDay(new Date(now.getTime() - 6 * 86400000));
  const monthStart = startOfDay(new Date(now.getTime() - 29 * 86400000));
  const [warehouseBalances, salesMonth, monthExpenses] = await Promise.all([
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
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
        createdAt: { gte: monthStart, lte: now },
      },
      select: {
        id: true,
        total: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            costPerUnit: true,
            isGift: true,
          },
        },
      },
    }),
    sumAllocatedExpenses({
      companyId,
      from: monthStart,
      to: todayStart,
    }),
  ]);

  const salesWeek = salesMonth.filter((s) => s.createdAt >= weekStart);
  const weekExpenses = {
    byDay: monthExpenses.byDay,
  };

  const returnLinesWeek = await loadApprovedReturnLines(
    salesMonth.map((s) => s.id)
  );

  const warehouseUnits = warehouseBalances.reduce(
    (s, b) => s + decimalToNumber(b.quantity),
    0
  );
  const warehouseSku = warehouseBalances.length;

  const sparkline: number[] = [];
  const netSparkline: number[] = [];
  const sparklineLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = startOfDay(new Date(now.getTime() - i * 86400000));
    const next = new Date(day.getTime() + 86400000);
    const dayKey = day.toISOString().slice(0, 10);
    sparklineLabels.push(dayKey);
    const daySales = salesWeek.filter(
      (s) => s.createdAt >= day && s.createdAt < next
    );
    const dayRev = daySales.reduce(
      (sum, s) => sum + decimalToNumber(s.total),
      0
    );
    sparkline.push(Math.round(dayRev * 100) / 100);
    const dayGross = saleGrossMetricsNetOfReturnsSync(
      daySales,
      returnLinesWeek
    );
    const dayExp = weekExpenses.byDay.get(dayKey) ?? 0;
    netSparkline.push(
      Math.round((dayGross.grossProfit - dayExp) * 100) / 100
    );
  }

  const netSparklineMonth: number[] = [];
  const sparklineLabelsMonth: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = startOfDay(new Date(now.getTime() - i * 86400000));
    const next = new Date(day.getTime() + 86400000);
    const dayKey = day.toISOString().slice(0, 10);
    sparklineLabelsMonth.push(dayKey);
    const daySales = salesMonth.filter(
      (s) => s.createdAt >= day && s.createdAt < next
    );
    const dayGross = saleGrossMetricsNetOfReturnsSync(
      daySales,
      returnLinesWeek
    );
    const dayExp = monthExpenses.byDay.get(dayKey) ?? 0;
    netSparklineMonth.push(
      Math.round((dayGross.grossProfit - dayExp) * 100) / 100
    );
  }

  const storesWithSales = storeTodayBase.filter((s) => s.salesCount > 0).length;

  const [pendingDiscounts, pendingReturns, openRevisionSessions] =
    await Promise.all([
      prisma.discountRequest.findMany({
        where: {
          status: "PENDING",
          companyId,
        },
        include: {
          requester: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
          sale: {
            include: {
              store: { select: { id: true, name: true } },
              items: {
                take: 3,
                include: {
                  product: { select: { name: true, salePrice: true } },
                },
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
      prisma.inventorySession.findMany({
        where: {
          status: "IN_PROGRESS",
          store: { companyId },
        },
        select: { id: true, storeId: true },
      }),
    ]);

  const decisions = [
    ...pendingDiscounts.map((d) => {
      const productNames =
        d.sale?.items.map((i) => i.product.name).join(", ") ?? "";
      const original = decimalToNumber(d.originalAmount);
      const discountAmt = decimalToNumber(d.amount);
      const storeId = d.store?.id ?? d.sale?.store.id ?? null;
      return {
        id: d.id,
        type: "DISCOUNT" as const,
        priority: "urgent" as const,
        createdAt: d.createdAt.toISOString(),
        storeId,
        storeName: d.store?.name ?? d.sale?.store.name ?? "—",
        actorName: d.requester.name,
        titleKey: "dashboard.decisionDiscount" as const,
        amount: discountAmt,
        percent: d.percent != null ? decimalToNumber(d.percent) : null,
        reason: d.reason,
        products: productNames,
        productsFallbackKey: productNames
          ? null
          : ("dashboard.cartOrReceipt" as const),
        originalTotal: original,
        finalTotal: Math.round((original - discountAmt) * 100) / 100,
        href: "/discounts",
      };
    }),
    ...pendingReturns.map((r) => {
      const productNames = r.sale.items.map((i) => i.product.name).join(", ");
      return {
        id: r.id,
        type: "RETURN" as const,
        priority: "urgent" as const,
        createdAt: r.createdAt.toISOString(),
        storeId: r.sale.store.id,
        storeName: r.sale.store.name,
        actorName: r.requester.name,
        titleKey: "dashboard.decisionReturn" as const,
        amount: decimalToNumber(r.sale.total),
        percent: null as number | null,
        reason: r.reason,
        products: productNames,
        productsFallbackKey: productNames
          ? null
          : ("dashboard.cartOrReceipt" as const),
        originalTotal: decimalToNumber(r.sale.total),
        finalTotal: null as number | null,
        href: "/returns",
      };
    }),
  ].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const openRevisions = openRevisionSessions.length;

  const storeToday = storeTodayBase.map((store) => {
    const discountN = pendingDiscounts.filter(
      (d) => (d.store?.id ?? d.sale?.store.id) === store.id
    ).length;
    const returnN = pendingReturns.filter((r) => r.sale.store.id === store.id)
      .length;
    const revisionN = openRevisionSessions.filter(
      (r) => r.storeId === store.id
    ).length;
    const problems: Array<{
      key: string;
      labelKey: string;
      href: string;
      tone: "danger" | "alert";
    }> = [];
    if (store.salesCount === 0) {
      problems.push({
        key: "quiet",
        labelKey: "dashboard.problemNoSales",
        href: `/stores/${store.id}`,
        tone: "alert",
      });
    }
    if (discountN > 0) {
      problems.push({
        key: "discount",
        labelKey: "dashboard.problemDiscount",
        href: "/discounts",
        tone: "danger",
      });
    }
    if (returnN > 0) {
      problems.push({
        key: "return",
        labelKey: "dashboard.problemReturn",
        href: "/returns",
        tone: "danger",
      });
    }
    if (revisionN > 0) {
      problems.push({
        key: "revision",
        labelKey: "dashboard.problemRevision",
        href: "/revision",
        tone: "alert",
      });
    }
    return { ...store, problems, pendingDiscount: discountN, pendingReturn: returnN };
  }).sort((a, b) => b.netProfit - a.netProfit);

  const storesNetSum = Math.round(
    storeToday.reduce((s, st) => s + st.netProfit, 0) * 100
  ) / 100;

  const decisionSummary = {
    /** Decisions that need Approve/Reject (not informational alerts). */
    total:
      decisions.filter((d) => d.type === "DISCOUNT" || d.type === "RETURN")
        .length,
    discount: decisions.filter((d) => d.type === "DISCOUNT").length,
    return: decisions.filter((d) => d.type === "RETURN").length,
    lowStock: lowStockFiltered.length,
    revision: openRevisions,
    price: 0,
    writeOff: 0,
    batch: 0,
  };

  const notifications = [
    ...decisions.slice(0, 5).map((d) => ({
      id: `dec-${d.type}-${d.id}`,
      tone: "warning" as const,
      titleKey: d.titleKey,
      message: `${d.storeName} · ${d.actorName}`,
      href: d.type === "DISCOUNT" ? "/discounts" : "/returns",
      createdAt: d.createdAt,
      needsDecision: true,
    })),
    ...lowStockFiltered.slice(0, 5).map((b) => ({
      id: `stock-${b.id}`,
      tone:
        decimalToNumber(b.quantity) <= 0
          ? ("danger" as const)
          : ("warning" as const),
      titleKey:
        decimalToNumber(b.quantity) <= 0
          ? ("dashboard.outOfStock" as const)
          : ("dashboard.stockRunningLow" as const),
      message: `${b.product.name} · ${decimalToNumber(b.quantity)}${b.product.unit?.symbol ?? ""}`,
      href: `/warehouse/${b.product.id}`,
      createdAt: new Date().toISOString(),
      needsDecision: false,
    })),
  ].slice(0, 8);

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
      cogs: today.cogs,
      packagingCost,
      operationalExpenses,
      expenses: expensesToday.total,
      netFromLayers: netCheck,
      storesNetSum,
      storesNetMatchesNetwork:
        Math.abs(storesNetSum - today.netProfit) < 0.05,
      weightSold: Math.round(weightSold * 1000) / 1000,
      pieceSold: Math.round(pieceSold * 1000) / 1000,
      yesterday: {
        revenue: yday.revenue,
        grossProfit: yday.grossProfit,
        netProfit: yday.netProfit,
        expenses: expensesYday.total,
        packagingCost: expensesYday.packaging,
        operationalExpenses: expensesYday.operational,
        cogs: yday.cogs,
      },
      deltas: {
        revenue: pctChange(today.revenue, yday.revenue),
        profit: pctChange(today.netProfit, yday.netProfit),
        netProfit: pctChange(today.netProfit, yday.netProfit),
        grossProfit: pctChange(today.grossProfit, yday.grossProfit),
        count: pctChange(today.count, yday.count),
        itemsSold: pctChange(today.itemsSold, yday.itemsSold),
        avgCheck: pctChange(today.avgCheck, yday.avgCheck),
      },
    },
    pulse: {
      warehouseUnits: Math.round(warehouseUnits * 1000) / 1000,
      warehouseSku,
      lowStockCount: lowStockFiltered.length,
      storesOpen: storesWithSales,
      storesTotal: stores.length,
      sparkline,
      netSparkline,
      sparklineLabels,
      netSparklineMonth,
      sparklineLabelsMonth,
    },
    stores: storeToday,
    lowStock: lowStockFiltered.map((b) => ({
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
      entityType: log.entityType,
      entityId: log.entityId,
      comment: log.comment,
      createdAt: log.createdAt.toISOString(),
      userName: log.user?.name ?? "",
      role: log.user?.role ?? "",
    })),
    bestStoreId:
      storeToday.length === 0
        ? null
        : [...storeToday].sort((a, b) => b.netProfit - a.netProfit)[0]?.id ??
          null,
    worstStoreId:
      storeToday.length === 0
        ? null
        : [...storeToday].sort((a, b) => a.netProfit - b.netProfit)[0]?.id ??
          null,
  };
}

export type DashboardPayload = Awaited<ReturnType<typeof getDashboardPayload>>;
