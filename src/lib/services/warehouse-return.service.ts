import { LocationType, Prisma, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { getCentralWarehouse } from "@/lib/services/warehouse.service";

export type ReturnInLine = {
  productId: string;
  quantity: number;
};

export async function createStoreReturnIn(params: {
  companyId: string;
  storeId: string;
  createdById: string;
  reason?: string;
  items: ReturnInLine[];
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");

  const warehouse = await getCentralWarehouse(params.companyId);
  if (!warehouse) throw new Error("WAREHOUSE_MISSING");

  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      kind: StoreKind.BRANCH,
      isActive: true,
      isArchived: false,
    },
  });
  if (!store) throw new Error("BRANCH_NOT_FOUND");

  const operationId = `ret-${Date.now()}`;

  return prisma.$transaction(async (tx) => {
    const moved: Array<{ productId: string; quantity: Prisma.Decimal }> = [];

    for (const line of params.items) {
      const qty = new Prisma.Decimal(line.quantity);
      if (qty.lte(0)) throw new Error("QTY_MUST_BE_POSITIVE");

      const product = await tx.product.findFirst({
        where: { id: line.productId, companyId: params.companyId, isActive: true },
      });
      if (!product) throw new Error("PRODUCT_NOT_FOUND");

      const consumed = await deductBatchesFifo(tx, {
        productId: line.productId,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: qty,
      });

      for (const slice of consumed) {
        await addBatch(tx, {
          productId: line.productId,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: slice.quantity,
          costPerUnit: slice.costPerUnit,
          notes: `warehouse_return:${store.id}${params.reason ? `:${params.reason}` : ""}`,
        });
      }

      moved.push({ productId: line.productId, quantity: qty });
    }

    await logActivity({
      tx,
      userId: params.createdById,
      companyId: params.companyId,
      action: "WAREHOUSE_RETURN_IN",
      entityType: "WarehouseReturn",
      entityId: operationId,
      comment: `${store.name} → ${warehouse.name}${params.reason ? ` · ${params.reason}` : ""}`,
      metadata: {
        storeId: store.id,
        storeName: store.name,
        items: moved.map((m) => ({
          productId: m.productId,
          quantity: m.quantity.toString(),
        })),
        reason: params.reason ?? null,
      },
    });

    return { operationId, storeId: store.id, itemCount: moved.length };
  });
}

export async function listStoreReturnIns(companyId: string, limit = 20) {
  const logs = await prisma.activityLog.findMany({
    where: { companyId, action: "WAREHOUSE_RETURN_IN" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return logs;
}
