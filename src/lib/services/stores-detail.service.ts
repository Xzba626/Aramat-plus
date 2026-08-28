import {
  LocationType,
  Role,
  StoreKind,
  type DiscountRequestStatus,
  type ReturnStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { logActivity } from "@/lib/services/activity-log.service";
import { sumAllocatedExpenses } from "@/lib/services/expense.service";
import {
  COMPLETED_SALE_STATUSES,
  classifyStoreProfitHealth,
  detectSaleFinancialIssues,
  loadApprovedReturnLines,
  saleGrossMetricsNetOfReturnsSync,
  saleNetPriceRatio,
  withNetProfit,
} from "@/lib/services/profit.service";
import {
  createdAtFilter,
  parseStorePeriod,
  storePeriodRange,
  type StorePeriod,
} from "@/lib/services/store-period.service";
import {
  aggregatePaymentMethods,
  ensureKnownPaymentMethods,
} from "@/lib/analytics/payment-breakdown";
import { aggregateContainerSourceStats } from "@/lib/analytics/container-source-stats";

export type StockRowStatus = "OK" | "LOW" | "OUT";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function resolveLocation(companyId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, companyId },
    include: { manager: { select: { id: true, name: true } } },
  });
  if (!store) return null;

  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId, isActive: true },
    });
    return {
      store,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse?.id ?? null,
      warehouseName: warehouse?.name ?? null,
    };
  }

  return {
    store,
    locationType: LocationType.STORE,
    locationId: store.id,
    warehouseName: null as string | null,
  };
}

