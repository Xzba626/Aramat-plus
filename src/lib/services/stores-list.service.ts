import { prisma } from "@/lib/prisma";
import { LocationType, StoreKind } from "@prisma/client";
import { decimalToNumber } from "@/lib/utils";
import { ensureOwnerDirectStore } from "@/lib/services/owner-direct.service";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function listStoresForCompany(
  companyId: string,
  opts?: { includeArchived?: boolean }
) {
  await ensureOwnerDirectStore(companyId);

  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });

  const stores = await prisma.store.findMany({
    where: {
      companyId,
      ...(opts?.includeArchived ? {} : { isArchived: false }),
    },
    include: {
      manager: { select: { id: true, name: true } },
      users: {
        where: { isActive: true },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      },
      _count: { select: { users: true } },
    },
  });

  const storeIds = stores.map((s) => s.id);

  const [salesToday, salesMonth, lastSales, lastRevisions, pendingDisc, pendingRet] =
    await Promise.all([
      prisma.sale.findMany({
        where: {
          storeId: { in: storeIds },
          status: "COMPLETED",
          createdAt: { gte: todayStart },
        },
        select: {
          storeId: true,
          total: true,
          items: { select: { costPerUnit: true, quantity: true } },
        },
      }),
      prisma.sale.findMany({
        where: {
          storeId: { in: storeIds },
          status: "COMPLETED",
          createdAt: { gte: monthStart },
        },
        select: {
          storeId: true,
          total: true,
          items: { select: { costPerUnit: true, quantity: true } },
        },
      }),
      prisma.sale.groupBy({
        by: ["storeId"],
        where: { storeId: { in: storeIds }, status: "COMPLETED" },
        _max: { createdAt: true },
      }),
      prisma.inventorySession.groupBy({
        by: ["storeId"],
        where: { storeId: { in: storeIds } },
        _max: { createdAt: true },
      }),
      prisma.discountRequest.findMany({
        where: { status: "PENDING", sale: { storeId: { in: storeIds } } },
        select: { sale: { select: { storeId: true } } },
      }),
      prisma.saleReturn.findMany({
        where: { status: "PENDING", sale: { storeId: { in: storeIds } } },
        select: { sale: { select: { storeId: true } } },
      }),
    ]);

  const pendingByStore = new Map<string, number>();
  for (const d of pendingDisc) {
    const sid = d.sale?.storeId;
    if (sid) pendingByStore.set(sid, (pendingByStore.get(sid) ?? 0) + 1);
  }
  for (const r of pendingRet) {
    const sid = r.sale?.storeId;
    if (sid) pendingByStore.set(sid, (pendingByStore.get(sid) ?? 0) + 1);
  }

  function aggSales(
    rows: typeof salesToday,
    storeId: string
  ) {
    const list = rows.filter((s) => s.storeId === storeId);
    const revenue = list.reduce((s, x) => s + decimalToNumber(x.total), 0);
    const cost = list.reduce(
      (s, x) =>
        s +
        x.items.reduce(
          (a, it) => a + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
          0
        ),
      0
    );
    return { count: list.length, revenue, profit: revenue - cost };
  }

  const lastSaleMap = new Map(
    lastSales.map((x) => [x.storeId, x._max.createdAt])
  );
  const lastRevMap = new Map(
    lastRevisions.map((x) => [x.storeId, x._max.createdAt])
  );

  const enriched = await Promise.all(
    stores.map(async (store) => {
      const isDirect = store.kind === StoreKind.OWNER_DIRECT;
      const locationType = isDirect ? LocationType.WAREHOUSE : LocationType.STORE;
      const locationId = isDirect ? warehouse?.id : store.id;

      let skuCount = 0;
      let unitsTotal = 0;
      let stockCost = 0;

      if (locationId) {
        const balances = await prisma.stockBalance.findMany({
          where: {
            locationType,
            locationId,
            quantity: { gt: 0 },
            product: { kind: "STANDARD" },
          },
        });
        skuCount = balances.length;
        unitsTotal = balances.reduce((s, b) => s + decimalToNumber(b.quantity), 0);

        const batches = await prisma.batch.findMany({
          where: {
            locationType,
            locationId,
            quantity: { gt: 0 },
            product: { kind: "STANDARD" },
          },
          select: { quantity: true, costPerUnit: true },
        });
        stockCost = batches.reduce(
          (s, b) => s + decimalToNumber(b.quantity) * decimalToNumber(b.costPerUnit),
          0
        );
      }

      const today = aggSales(salesToday, store.id);
      const month = aggSales(salesMonth, store.id);

      return {
        id: store.id,
        name: store.name,
        address: store.address,
        phone: store.phone,
        kind: store.kind,
        status: store.status,
        isArchived: store.isArchived,
        isActive: store.isActive,
        openedAt: store.openedAt,
        manager: store.manager,
        staffCount: store.users.filter((u) => u.role === "SELLER" || u.role === "MANAGER").length,
        users: store.users,
        skuCount,
        unitsTotal: Math.round(unitsTotal * 1000) / 1000,
        stockCost: Math.round(stockCost * 100) / 100,
        todaySalesCount: today.count,
        todayRevenue: today.revenue,
        todayProfit: today.profit,
        monthRevenue: month.revenue,
        monthProfit: month.profit,
        pendingRequests: pendingByStore.get(store.id) ?? 0,
        lastSaleAt: lastSaleMap.get(store.id) ?? null,
        lastRevisionAt: lastRevMap.get(store.id) ?? null,
        stockSource: isDirect ? "WAREHOUSE" : "STORE",
      };
    })
  );

  enriched.sort((a, b) => {
    if (a.kind === StoreKind.OWNER_DIRECT && b.kind !== StoreKind.OWNER_DIRECT) return -1;
    if (b.kind === StoreKind.OWNER_DIRECT && a.kind !== StoreKind.OWNER_DIRECT) return 1;
    return a.name.localeCompare(b.name, "ru");
  });

  return enriched;
}
