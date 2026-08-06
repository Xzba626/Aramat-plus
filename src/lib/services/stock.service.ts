import { BatchOrigin, LocationType, Prisma } from "@prisma/client";
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
      throw new Error("INSUFFICIENT_STOCK");
    }
    return tx.stockBalance.update({
      where: { id: existing.id },
      data: { quantity: next },
    });
  }

  if (delta.lt(0)) {
    throw new Error("INSUFFICIENT_STOCK");
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
): Promise<
  Array<{
    batchId: string;
    quantity: Prisma.Decimal;
    costPerUnit: Prisma.Decimal;
    salePrice: Prisma.Decimal;
  }>
> {
  const need = new Prisma.Decimal(params.quantity.toString());
  if (need.lte(0)) throw new Error("QTY_MUST_BE_POSITIVE");

  // Minimal columns — uses index (productId, locationType, locationId, receivedAt)
  const batches = await tx.batch.findMany({
    where: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
    select: { id: true, quantity: true, costPerUnit: true, salePrice: true },
  });

  let remaining = need;
  const consumed: Array<{
    batchId: string;
    quantity: Prisma.Decimal;
    costPerUnit: Prisma.Decimal;
    salePrice: Prisma.Decimal;
    nextQty: Prisma.Decimal;
  }> = [];

  for (const batch of batches) {
    if (remaining.lte(0)) break;
    const take = Prisma.Decimal.min(batch.quantity, remaining);
    if (batch.salePrice == null) {
      throw new Error("BATCH_SALE_PRICE_MISSING");
    }
    consumed.push({
      batchId: batch.id,
      quantity: take,
      costPerUnit: batch.costPerUnit,
      salePrice: batch.salePrice,
      nextQty: batch.quantity.sub(take),
    });
    remaining = remaining.sub(take);
  }

  if (remaining.gt(0)) {
    throw new Error("INSUFFICIENT_BATCH_STOCK");
  }

  // One round-trip: apply all batch qty changes + atomic balance decrement
  {
    const valueRows = consumed.map(
      (c) => Prisma.sql`(${c.batchId}::text, ${c.nextQty}::numeric)`
    );
    const bal = await tx.$executeRaw`
      WITH batch_upd AS (
        UPDATE "Batch" AS b
        SET
          quantity = v.qty,
          "updatedAt" = CURRENT_TIMESTAMP
        FROM (VALUES ${Prisma.join(valueRows)}) AS v(id, qty)
        WHERE b.id = v.id
        RETURNING b.id
      )
      UPDATE "StockBalance"
      SET
        quantity = quantity - ${need},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE
        "productId" = ${params.productId}
        AND "locationType" = CAST(${params.locationType} AS "LocationType")
        AND "locationId" = ${params.locationId}
        AND quantity >= ${need}
        AND EXISTS (SELECT 1 FROM batch_upd)
    `;
    if (Number(bal) === 0) {
      throw new Error("INSUFFICIENT_STOCK");
    }
  }

  return consumed.map(({ batchId, quantity, costPerUnit, salePrice }) => ({
    batchId,
    quantity,
    costPerUnit,
    salePrice,
  }));
}

export async function addBatch(
  tx: Tx,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    quantity: Prisma.Decimal | number;
    costPerUnit: Prisma.Decimal | number;
    /** Required for new batches — FIFO-layer sale price (immutable after create). */
    salePrice: Prisma.Decimal | number;
    receivedAt?: Date;
    notes?: string;
    transferItemId?: string;
    origin?: BatchOrigin;
    supplierId?: string | null;
    createdById?: string | null;
  }
) {
  const quantity = new Prisma.Decimal(params.quantity.toString());
  const costPerUnit = new Prisma.Decimal(params.costPerUnit.toString());
  const salePrice = new Prisma.Decimal(params.salePrice.toString());
  if (quantity.lte(0)) throw new Error("BATCH_QTY_MUST_BE_POSITIVE");
  if (salePrice.lt(0)) throw new Error("VALIDATION_ERROR");

  const batch = await tx.batch.create({
    data: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity,
      initialQuantity: quantity,
      costPerUnit,
      salePrice,
      receivedAt: params.receivedAt ?? new Date(),
      notes: params.notes,
      transferItemId: params.transferItemId,
      origin: params.origin ?? BatchOrigin.PURCHASE,
      supplierId: params.supplierId ?? null,
      createdById: params.createdById ?? null,
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

/** Oldest open batch sale price at location (POS card estimate only). */
export async function getFifoFrontSalePrice(params: {
  productId: string;
  locationType: LocationType;
  locationId: string;
}): Promise<number | null> {
  const batch = await prisma.batch.findFirst({
    where: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
    select: { salePrice: true },
  });
  if (!batch?.salePrice) return null;
  return Number(batch.salePrice);
}

export async function getWarehouseStock(
  companyId: string,
  warehouseId?: string,
  opts?: { includeZero?: boolean }
) {
  const warehouse =
    warehouseId != null
      ? await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } })
      : await prisma.warehouse.findFirst({ where: { companyId, isActive: true } });

  if (!warehouse) return { warehouse: null, items: [] };

  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      ...(opts?.includeZero ? {} : { quantity: { gt: 0 } }),
      product: { isActive: true },
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
    orderBy: { updatedAt: "desc" },
  });

  // Exclude packaging consumables from merchandise stock lists (POS / sellable views
  // filter again; overview KPIs use STANDARD-only queries).
  const merchandise = balances.filter(
    (b) => b.product.kind !== "PACKAGING"
  );

  const productIds = merchandise.map((b) => b.productId);
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
    items: merchandise.map((bal) => ({
      ...bal,
      batches: batchesByProduct.get(bal.productId) ?? [],
    })),
  };
}

export async function getStoreStock(
  storeId: string,
  opts?: { includeZero?: boolean }
) {
  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: LocationType.STORE,
      locationId: storeId,
      // POS catalog needs qty=0 rows so cards stay visible as OUT
      ...(opts?.includeZero === false ? { quantity: { gt: 0 } } : {}),
      product: { isActive: true },
    },
    include: {
      product: {
        include: { brand: true, unit: true, category: true, productType: true },
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
