import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export async function upsertStockBalance(
  tx: Tx,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    delta: Prisma.Decimal | number;
  }
) {
  const delta = new Prisma.Decimal(params.delta.toString());
  const existing = await tx.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: params.productId,
        locationType: params.locationType,
        locationId: params.locationId,
      },
    },
  });

  if (existing) {
    const next = existing.quantity.add(delta);
    if (next.lt(0)) {
      throw new Error("Недостаточно остатка на складе");
    }
    return tx.stockBalance.update({
      where: { id: existing.id },
      data: { quantity: next },
    });
  }

  if (delta.lt(0)) {
    throw new Error("Недостаточно остатка на складе");
  }

  return tx.stockBalance.create({
    data: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity: delta,
    },
  });
}

/** FIFO: deduct quantity from oldest batches at location. Returns consumed slices. */
export async function deductBatchesFifo(
  tx: Tx,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    quantity: Prisma.Decimal | number;
  }
): Promise<Array<{ batchId: string; quantity: Prisma.Decimal; costPerUnit: Prisma.Decimal }>> {
  let remaining = new Prisma.Decimal(params.quantity.toString());
  if (remaining.lte(0)) throw new Error("Количество должно быть больше нуля");

  const batches = await tx.batch.findMany({
    where: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
  });

  const totalAvailable = batches.reduce(
    (sum, b) => sum.add(b.quantity),
    new Prisma.Decimal(0)
  );
  if (totalAvailable.lt(remaining)) {
    throw new Error("Недостаточно остатка по партиям");
  }

  const consumed: Array<{
    batchId: string;
    quantity: Prisma.Decimal;
    costPerUnit: Prisma.Decimal;
  }> = [];

  for (const batch of batches) {
    if (remaining.lte(0)) break;
    const take = Prisma.Decimal.min(batch.quantity, remaining);
    await tx.batch.update({
      where: { id: batch.id },
      data: { quantity: batch.quantity.sub(take) },
    });
    consumed.push({
      batchId: batch.id,
      quantity: take,
      costPerUnit: batch.costPerUnit,
    });
    remaining = remaining.sub(take);
  }

  await upsertStockBalance(tx, {
    productId: params.productId,
    locationType: params.locationType,
    locationId: params.locationId,
    delta: new Prisma.Decimal(params.quantity.toString()).neg(),
  });

  return consumed;
}

export async function addBatch(
  tx: Tx,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    quantity: Prisma.Decimal | number;
    costPerUnit: Prisma.Decimal | number;
    receivedAt?: Date;
    notes?: string;
    transferItemId?: string;
  }
) {
  const quantity = new Prisma.Decimal(params.quantity.toString());
  const costPerUnit = new Prisma.Decimal(params.costPerUnit.toString());
  if (quantity.lte(0)) throw new Error("Количество партии должно быть больше нуля");

  const batch = await tx.batch.create({
    data: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity,
      costPerUnit,
      receivedAt: params.receivedAt ?? new Date(),
      notes: params.notes,
      transferItemId: params.transferItemId,
    },
  });

  await upsertStockBalance(tx, {
    productId: params.productId,
    locationType: params.locationType,
    locationId: params.locationId,
    delta: quantity,
  });

  return batch;
}

export async function getWarehouseStock(companyId: string, warehouseId?: string) {
  const warehouse =
    warehouseId != null
      ? await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } })
      : await prisma.warehouse.findFirst({ where: { companyId, isActive: true } });

  if (!warehouse) return { warehouse: null, items: [] };

  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: { gt: 0 },
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
    orderBy: { updatedAt: "desc" },
  });

  const productIds = balances.map((b) => b.productId);
  const batches = await prisma.batch.findMany({
    where: {
      productId: { in: productIds },
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
  });

  const batchesByProduct = new Map<string, typeof batches>();
  for (const b of batches) {
    const list = batchesByProduct.get(b.productId) ?? [];
    list.push(b);
    batchesByProduct.set(b.productId, list);
  }

  return {
    warehouse,
    items: balances.map((bal) => ({
      ...bal,
      batches: batchesByProduct.get(bal.productId) ?? [],
    })),
  };
}

export async function getStoreStock(storeId: string) {
  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: LocationType.STORE,
      locationId: storeId,
      quantity: { gt: 0 },
    },
    include: {
      product: {
        include: { brand: true, unit: true, category: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return balances;
}

/** Current qty at a location (0 if no StockBalance row). */
export async function getQtyAtLocation(params: {
  productId: string;
  locationType: LocationType;
  locationId: string;
}): Promise<number> {
  const row = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: params.productId,
        locationType: params.locationType,
        locationId: params.locationId,
      },
    },
  });
  if (!row) return 0;
  return Number(row.quantity);
}
