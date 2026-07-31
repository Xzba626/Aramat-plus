import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";

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
  if (!params.items.length) {
    throw new Error("EMPTY_CART");
  }

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

  // Neon/PgBouncer: interactive tx needs a direct (non-pooler) URL and enough time.
  // P2028 "Transaction not found" = pooler recycled the connection or tx timed out.
  return prisma.$transaction(
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

      const createdItems = [];

      for (const line of params.items) {
        const qty = new Prisma.Decimal(line.quantity);
        if (qty.lte(0)) throw new Error("QTY_MUST_BE_POSITIVE");

        const product = await tx.product.findFirst({
          where: { id: line.productId, companyId: params.companyId, isActive: true },
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

          // New batch at store — preserves cost, does NOT merge with existing
          await addBatch(tx, {
            productId: line.productId,
            locationType: LocationType.STORE,
            locationId: store.id,
            quantity: slice.quantity,
            costPerUnit: slice.costPerUnit,
            notes: `transfer:${transfer.id}`,
            transferItemId: item.id,
          });

          createdItems.push(item);
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
          items: params.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          fromWarehouseId: warehouse.id,
          toStoreId: store.id,
        },
      });

      return tx.transfer.findUniqueOrThrow({
        where: { id: transfer.id },
        include: {
          items: { include: { product: true } },
          toStore: true,
          fromWarehouse: true,
          createdBy: { select: { id: true, name: true } },
        },
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
}

export async function listTransfers(companyId: string) {
  return prisma.transfer.findMany({
    where: {
      fromWarehouse: { companyId },
    },
    include: {
      toStore: true,
      fromWarehouse: true,
      createdBy: { select: { id: true, name: true } },
      items: { include: { product: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
