import { BatchOrigin, LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

const WAREHOUSE_ACTIONS = [
  "PRODUCT_CREATE",
  "PRODUCT_UPDATE",
  "BATCH_CREATE",
  "TRANSFER_CREATE",
  "WAREHOUSE_RETURN_IN",
  "CATEGORY_CREATE",
  "CATEGORY_UPDATE",
  "BRAND_CREATE",
  "BRAND_UPDATE",
  "PRICE_CHANGE",
  "WRITE_OFF",
];

export async function getCentralWarehouse(companyId: string) {
  return prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
}

export async function getWarehouseOverview(companyId: string, showFinance: boolean) {
  const warehouse = await getCentralWarehouse(companyId);
  if (!warehouse) {
    return {
      warehouse: null,
      skuCount: 0,
      unitsTotal: 0,
      batchCount: 0,
      lowStockCount: 0,
      emptyStockCount: 0,
      categoryCount: 0,
      totalCost: 0,
      totalSaleValue: 0,
      potentialProfit: 0,
      productCount: 0,
      recentReceipts: [],
      recentTransfers: [],
      recentReturns: [],
      recentWriteOffs: [],
      recentMovements: [],
      lowStockItems: [],
      emptyStockItems: [],
    };
  }

  const [
    products,
    categories,
    batches,
    balances,
    transfers,
    purchaseBatches,
    returns,
    writeOffs,
    movements,
    allActiveProducts,
  ] = await Promise.all([
    prisma.product.count({ where: { companyId, isActive: true } }),
    prisma.category.count({ where: { companyId, isArchived: false } }),
    prisma.batch.count({
      where: {
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: { gt: 0 },
      },
    }),
    prisma.stockBalance.findMany({
      where: {
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      },
      include: {
        product: {
          select: {
            id: true,
            minStock: true,
            salePrice: true,
            name: true,
            isActive: true,
          },
        },
      },
    }),
    prisma.transfer.findMany({
      where: { fromWarehouseId: warehouse.id },
      include: {
        toStore: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.batch.findMany({
      where: {
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        origin: BatchOrigin.PURCHASE,
      },
      include: {
        product: { select: { name: true } },
        supplier: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: { companyId, action: "WAREHOUSE_RETURN_IN" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: { companyId, action: "WRITE_OFF" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.activityLog.findMany({
      where: {
        companyId,
        action: {
          in: ["BATCH_CREATE", "TRANSFER_CREATE", "WAREHOUSE_RETURN_IN", "WRITE_OFF"],
        },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.product.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  const batchRows = await prisma.batch.findMany({
    where: {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: { gt: 0 },
    },
    select: { quantity: true, costPerUnit: true },
  });

  let unitsTotal = 0;
  let lowStockCount = 0;
  let totalSaleValue = 0;
  const lowStockItems: Array<{
    productId: string;
    name: string;
    quantity: number;
    minStock: number;
  }> = [];
  const qtyByProduct = new Map<string, number>();

  for (const b of balances) {
    const qty = decimalToNumber(b.quantity);
    qtyByProduct.set(b.productId, qty);
    unitsTotal += qty;
    const min = decimalToNumber(b.product.minStock) || 5;
    if (qty > 0 && qty <= min) {
      lowStockCount += 1;
      if (lowStockItems.length < 8) {
        lowStockItems.push({
          productId: b.productId,
          name: b.product.name,
          quantity: qty,
          minStock: min,
        });
      }
    }
    if (showFinance && qty > 0) {
      totalSaleValue += qty * decimalToNumber(b.product.salePrice);
    }
  }

  const emptyStockItems: Array<{ productId: string; name: string }> = [];
  for (const p of allActiveProducts) {
    const qty = qtyByProduct.get(p.id) ?? 0;
    if (qty <= 0) emptyStockItems.push({ productId: p.id, name: p.name });
  }

  const totalCost = showFinance
    ? batchRows.reduce(
        (s, b) => s + decimalToNumber(b.quantity) * decimalToNumber(b.costPerUnit),
        0
      )
    : 0;

  const potentialProfit = showFinance
    ? Math.round((totalSaleValue - totalCost) * 100) / 100
    : 0;

  return {
    warehouse,
    skuCount: balances.filter((b) => decimalToNumber(b.quantity) > 0).length,
    productCount: products,
    categoryCount: categories,
    unitsTotal: Math.round(unitsTotal * 1000) / 1000,
    batchCount: batches,
    lowStockCount,
    emptyStockCount: emptyStockItems.length,
    totalCost: Math.round(totalCost * 100) / 100,
    totalSaleValue: Math.round(totalSaleValue * 100) / 100,
    potentialProfit,
    lowStockItems,
    emptyStockItems: emptyStockItems.slice(0, 8),
    recentReceipts: purchaseBatches.map((b) => {
      const orig = decimalToNumber(b.originalQuantity ?? b.quantity);
      const cost = decimalToNumber(b.costPerUnit);
      return {
        id: b.id,
        createdAt: b.receivedAt,
        userName: b.createdBy?.name ?? "",
        comment: b.notes,
        productName: b.product.name,
        supplierName: b.supplier?.name ?? null,
        totalCost: showFinance ? Math.round(orig * cost * 100) / 100 : null,
      };
    }),
    recentTransfers: transfers.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      storeName: t.toStore.name,
      userName: t.createdBy.name,
      itemCount: t.items.length,
      products: t.items.map((i) => i.product.name).slice(0, 3),
    })),
    recentReturns: returns.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userName: r.user?.name ?? "",
      comment: r.comment,
    })),
    recentWriteOffs: writeOffs.map((w) => ({
      id: w.id,
      createdAt: w.createdAt,
      userName: w.user?.name ?? "",
      comment: w.comment,
    })),
    recentMovements: movements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      userName: m.user?.name ?? "",
      action: m.action,
      comment: m.comment,
    })),
  };
}

export async function listPurchaseHistory(
  companyId: string,
  opts?: { showFinance?: boolean; take?: number }
) {
  const warehouse = await getCentralWarehouse(companyId);
  if (!warehouse) return { warehouse: null, purchases: [] as const };

  const take = opts?.take ?? 100;
  const showFinance = Boolean(opts?.showFinance);

  const batches = await prisma.batch.findMany({
    where: {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      origin: BatchOrigin.PURCHASE,
    },
    include: {
      product: { include: { brand: true, unit: true } },
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { receivedAt: "desc" },
    take,
  });

  return {
    warehouse,
    purchases: batches.map((b) => {
      const qty = decimalToNumber(b.originalQuantity ?? b.quantity);
      const cost = decimalToNumber(b.costPerUnit);
      return {
        id: b.id,
        productId: b.productId,
        receivedAt: b.receivedAt.toISOString(),
        quantity: qty,
        remainingQty: decimalToNumber(b.quantity),
        costPerUnit: cost,
        totalCost: showFinance ? Math.round(qty * cost * 100) / 100 : null,
        notes: b.notes,
        supplier: b.supplier,
        createdBy: b.createdBy,
        product: {
          name: b.product.name,
          unit: b.product.unit ? { symbol: b.product.unit.symbol } : null,
          brand: b.product.brand?.name ?? null,
        },
      };
    }),
  };
}

export async function getWarehouseStockBreakdown(companyId: string, showFinance: boolean) {
  const warehouse = await getCentralWarehouse(companyId);
  if (!warehouse) return { items: [] };

  const balances = await prisma.stockBalance.findMany({
    where: {
      OR: [
        { locationType: LocationType.WAREHOUSE, locationId: warehouse.id },
        { locationType: LocationType.STORE },
      ],
      product: { companyId },
    },
    include: {
      product: {
        include: { brand: true, category: true, unit: true },
      },
    },
  });

  const storeBalances = balances.filter((b) => b.locationType === LocationType.STORE);
  const storeIds = [...new Set(storeBalances.map((b) => b.locationId))];
  const stores = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true },
  });
  const storeMap = new Map(stores.map((s) => [s.id, s.name]));

  const productIds = [...new Set(balances.map((b) => b.productId))];

  const batches = await prisma.batch.findMany({
    where: {
      productId: { in: productIds },
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
  });

  const batchesByProductLoc = new Map<string, typeof batches>();
  for (const b of batches) {
    const key = `${b.productId}:${b.locationType}:${b.locationId}`;
    const list = batchesByProductLoc.get(key) ?? [];
    list.push(b);
    batchesByProductLoc.set(key, list);
  }

  const byProduct = new Map<
    string,
    {
      product: (typeof balances)[0]["product"];
      warehouseQty: number;
      storeQty: number;
      totalQty: number;
      stores: { storeId: string; storeName: string; qty: number }[];
      warehouseBatches: Array<{
        id: string;
        qty: number;
        costPerUnit?: number;
        receivedAt: Date;
        notes: string | null;
      }>;
    }
  >();

  for (const b of balances) {
    const qty = decimalToNumber(b.quantity);
    if (qty <= 0) continue;

    let row = byProduct.get(b.productId);
    if (!row) {
      row = {
        product: b.product,
        warehouseQty: 0,
        storeQty: 0,
        totalQty: 0,
        stores: [],
        warehouseBatches: [],
      };
      byProduct.set(b.productId, row);
    }

    if (b.locationType === LocationType.WAREHOUSE) {
      row.warehouseQty += qty;
    } else {
      row.storeQty += qty;
      row.stores.push({
        storeId: b.locationId,
        storeName: storeMap.get(b.locationId) ?? "",
        qty,
      });
    }
    row.totalQty = row.warehouseQty + row.storeQty;
  }

  for (const [productId, row] of byProduct) {
    const key = `${productId}:${LocationType.WAREHOUSE}:${warehouse.id}`;
    const whBatches = batchesByProductLoc.get(key) ?? [];
    row.warehouseBatches = whBatches.map((b) => ({
      id: b.id,
      qty: decimalToNumber(b.quantity),
      ...(showFinance ? { costPerUnit: decimalToNumber(b.costPerUnit) } : {}),
      receivedAt: b.receivedAt,
      notes: b.notes,
    }));
  }

  return {
    items: [...byProduct.values()].sort((a, b) =>
      a.product.name.localeCompare(b.product.name, "ru")
    ),
  };
}

export async function getWarehouseHistory(
  companyId: string,
  limit = 100,
  offset = 0
) {
  const logs = await prisma.activityLog.findMany({
    where: {
      companyId,
      OR: [
        { action: { in: WAREHOUSE_ACTIONS } },
        { entityType: { in: ["Product", "Batch", "Transfer", "Category", "Brand"] } },
      ],
    },
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    skip: offset,
  });

  const total = await prisma.activityLog.count({
    where: {
      companyId,
      OR: [
        { action: { in: WAREHOUSE_ACTIONS } },
        { entityType: { in: ["Product", "Batch", "Transfer", "Category", "Brand"] } },
      ],
    },
  });

  return {
    total,
    items: logs.map((log) => ({
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      comment: log.comment,
      ip: log.ip,
      result: log.result,
      user: log.user
        ? { name: log.user.name, role: log.user.role }
        : null,
      metadata: log.metadata,
    })),
  };
}
