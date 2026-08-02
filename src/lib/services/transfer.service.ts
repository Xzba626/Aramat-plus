import { BatchOrigin, LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { checkLowBottleStockAfterTransfer } from "@/lib/services/packaging.service";

export type TransferLineInput = {
  productId: string;
  quantity: number;
};

export async function createTransfer(params: {
  companyId: string;
  fromWarehouseId: string;
  toStoreId: string;
  createdById: string;
  items: TransferLineInput[];
  notes?: string;
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
    async (tx) => {
      const transfer = await tx.transfer.create({
        data: {
          fromWarehouseId: warehouse.id,
          toStoreId: store.id,
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
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
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
            locationId: store.id,
            quantity: slice.quantity,
            costPerUnit: slice.costPerUnit,
            notes: `transfer:${transfer.id}`,
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
        action: "TRANSFER_CREATE",
        entityType: "Transfer",
        entityId: transfer.id,
        comment: `${warehouse.name} → ${store.name}`,
        metadata: {
          itemCount: params.items.length,
          items: params.items,
          fromWarehouseId: warehouse.id,
          toStoreId: store.id,
        },
      });

      const packagingProductIds = params.items
        .map((i) => i.productId)
        .filter(Boolean);

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

      return { result, packagingProductIds, storeName: store.name, storeId: store.id };
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  void checkLowBottleStockAfterTransfer({
    companyId: params.companyId,
    storeId: txResult.storeId,
    storeName: txResult.storeName,
    productIds: txResult.packagingProductIds,
  }).catch((err) =>
    console.error("[createTransfer] bottle low-stock notify failed", err)
  );

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

export async function listTransfers(companyId: string) {
  return prisma.transfer.findMany({
    where: {
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
