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
  "SUPPLIER_CREATE",
];

/** Purchase stock-in only (exclude transfers + returns). */
const PURCHASE_BATCH_WHERE: Prisma.BatchWhereInput = {
  transferItemId: null,
  NOT: {
    OR: [
      { notes: { startsWith: "warehouse_return:" } },
      { notes: { startsWith: "sale_return:" } },
    ],
  },
};

export async function getCentralWarehouse(companyId: string) {
  return prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
}

export type OverviewProductAlert = {
  id: string;
  name: string;
  quantity: number;
  minStock: number;
};

export async function getWarehouseOverview(companyId: string, showFinance: boolean) {
  const warehouse = await getCentralWarehouse(companyId);
  if (!warehouse) {
    return {
      warehouse: null,
      skuCount: 0,
      unitsTotal: 0,
      batchCount: 0,
      categoryCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      productCount: 0,
      totalPurchaseCost: 0,
      totalCost: 0,
      totalSaleValue: 0,
      potentialProfit: 0,
      lowStockItems: [] as OverviewProductAlert[],
      outOfStockItems: [] as OverviewProductAlert[],
      recentReceipts: [],
      recentTransfers: [],
      recentMovements: [],
      recentWriteOffs: [],
    };
  }

  const [
    products,
    categoryCount,
    activeProducts,
    batchesWithStock,
    balances,
    transfers,
    receiptBatches,
    writeOffs,
    allReceiptBatches,
  ] = await Promise.all([
    prisma.product.count({ where: { companyId, isActive: true } }),
    prisma.category.count({ where: { companyId, isArchived: false } }),
    prisma.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        minStock: true,
        salePrice: true,
      },
    }),
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
        product: { select: { id: true, name: true, minStock: true, salePrice: true, isActive: true } },
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
        product: { companyId },
        ...PURCHASE_BATCH_WHERE,
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
      where: { companyId, action: "WRITE_OFF" },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    showFinance
      ? prisma.batch.findMany({
          where: {
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            product: { companyId },
            ...PURCHASE_BATCH_WHERE,
          },
          select: { initialQuantity: true, costPerUnit: true, quantity: true },
        })
      : Promise.resolve(
          [] as Array<{
            initialQuantity: Prisma.Decimal;
            costPerUnit: Prisma.Decimal;
            quantity: Prisma.Decimal;
          }>
        ),
  ]);

  const balanceByProduct = new Map(
    balances.map((b) => [b.productId, decimalToNumber(b.quantity)])
  );

  let unitsTotal = 0;
  let totalSaleValue = 0;
  const lowStockItems: OverviewProductAlert[] = [];
  const outOfStockItems: OverviewProductAlert[] = [];

  for (const p of activeProducts) {
    const qty = balanceByProduct.get(p.id) ?? 0;
    const min = decimalToNumber(p.minStock) || 5;
    if (qty > 0) {
      unitsTotal += qty;
      if (showFinance) {
        totalSaleValue += qty * decimalToNumber(p.salePrice);
      }
      if (qty <= min) {
        lowStockItems.push({
          id: p.id,
          name: p.name,
          quantity: qty,
          minStock: min,
        });
      }
    } else {
      outOfStockItems.push({
        id: p.id,
        name: p.name,
        quantity: 0,
        minStock: min,
      });
    }
  }

  lowStockItems.sort((a, b) => a.quantity - b.quantity);
  outOfStockItems.sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const stockBatches = await prisma.batch.findMany({
    where: {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: { gt: 0 },
    },
    select: { quantity: true, costPerUnit: true },
  });

  const totalCost = showFinance
    ? stockBatches.reduce(
        (s, b) => s + decimalToNumber(b.quantity) * decimalToNumber(b.costPerUnit),
        0
      )
    : 0;

  const totalPurchaseCost = showFinance
    ? allReceiptBatches.reduce(
        (s, b) =>
          s + decimalToNumber(b.initialQuantity) * decimalToNumber(b.costPerUnit),
        0
      )
    : 0;

  const potentialProfit = showFinance ? totalSaleValue - totalCost : 0;

  const recentMovements = await prisma.activityLog.findMany({
    where: {
      companyId,
      action: { in: ["TRANSFER_CREATE", "WAREHOUSE_RETURN_IN", "WRITE_OFF", "BATCH_CREATE"] },
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return {
    warehouse,
    skuCount: balances.filter((b) => decimalToNumber(b.quantity) > 0).length,
    productCount: products,
    categoryCount,
    unitsTotal: Math.round(unitsTotal * 1000) / 1000,
    batchCount: batchesWithStock,
    lowStockCount: lowStockItems.length,
    outOfStockCount: outOfStockItems.length,
    totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalSaleValue: Math.round(totalSaleValue * 100) / 100,
    potentialProfit: Math.round(potentialProfit * 100) / 100,
    lowStockItems: lowStockItems.slice(0, 8),
    outOfStockItems: outOfStockItems.slice(0, 8),
    recentReceipts: receiptBatches.map((b) => ({
      id: b.id,
      createdAt: b.receivedAt,
      userName: b.createdBy?.name ?? "",
      productName: b.product.name,
      quantity: decimalToNumber(b.initialQuantity),
      supplierName: b.supplier?.name ?? null,
      comment: b.notes,
    })),
    recentTransfers: transfers.map((t) => ({
      id: t.id,
      createdAt: t.createdAt,
      storeName: t.toStore.name,
      userName: t.createdBy.name,
      itemCount: t.items.length,
      products: t.items.map((i) => i.product.name).slice(0, 3),
    })),
    recentMovements: recentMovements.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      action: m.action,
      userName: m.user?.name ?? "",
      comment: m.comment,
    })),
    recentWriteOffs: writeOffs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userName: r.user?.name ?? "",
      comment: r.comment,
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
      const qty = decimalToNumber(b.initialQuantity);
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
        {
          entityType: {
            in: ["Product", "Batch", "Transfer", "Category", "Brand", "Supplier"],
          },
        },
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
        {
          entityType: {
            in: ["Product", "Batch", "Transfer", "Category", "Brand", "Supplier"],
          },
        },
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
