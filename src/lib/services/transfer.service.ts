import { BatchOrigin, LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { checkLowBottleStockAfterTransfer } from "@/lib/services/packaging.service";
import { BATCH_NOTE_MARKERS } from "@/lib/i18n/labels";

export type TransferLineInput = {
  productId: string;
  quantity: number;
};

export type TransferPurpose = "NORMAL" | "INITIAL_STORE_STOCK";

type Tx = Prisma.TransactionClient;

type WhStoreActors = {
  companyId: string;
  warehouse: { id: string; name: string };
  store: { id: string; name: string };
  createdById: string;
  items: TransferLineInput[];
  /** Free-text notes for NORMAL transfers only. */
  notes?: string | null;
  purpose?: TransferPurpose;
};

/**
 * Core WH→Store FIFO move. Caller owns the transaction.
 * INITIAL_STORE_STOCK uses restoration markers (not “sent today”).
 */
export async function executeWarehouseToStoreTransferInTx(
  tx: Tx,
  params: WhStoreActors
) {
  if (!params.items.length) throw new Error("EMPTY_CART");

  const purpose = params.purpose ?? "NORMAL";
  const isInitial = purpose === "INITIAL_STORE_STOCK";
  const transferNotes = isInitial
    ? BATCH_NOTE_MARKERS.INITIAL_STORE_STOCK
    : params.notes?.trim() || null;

  const transfer = await tx.transfer.create({
    data: {
      fromWarehouseId: params.warehouse.id,
      toStoreId: params.store.id,
      createdById: params.createdById,
      status: "COMPLETED",
      notes: transferNotes,
    },
  });

  for (const line of params.items) {
    const qty = new Prisma.Decimal(line.quantity);
    if (qty.lte(0)) throw new Error("QTY_MUST_BE_POSITIVE");

    const product = await tx.product.findFirst({
      where: {
        id: line.productId,
        companyId: params.companyId,
        isActive: true,
      },
    });
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (isInitial && product.kind === "PACKAGING") {
      throw new Error("PACKAGING_NOT_ALLOWED");
    }

    const consumed = await deductBatchesFifo(tx, {
      productId: line.productId,
      locationType: LocationType.WAREHOUSE,
      locationId: params.warehouse.id,
      quantity: qty,
    });

    for (const slice of consumed) {
      const item = await tx.transferItem.create({
        data: {
          transferId: transfer.id,
          productId: line.productId,
          quantity: slice.quantity,
          sourceBatchId: slice.batchId,
          costPerUnit: slice.costPerUnit,
        },
      });

      await addBatch(tx, {
        productId: line.productId,
        locationType: LocationType.STORE,
        locationId: params.store.id,
        quantity: slice.quantity,
        costPerUnit: slice.costPerUnit,
        salePrice: slice.salePrice,
        notes: isInitial
          ? `${BATCH_NOTE_MARKERS.INITIAL_STORE_STOCK}:${transfer.id}`
          : `transfer:${transfer.id}`,
        transferItemId: item.id,
        origin: isInitial ? BatchOrigin.INITIAL : BatchOrigin.TRANSFER,
        createdById: params.createdById,
      });
    }
  }

  await logActivity({
    tx,
    userId: params.createdById,
    companyId: params.companyId,
    action: isInitial ? "INITIAL_STORE_STOCK" : "TRANSFER_CREATE",
    entityType: "Transfer",
    entityId: transfer.id,
    comment: isInitial
      ? `${params.warehouse.name} → ${params.store.name}`
      : `${params.warehouse.name} → ${params.store.name}`,
    metadata: {
      purpose,
      itemCount: params.items.length,
      items: params.items,
      fromWarehouseId: params.warehouse.id,
      toStoreId: params.store.id,
      restoration: isInitial,
    },
  });

  const result = await tx.transfer.findUniqueOrThrow({
    where: { id: transfer.id },
    include: {
      items: { include: { product: true } },
      toStore: true,
      fromWarehouse: true,
      fromStore: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  const packagingProductIds = isInitial
    ? []
    : (
        await tx.product.findMany({
          where: {
            id: { in: params.items.map((i) => i.productId) },
            kind: "PACKAGING",
          },
          select: { id: true },
        })
      ).map((p) => p.id);

  return {
    result,
    packagingProductIds,
    storeName: params.store.name,
    storeId: params.store.id,
    isInitial,
  };
}

async function notifyAfterWhTransfer(params: {
  companyId: string;
  fromWarehouseId: string;
  storeId: string;
  storeName: string;
  items: TransferLineInput[];
  packagingProductIds: string[];
  /** Initial stock must not look like a live transfer alert. Low-stock still OK. */
  skipTransferSideEffects?: boolean;
}) {
  if (!params.skipTransferSideEffects) {
    void checkLowBottleStockAfterTransfer({
      companyId: params.companyId,
      storeId: params.storeId,
      storeName: params.storeName,
      productIds: params.packagingProductIds,
    }).catch((err) =>
      console.error("[createTransfer] bottle low-stock notify failed", err)
    );
  }

  void (async () => {
    const {
      getLowStockThresholds,
      maybeNotifyLowMerchandiseStock,
    } = await import("@/lib/services/low-stock-thresholds.service");
    const { getQtyAtLocation } = await import("@/lib/services/stock.service");
    const thresholds = await getLowStockThresholds(params.companyId);
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: params.fromWarehouseId, companyId: params.companyId },
    });
    if (!warehouse) return;
    for (const line of params.items) {
      const product = await prisma.product.findFirst({
        where: { id: line.productId, companyId: params.companyId },
        select: { id: true, name: true, accountingType: true, kind: true },
      });
      if (!product || product.kind === "PACKAGING") continue;
      const qtyAfter = await getQtyAtLocation({
        productId: line.productId,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      });
      await maybeNotifyLowMerchandiseStock({
        companyId: params.companyId,
        locationType: LocationType.WAREHOUSE,
        locationName: warehouse.name,
        productId: product.id,
        productName: product.name,
        accountingType: product.accountingType,
        qtyAfter,
        thresholds,
      });
      // Store may now be below threshold after receiving a small initial qty — check store too
      const storeQty = await getQtyAtLocation({
        productId: line.productId,
        locationType: LocationType.STORE,
        locationId: params.storeId,
      });
      await maybeNotifyLowMerchandiseStock({
        companyId: params.companyId,
        locationType: LocationType.STORE,
        locationName: params.storeName,
        productId: product.id,
        productName: product.name,
        accountingType: product.accountingType,
        qtyAfter: storeQty,
        thresholds,
        storeId: params.storeId,
      });
    }
  })().catch((err) =>
    console.error("[createTransfer] merchandise low-stock notify failed", err)
  );
}

export async function createTransfer(params: {
  companyId: string;
  fromWarehouseId: string;
  toStoreId: string;
  createdById: string;
  items: TransferLineInput[];
  notes?: string;
  purpose?: TransferPurpose;
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");

  const warehouse = await prisma.warehouse.findFirst({
    where: { id: params.fromWarehouseId, companyId: params.companyId },
  });
  if (!warehouse) throw new Error("WAREHOUSE_MISSING");

  const store = await prisma.store.findFirst({
    where: {
      id: params.toStoreId,
      companyId: params.companyId,
      isActive: true,
      kind: "BRANCH",
    },
  });
  if (!store) throw new Error("TRANSFER_BRANCH_ONLY");

  const txResult = await prisma.$transaction(
    async (tx) =>
      executeWarehouseToStoreTransferInTx(tx, {
        companyId: params.companyId,
        warehouse: { id: warehouse.id, name: warehouse.name },
        store: { id: store.id, name: store.name },
        createdById: params.createdById,
        items: params.items,
        notes: params.notes,
        purpose: params.purpose ?? "NORMAL",
      }),
    { maxWait: 15_000, timeout: 60_000 }
  );

  void notifyAfterWhTransfer({
    companyId: params.companyId,
    fromWarehouseId: warehouse.id,
    storeId: txResult.storeId,
    storeName: txResult.storeName,
    items: params.items,
    packagingProductIds: txResult.packagingProductIds,
    skipTransferSideEffects: txResult.isInitial,
  });

  return txResult.result;
}

/** Store A → Store B (FIFO cost preserved). */
export async function createStoreTransfer(params: {
  companyId: string;
  fromStoreId: string;
  toStoreId: string;
  createdById: string;
  items: TransferLineInput[];
  notes?: string;
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");
  if (params.fromStoreId === params.toStoreId) {
    throw new Error("VALIDATION_ERROR");
  }

  const [fromStore, toStore] = await Promise.all([
    prisma.store.findFirst({
      where: {
        id: params.fromStoreId,
        companyId: params.companyId,
        isActive: true,
        kind: "BRANCH",
      },
    }),
    prisma.store.findFirst({
      where: {
        id: params.toStoreId,
        companyId: params.companyId,
        isActive: true,
        kind: "BRANCH",
      },
    }),
  ]);
  if (!fromStore || !toStore) throw new Error("STORE_NOT_FOUND");

  const txResult = await prisma.$transaction(
    async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          fromStoreId: fromStore.id,
          toStoreId: toStore.id,
          createdById: params.createdById,
          status: "COMPLETED",
          notes: params.notes,
        },
      });

      for (const line of params.items) {
        const qty = new Prisma.Decimal(line.quantity);
        if (qty.lte(0)) throw new Error("QTY_MUST_BE_POSITIVE");

        const product = await tx.product.findFirst({
          where: {
            id: line.productId,
            companyId: params.companyId,
            isActive: true,
          },
        });
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const consumed = await deductBatchesFifo(tx, {
          productId: line.productId,
          locationType: LocationType.STORE,
          locationId: fromStore.id,
          quantity: qty,
        });

        for (const slice of consumed) {
          const item = await tx.transferItem.create({
            data: {
              transferId: transfer.id,
              productId: line.productId,
              quantity: slice.quantity,
              sourceBatchId: slice.batchId,
              costPerUnit: slice.costPerUnit,
            },
          });

          await addBatch(tx, {
            productId: line.productId,
            locationType: LocationType.STORE,
            locationId: toStore.id,
            quantity: slice.quantity,
            costPerUnit: slice.costPerUnit,
            salePrice: slice.salePrice,
            notes: `store_transfer:${transfer.id}`,
            transferItemId: item.id,
            origin: BatchOrigin.TRANSFER,
            createdById: params.createdById,
          });
        }
      }

      await logActivity({
        tx,
        userId: params.createdById,
        companyId: params.companyId,
        action: "STORE_TRANSFER_CREATE",
        entityType: "Transfer",
        entityId: transfer.id,
        comment: `${fromStore.name} → ${toStore.name}`,
        metadata: {
          fromStoreId: fromStore.id,
          toStoreId: toStore.id,
          items: params.items,
        },
      });

      return {
        result: await tx.transfer.findUniqueOrThrow({
          where: { id: transfer.id },
          include: {
            items: { include: { product: true } },
            toStore: true,
            fromWarehouse: true,
            fromStore: true,
            createdBy: { select: { id: true, name: true } },
          },
        }),
        packagingProductIds: params.items.map((i) => i.productId),
        storeId: toStore.id,
        storeName: toStore.name,
      };
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  void checkLowBottleStockAfterTransfer({
    companyId: params.companyId,
    storeId: txResult.storeId,
    storeName: txResult.storeName,
    productIds: txResult.packagingProductIds,
  }).catch((err) =>
    console.error("[createStoreTransfer] bottle low-stock notify failed", err)
  );

  return txResult.result;
}

export async function listTransfers(
  companyId: string,
  opts?: { storeId?: string | null }
) {
  const storeId = opts?.storeId;
  if (storeId === null) return [];
  return prisma.transfer.findMany({
    where: storeId
      ? {
          OR: [
            { toStoreId: storeId, toStore: { companyId } },
            { fromStoreId: storeId, fromStore: { companyId } },
          ],
        }
      : {
          OR: [
            { fromWarehouse: { companyId } },
            { fromStore: { companyId } },
            { toStore: { companyId } },
          ],
        },
    include: {
      toStore: true,
      fromWarehouse: true,
      fromStore: true,
      createdBy: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
