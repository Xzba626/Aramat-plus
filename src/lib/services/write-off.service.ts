import { LocationType, Prisma, WriteOffReasonCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { getCentralWarehouse } from "@/lib/services/warehouse.service";
import { decimalToNumber } from "@/lib/utils";

export type WriteOffLine = {
  productId: string;
  quantity: number;
};

/** Owner write-off from central warehouse (FIFO). Logged as WRITE_OFF. */
export async function createWarehouseWriteOff(params: {
  companyId: string;
  createdById: string;
  reasonCode: WriteOffReasonCode;
  comment?: string;
  items: WriteOffLine[];
}) {
  if (!params.items.length) throw new Error("VALIDATION_ERROR");

  const warehouse = await getCentralWarehouse(params.companyId);
  if (!warehouse) throw new Error("WAREHOUSE_MISSING");

  const operationId = `wo-${Date.now()}`;
  const comment = params.comment?.trim() || params.reasonCode;

  return prisma.$transaction(
    async (tx) => {
      const moved: Array<{
        productId: string;
        quantity: number;
        cost: number;
      }> = [];

      for (const line of params.items) {
        const qty = new Prisma.Decimal(line.quantity);
        if (qty.lte(0)) throw new Error("VALIDATION_ERROR");

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

        const cost = consumed.reduce(
          (sum, s) => sum.add(s.costPerUnit.mul(s.quantity)),
          new Prisma.Decimal(0)
        );

        moved.push({
          productId: line.productId,
          quantity: decimalToNumber(qty),
          cost: decimalToNumber(cost),
        });
      }

      await logActivity({
        tx,
        userId: params.createdById,
        companyId: params.companyId,
        action: "WRITE_OFF",
        entityType: "WriteOff",
        entityId: operationId,
        comment,
        metadata: {
          warehouseId: warehouse.id,
          items: moved,
          reasonCode: params.reasonCode,
          reason: comment,
        },
      });

      return {
        operationId,
        warehouseId: warehouse.id,
        itemCount: moved.length,
        totalCost: moved.reduce((s, m) => s + m.cost, 0),
        reasonCode: params.reasonCode,
      };
    },
    { timeout: 20000 }
  );
}

export async function listWarehouseWriteOffs(companyId: string, limit = 50) {
  const logs = await prisma.activityLog.findMany({
    where: { companyId, action: "WRITE_OFF" },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return logs.map((l) => {
    const meta = (l.metadata ?? {}) as {
      items?: Array<{ productId: string; quantity: number; cost: number }>;
      reason?: string;
      reasonCode?: string;
    };
    return {
      id: l.entityId ?? l.id,
      createdAt: l.createdAt.toISOString(),
      actor: l.user?.name ?? "—",
      reason: l.comment ?? meta.reason ?? "",
      reasonCode: meta.reasonCode ?? null,
      itemCount: meta.items?.length ?? 0,
      totalCost: meta.items?.reduce((s, i) => s + (i.cost ?? 0), 0) ?? 0,
    };
  });
}