export async function getStoreDetail(companyId: string, storeId: string) {
  const loc = await resolveLocation(companyId, storeId);
  if (!loc) throw new Error("STORE_NOT_FOUND");

  const { store, locationType, locationId, warehouseName } = loc;
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const saleMetricsSelect = {
    id: true,
    total: true,
    subtotal: true,
    discountAmount: true,
    items: {
      select: {
        costPerUnit: true,
        quantity: true,
        salePrice: true,
        isGift: true,
        containerSource: true,
        packagingProductId: true,
      },
    },
  } as const;

  const [salesToday, salesMonth, lastSale, lastRevision, staffLastLogin] =
    await Promise.all([
      prisma.sale.findMany({
        where: {
          storeId,
          status: { in: [...COMPLETED_SALE_STATUSES] },
          createdAt: { gte: todayStart },
        },
        select: {
          ...saleMetricsSelect,
          paymentMethod: true,
        },
      }),
      prisma.sale.findMany({
        where: {
          storeId,
          status: { in: [...COMPLETED_SALE_STATUSES] },
          createdAt: { gte: monthStart },
        },
        select: saleMetricsSelect,
      }),
      prisma.sale.findFirst({
        where: { storeId, status: "COMPLETED" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.inventorySession.findFirst({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, status: true },
      }),
      prisma.user.findFirst({
        where: { storeId, isActive: true },
        orderBy: { lastLoginAt: "desc" },
        select: { lastLoginAt: true, name: true },
      }),
    ]);

  const returnLines = await loadApprovedReturnLines([
    ...salesToday.map((s) => s.id),
    ...salesMonth.map((s) => s.id),
  ]);

  const todayGross = saleGrossMetricsNetOfReturnsSync(salesToday, returnLines);
  const monthGross = saleGrossMetricsNetOfReturnsSync(salesMonth, returnLines);
  const avgCheck = todayGross.count > 0 ? todayGross.revenue / todayGross.count : 0;

  const paymentMethods = ensureKnownPaymentMethods(
    aggregatePaymentMethods(salesToday)
  );
  const containerSource = aggregateContainerSourceStats(salesToday);

  const expensesToday = await sumAllocatedExpenses({
    companyId,
    from: todayStart,
    to: todayStart,
    storeId,
  });
  const todayNet = withNetProfit(todayGross, expensesToday.total);

  let skuCount = 0;
  if (locationId) {
    skuCount = await prisma.stockBalance.count({
      where: {
        locationType,
        locationId,
        quantity: { gt: 0 },
        product: { kind: "STANDARD" },
      },
    });
  }

  const sellersCount = await prisma.user.count({
    where: { storeId, role: Role.SELLER, isActive: true },
  });
  const managersCount = await prisma.user.count({
    where: { storeId, role: Role.MANAGER, isActive: true },
  });

  return {
    id: store.id,
    name: store.name,
    address: store.address,
    phone: store.phone,
    workingHours: store.workingHours,
    kind: store.kind,
    status: store.status,
    isArchived: store.isArchived,
    isActive: store.isActive,
    openedAt: store.openedAt,
    notifyLowStock: store.notifyLowStock,
    notifyRequests: store.notifyRequests,
    manager: store.manager,
    stockSource: store.kind === StoreKind.OWNER_DIRECT ? "WAREHOUSE" : "STORE",
    warehouseName,
    overview: {
      sellersCount,
      managersCount,
      skuCount,
      todaySalesCount: todayGross.count,
      todayRevenue: todayGross.revenue,
      todayCogs: todayGross.cogs,
      todayGrossProfit: todayGross.grossProfit,
      todayExpenses: todayNet.expenses,
      todayNetProfit: todayNet.netProfit,
      todayProfit: todayGross.grossProfit,
      monthProfit: monthGross.grossProfit,
      monthRevenue: monthGross.revenue,
      monthCogs: monthGross.cogs,
      avgCheck: Math.round(avgCheck * 100) / 100,
      lastStaffLoginAt: staffLastLogin?.lastLoginAt ?? null,
      lastStaffLoginName: staffLastLogin?.name ?? null,
      lastSaleAt: lastSale?.createdAt ?? null,
      lastRevisionAt: lastRevision?.createdAt ?? null,
      lastRevisionStatus: lastRevision?.status ?? null,
      paymentMethods,
      containerSource,
    },
  };
}

type StockQuery = {
  q?: string;
  status?: StockRowStatus | "ALL";
  sort?: "name" | "qty" | "price" | "status";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  categoryId?: string;
  brandId?: string;
  /** MANAGER: omit exact quantities */
  bandsOnly?: boolean;
};

export async function getStoreStockPaged(
  companyId: string,
  storeId: string,
  query: StockQuery
) {
  const loc = await resolveLocation(companyId, storeId);
  if (!loc) throw new Error("STORE_NOT_FOUND");
  if (!loc.locationId) {
    return { items: [], total: 0, page: 1, pageSize: 20, pages: 0 };
  }

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 20));
  const q = (query.q ?? "").trim().toLowerCase();
  const statusFilter = query.status ?? "ALL";

  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: loc.locationType,
      locationId: loc.locationId,
      product: {
        kind: "STANDARD",
        ...(query.categoryId || query.brandId
          ? {
              ...(query.categoryId ? { categoryId: query.categoryId } : {}),
              ...(query.brandId ? { brandId: query.brandId } : {}),
            }
          : {}),
      },
    },
    include: {
      product: {
        include: {
          brand: true,
          category: true,
          unit: true,
          productType: true,
        },
      },
    },
  });

  const {
    getLowStockThresholds,
    resolveStockStatus,
    thresholdForProduct,
  } = await import("@/lib/services/low-stock-thresholds.service");
  const thresholds = await getLowStockThresholds(companyId);

  let rows = balances.map((b) => {
    const qty = decimalToNumber(b.quantity);
    const st = resolveStockStatus({
      quantity: qty,
      accountingType: b.product.accountingType,
      locationType: loc.locationType,
      thresholds,
    });
    const threshold = thresholdForProduct({
      accountingType: b.product.accountingType,
      locationType: loc.locationType,
      thresholds,
    });
    return {
      id: b.id,
      productId: b.productId,
      quantity: qty,
      minStock: threshold,
      salePrice: decimalToNumber(b.product.salePrice),
      status: st,
      product: {
        name: b.product.name,
        imageUrl: b.product.imageUrl ?? b.product.brand?.imageUrl ?? null,
        accountingType: b.product.accountingType,
        brand: b.product.brand ? { id: b.product.brand.id, name: b.product.brand.name } : null,
        category: b.product.category
          ? { id: b.product.category.id, name: b.product.category.name }
          : null,
        productType: b.product.productType
          ? { name: b.product.productType.name }
          : null,
        unit: b.product.unit
          ? { symbol: b.product.unit.symbol, name: b.product.unit.name }
          : null,
      },
    };
  });

  if (q) {
    rows = rows.filter((r) => {
      const hay = `${r.product.name} ${r.product.brand?.name ?? ""} ${r.product.category?.name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  if (statusFilter !== "ALL") {
    rows = rows.filter((r) => r.status === statusFilter);
  }

  const sort = query.sort ?? "name";
  const order = query.order === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    let cmp = 0;
    if (sort === "qty") cmp = a.quantity - b.quantity;
    else if (sort === "price") cmp = a.salePrice - b.salePrice;
    else if (sort === "status") {
      const rank = { OUT: 0, LOW: 1, OK: 2 };
      cmp = rank[a.status] - rank[b.status];
    } else cmp = a.product.name.localeCompare(b.product.name, "ru");
    return cmp * order;
  });

  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  let items = rows.slice(start, start + pageSize);

  if (query.bandsOnly) {
    const { quantityToStockBand } = await import("@/lib/permissions/stock-bands");
    const bandItems = items.map((r) => {
      const band = quantityToStockBand({
        quantity: r.quantity,
        accountingType: r.product.accountingType,
        locationType: loc.locationType,
        thresholds,
      });
      return {
        id: r.id,
        productId: r.productId,
        status: r.status,
        band,
        needsAttention: band !== "NORMAL",
        product: r.product,
      };
    });
    return { items: bandItems, total, page, pageSize, pages };
  }

  return { items, total, page, pageSize, pages };
}

export async function getStoreStaff(companyId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, companyId, kind: StoreKind.BRANCH },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  const users = await prisma.user.findMany({
    where: {
      storeId,
      companyId,
      role: { in: [Role.SELLER, Role.MANAGER] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
    orderBy: { name: "asc" },
  });

  const enriched = await Promise.all(
    users.map(async (u) => {
      const [sales, discountCount, returnCount] = await Promise.all([
        prisma.sale.findMany({
          where: { sellerId: u.id, storeId, status: "COMPLETED" },
          select: { total: true },
        }),
        prisma.discountRequest.count({ where: { requesterId: u.id } }),
        prisma.saleReturn.count({ where: { requesterId: u.id } }),
      ]);
      const salesSum = sales.reduce((s, x) => s + decimalToNumber(x.total), 0);
      const salesCount = sales.length;
      return {
        ...u,
        salesCount,
        salesSum,
        avgCheck: salesCount > 0 ? Math.round((salesSum / salesCount) * 100) / 100 : 0,
        discountRequests: discountCount,
        returnRequests: returnCount,
      };
    })
  );

  return enriched;
}

/** Active sellers/managers eligible to bind to this branch (not already on it). */
export async function listAssignableStaff(companyId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, companyId, kind: StoreKind.BRANCH },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  return prisma.user.findMany({
    where: {
      companyId,
      isActive: true,
      role: { in: [Role.SELLER, Role.MANAGER] },
      OR: [{ storeId: null }, { storeId: { not: storeId } }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      storeId: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/** Bind existing user to branch. Does not create users. */
export async function assignStoreStaff(params: {
  companyId: string;
  storeId: string;
  userId: string;
  actorId: string;
}) {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      kind: StoreKind.BRANCH,
      isArchived: false,
    },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  const target = await prisma.user.findFirst({
    where: { id: params.userId, companyId: params.companyId },
  });
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.role === Role.OWNER) throw new Error("FORBIDDEN");
  if (target.role !== Role.SELLER && target.role !== Role.MANAGER) {
    throw new Error("FORBIDDEN");
  }

  if (target.storeId === store.id) {
    return {
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      storeId: target.storeId,
      isActive: target.isActive,
    };
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { storeId: store.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      storeId: true,
      isActive: true,
    },
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "USER_UPDATE",
    entityType: "User",
    entityId: updated.id,
    comment: `assign:${store.name}`,
    metadata: {
      storeId: store.id,
      oldStoreId: target.storeId,
      newStoreId: store.id,
    },
  });

  return updated;
}

/** Remove store binding. User and sales history remain. */
export async function unassignStoreStaff(params: {
  companyId: string;
  storeId: string;
  userId: string;
  actorId: string;
}) {
  const store = await prisma.store.findFirst({
    where: { id: params.storeId, companyId: params.companyId, kind: StoreKind.BRANCH },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  const target = await prisma.user.findFirst({
    where: {
      id: params.userId,
      companyId: params.companyId,
      storeId: params.storeId,
    },
  });
  if (!target) throw new Error("USER_NOT_FOUND");

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { storeId: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      storeId: true,
      isActive: true,
    },
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "USER_UPDATE",
    entityType: "User",
    entityId: updated.id,
    comment: `unassign:${store.name}`,
    metadata: {
      storeId: store.id,
      oldStoreId: params.storeId,
      newStoreId: null,
    },
  });

  return updated;
}

export async function getStoreSalesHistory(
  companyId: string,
  storeId: string,
  page = 1,
  pageSize = 20,
  period: StorePeriod = "all"
) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const range = storePeriodRange(period);
  const where = { storeId, ...createdAtFilter(range) };
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                accountingType: true,
                unit: { select: { symbol: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const saleIds = rows.map((s) => s.id);
  const returnedByItem = new Map<string, number>();
  if (saleIds.length) {
    const retItems = await prisma.saleReturnItem.findMany({
      where: {
        return: { status: "APPROVED", saleId: { in: saleIds } },
      },
      select: { saleItemId: true, quantity: true },
    });
    for (const ri of retItems) {
      const q = decimalToNumber(ri.quantity);
      returnedByItem.set(
        ri.saleItemId,
        (returnedByItem.get(ri.saleItemId) ?? 0) + q
      );
    }
  }

  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((s) => {
      const netRatio = saleNetPriceRatio(s);
      const subtotal = decimalToNumber(s.subtotal);
      return {
        id: s.id,
        number: s.id.slice(-8).toUpperCase(),
        createdAt: s.createdAt,
        seller: s.seller,
        subtotal,
        discountAmount: decimalToNumber(s.discountAmount),
        total: decimalToNumber(s.total),
        paymentMethod: s.paymentMethod,
        status: s.status,
        items: s.items.map((it) => {
          const qty = decimalToNumber(it.quantity);
          const unitPrice = decimalToNumber(it.salePrice);
          const unitCost = decimalToNumber(it.costPerUnit);
          const grossAmount = Math.round(unitPrice * qty * 100) / 100;
          const netAmount = Math.round(grossAmount * netRatio * 100) / 100;
          const totalCost = Math.round(unitCost * qty * 100) / 100;
          const returnedQty = returnedByItem.get(it.id) ?? 0;
          const returnableQty = Math.max(0, qty - returnedQty);
          const lineIssues = detectSaleFinancialIssues({
            subtotal: s.subtotal,
            discountAmount: s.discountAmount,
            total: s.total,
            items: [it],
          });
          return {
            id: it.id,
            productId: it.productId,
            productName: it.product.name,
            sku: it.product.sku,
            quantity: qty,
            returnedQty,
            returnableQty,
            unit: it.product.unit?.symbol ?? "",
            accountingType: it.product.accountingType,
            unitPrice,
            grossAmount,
            netAmount,
            unitCost,
            totalCost,
            grossProfit: Math.round((netAmount - totalCost) * 100) / 100,
            salePrice: unitPrice,
            isGift: it.isGift,
            containerSource: it.containerSource,
            packagingProductId: it.packagingProductId,
            financialIssues: lineIssues,
          };
        }),
        financialIssues: detectSaleFinancialIssues(s),
      };
    }),
  };
}

export async function getStoreDiscountHistory(
  companyId: string,
  storeId: string,
  period: StorePeriod = "all"
) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const range = storePeriodRange(period);
  const dateFilter = createdAtFilter(range);

  const rows = await prisma.discountRequest.findMany({
    where: {
      OR: [{ sale: { storeId } }, { requester: { storeId } }],
      ...dateFilter,
    },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const requestRows = rows.map((r) => {
    const original = decimalToNumber(r.originalAmount);
    const discount = decimalToNumber(r.amount);
    return {
      id: r.id,
      kind: "REQUEST" as const,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      requester: r.requester,
      reviewer: r.reviewer,
      reason: r.reason,
      originalAmount: original,
      discountAmount: discount,
      finalAmount: Math.round((original - discount) * 100) / 100,
      percent: r.percent != null ? decimalToNumber(r.percent) : null,
      status: r.status,
      saleId: r.saleId,
      reviewNote: r.reviewNote,
    };
  });

  const directSales = await prisma.sale.findMany({
    where: {
      storeId,
      status: { in: [...COMPLETED_SALE_STATUSES] },
      discountAmount: { gt: 0 },
      discountRequestId: null,
      ...dateFilter,
    },
    include: {
      seller: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const directRows = directSales.map((s) => {
    const original = decimalToNumber(s.subtotal);
    const discount = decimalToNumber(s.discountAmount);
    return {
      id: `direct-${s.id}`,
      kind: "DIRECT" as const,
      createdAt: s.createdAt,
      reviewedAt: s.createdAt,
      requester: s.seller,
      reviewer: s.seller,
      reason: null as string | null,
      originalAmount: original,
      discountAmount: discount,
      finalAmount: decimalToNumber(s.total),
      percent:
        original > 0
          ? Math.round((discount / original) * 10000) / 100
          : null,
      status: "APPLIED" as const,
      saleId: s.id,
      reviewNote: null as string | null,
    };
  });

  return [...directRows, ...requestRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getStoreReturnHistory(
  companyId: string,
  storeId: string,
  period: StorePeriod = "all"
) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const range = storePeriodRange(period);

  const rows = await prisma.saleReturn.findMany({
    where: {
      sale: { storeId },
      ...createdAtFilter(range),
    },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      items: true,
      sale: { select: { id: true, total: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const productIds = [
    ...new Set(rows.flatMap((r) => r.items.map((it) => it.productId))),
  ];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return rows.map((r) => {
    const returnedRevenue = r.items.reduce(
      (s, it) =>
        s + decimalToNumber(it.salePrice) * decimalToNumber(it.quantity),
      0
    );
    const returnedCogs = r.items.reduce(
      (s, it) =>
        s + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
      0
    );
    return {
      id: r.id,
      saleId: r.sale.id,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      reason: r.reason,
      status: r.status,
      requester: r.requester,
      reviewer: r.reviewer,
      returnedRevenue: Math.round(returnedRevenue * 100) / 100,
      returnedCogs: Math.round(returnedCogs * 100) / 100,
      items: r.items.map((it) => {
        const p = productById.get(it.productId);
        return {
          productName: p?.name ?? it.productId,
          sku: p?.sku ?? null,
          quantity: decimalToNumber(it.quantity),
          salePrice: decimalToNumber(it.salePrice),
          costPerUnit: decimalToNumber(it.costPerUnit),
        };
      }),
    };
  });
}

export async function getStoreFinanceBreakdown(
  companyId: string,
  storeId: string,
  periodRaw?: string | null
) {
  const period = parseStorePeriod(periodRaw);
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const range = storePeriodRange(period);
  const saleMetricsSelect = {
    id: true,
    total: true,
    subtotal: true,
    discountAmount: true,
    items: {
      select: {
        costPerUnit: true,
        quantity: true,
        salePrice: true,
        isGift: true,
        containerSource: true,
        packagingProductId: true,
      },
    },
  } as const;

  const sales = await prisma.sale.findMany({
    where: {
      storeId,
      status: { in: [...COMPLETED_SALE_STATUSES] },
      ...createdAtFilter(range),
    },
    select: {
      ...saleMetricsSelect,
      paymentMethod: true,
    },
  });

  const retLines = await loadApprovedReturnLines(sales.map((s) => s.id));
  const gross = saleGrossMetricsNetOfReturnsSync(sales, retLines);

  const expenseFrom = range?.from ?? new Date(0);
  const expenseTo = range?.to ?? new Date();
  const expensesBlock = await sumAllocatedExpenses({
    companyId,
    from: expenseFrom,
    to: expenseTo,
    storeId,
  });
  const net = withNetProfit(gross, expensesBlock.total);

  const discountTotal = sales.reduce(
    (s, sale) => s + decimalToNumber(sale.discountAmount),
    0
  );

  const returnsCount = await prisma.saleReturn.count({
    where: {
      sale: { storeId },
      status: "APPROVED",
      ...createdAtFilter(range),
    },
  });

  const { health, anomalies } = classifyStoreProfitHealth({
    revenue: gross.revenue,
    cogs: gross.cogs,
    grossProfit: gross.grossProfit,
    sales,
  });

  return {
    period,
    revenue: gross.revenue,
    cogs: gross.cogs,
    grossProfit: gross.grossProfit,
    expenses: net.expenses,
    netProfit: net.netProfit,
    salesCount: gross.count,
    returnsCount,
    discountTotal: Math.round(discountTotal * 100) / 100,
    profitHealth: health,
    anomalies,
    paymentMethods: ensureKnownPaymentMethods(
      aggregatePaymentMethods(sales)
    ),
    containerSource: aggregateContainerSourceStats(sales),
  };
}

export async function getStoreRevisions(
  companyId: string,
  storeId: string,
  viewerRole: Role
) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, companyId, kind: StoreKind.BRANCH },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  const sessions = await prisma.inventorySession.findMany({
    where: { storeId },
    include: {
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const isOwner = viewerRole === Role.OWNER || viewerRole === Role.ADMIN;

  return sessions.map((s) => {
    const base = {
      id: s.id,
      createdAt: s.createdAt,
      completedAt: s.completedAt,
      status: s.status,
      comment: s.comment,
      createdBy: s.createdBy,
      approvedBy: s.approvedBy,
      storeName: store.name,
    };

    if (!isOwner) {
      return {
        ...base,
        // Manager: only that a revision existed — no counts / diffs.
        items: [] as Array<{
          productId: string;
          countedQty: number;
        }>,
        blind: true as const,
      };
    }

    let shortageQty = 0;
    let surplusQty = 0;
    const items = s.items.map((it) => {
      const expected = decimalToNumber(it.expectedQty);
      const counted = decimalToNumber(it.countedQty);
      const diff = decimalToNumber(it.difference);
      if (diff < 0) shortageQty += Math.abs(diff);
      if (diff > 0) surplusQty += diff;
      return {
        productId: it.productId,
        expectedQty: expected,
        countedQty: counted,
        difference: diff,
        discrepancyReason: it.discrepancyReason,
      };
    });

    return {
      ...base,
      items,
      shortageQty,
      surplusQty,
      blind: false as const,
    };
  });
}

export async function getStoreRequests(
  companyId: string,
  storeId: string,
  status?: "PENDING" | "APPROVED" | "REJECTED" | "ALL"
) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const st = status && status !== "ALL" ? status : undefined;

  const [discounts, returns] = await Promise.all([
    prisma.discountRequest.findMany({
      where: {
        ...(st ? { status: st as DiscountRequestStatus } : {}),
        OR: [{ sale: { storeId } }, { requester: { storeId } }],
      },
      include: {
        requester: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.saleReturn.findMany({
      where: {
        sale: { storeId },
        ...(st ? { status: st as ReturnStatus } : {}),
      },
      include: {
        requester: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const items = [
    ...discounts.map((d) => ({
      id: d.id,
      type: "DISCOUNT" as const,
      status: d.status,
      createdAt: d.createdAt,
      requester: d.requester,
      summary: `${decimalToNumber(d.amount)} · ${d.reason ?? "—"}`,
    })),
    ...returns.map((r) => ({
      id: r.id,
      type: "RETURN" as const,
      status: r.status,
      createdAt: r.createdAt,
      requester: r.requester,
      summary: r.reason ?? "",
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { items, writeOffsNoteKey: "storeDetail.writeOffsHint" };
}
