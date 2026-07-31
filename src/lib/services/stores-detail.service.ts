import {
  LocationType,
  Role,
  StoreKind,
  type DiscountRequestStatus,
  type ReturnStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { ensureOwnerDirectStore } from "@/lib/services/owner-direct.service";
import { logActivity } from "@/lib/services/activity-log.service";

export type StockRowStatus = "OK" | "LOW" | "OUT";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function stockStatus(qty: number, minStock: number): StockRowStatus {
  if (qty <= 0) return "OUT";
  if (minStock > 0 && qty < minStock) return "LOW";
  return "OK";
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
  await ensureOwnerDirectStore(companyId);
  const loc = await resolveLocation(companyId, storeId);
  if (!loc) throw new Error("STORE_NOT_FOUND");

  const { store, locationType, locationId, warehouseName } = loc;
  const now = new Date();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);

  const [salesToday, salesMonth, lastSale, lastRevision, staffLastLogin] =
    await Promise.all([
      prisma.sale.findMany({
        where: {
          storeId,
          status: "COMPLETED",
          createdAt: { gte: todayStart },
        },
        select: {
          total: true,
          items: { select: { costPerUnit: true, quantity: true } },
        },
      }),
      prisma.sale.findMany({
        where: {
          storeId,
          status: "COMPLETED",
          createdAt: { gte: monthStart },
        },
        select: {
          total: true,
          items: { select: { costPerUnit: true, quantity: true } },
        },
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

  const profitOf = (rows: typeof salesToday) => {
    const revenue = rows.reduce((s, x) => s + decimalToNumber(x.total), 0);
    const cost = rows.reduce(
      (s, x) =>
        s +
        x.items.reduce(
          (a, it) =>
            a + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
          0
        ),
      0
    );
    return { revenue, profit: revenue - cost, count: rows.length };
  };

  const today = profitOf(salesToday);
  const month = profitOf(salesMonth);
  const avgCheck = today.count > 0 ? today.revenue / today.count : 0;

  let skuCount = 0;
  if (locationId) {
    skuCount = await prisma.stockBalance.count({
      where: { locationType, locationId, quantity: { gt: 0 } },
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
      todaySalesCount: today.count,
      todayRevenue: today.revenue,
      todayProfit: today.profit,
      monthProfit: month.profit,
      monthRevenue: month.revenue,
      avgCheck: Math.round(avgCheck * 100) / 100,
      lastStaffLoginAt: staffLastLogin?.lastLoginAt ?? null,
      lastStaffLoginName: staffLastLogin?.name ?? null,
      lastSaleAt: lastSale?.createdAt ?? null,
      lastRevisionAt: lastRevision?.createdAt ?? null,
      lastRevisionStatus: lastRevision?.status ?? null,
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
      ...(query.categoryId || query.brandId
        ? {
            product: {
              ...(query.categoryId ? { categoryId: query.categoryId } : {}),
              ...(query.brandId ? { brandId: query.brandId } : {}),
            },
          }
        : {}),
    },
    include: {
      product: {
        include: {
          brand: true,
          category: true,
          unit: true,
        },
      },
    },
  });

  let rows = balances.map((b) => {
    const qty = decimalToNumber(b.quantity);
    const minStock = decimalToNumber(b.product.minStock);
    const st = stockStatus(qty, minStock);
    return {
      id: b.id,
      productId: b.productId,
      quantity: qty,
      minStock,
      salePrice: decimalToNumber(b.product.salePrice),
      status: st,
      product: {
        name: b.product.name,
        imageUrl: b.product.brand?.imageUrl ?? null,
        brand: b.product.brand ? { id: b.product.brand.id, name: b.product.brand.name } : null,
        category: b.product.category
          ? { id: b.product.category.id, name: b.product.category.name }
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
  const items = rows.slice(start, start + pageSize);

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
  pageSize = 20
) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const where = { storeId };
  const [total, rows] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((s) => ({
      id: s.id,
      number: s.id.slice(-8).toUpperCase(),
      createdAt: s.createdAt,
      seller: s.seller,
      discountAmount: decimalToNumber(s.discountAmount),
      total: decimalToNumber(s.total),
      paymentMethod: s.paymentMethod,
      status: s.status,
      items: s.items.map((it) => ({
        productName: it.product.name,
        quantity: decimalToNumber(it.quantity),
        salePrice: decimalToNumber(it.salePrice),
        isGift: it.isGift,
      })),
    })),
  };
}

export async function getStoreDiscountHistory(companyId: string, storeId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const rows = await prisma.discountRequest.findMany({
    where: {
      OR: [
        { sale: { storeId } },
        { requester: { storeId } },
      ],
    },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    requester: r.requester,
    reviewer: r.reviewer,
    reason: r.reason,
    amount: decimalToNumber(r.amount),
    percent: r.percent != null ? decimalToNumber(r.percent) : null,
    status: r.status,
    reviewNote: r.reviewNote,
  }));
}

export async function getStoreReturnHistory(companyId: string, storeId: string) {
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId } });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const rows = await prisma.saleReturn.findMany({
    where: { sale: { storeId } },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      sale: {
        include: {
          items: {
            include: { product: { select: { name: true } } },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    reason: r.reason,
    status: r.status,
    requester: r.requester,
    reviewer: r.reviewer,
    products: r.sale.items.map((it) => ({
      name: it.product.name,
      quantity: decimalToNumber(it.quantity),
    })),
  }));
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

  const isOwner = viewerRole === Role.OWNER;

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
        items: s.items.map((it) => ({
          productId: it.productId,
          countedQty: decimalToNumber(it.countedQty),
        })),
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
