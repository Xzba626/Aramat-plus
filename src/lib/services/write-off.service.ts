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
  /** Client idempotency key — duplicate within 15s returns prior result shape. */
  idempotencyKey?: string | null;
}) {
  if (!params.items.length) throw new Error("VALIDATION_ERROR");

  const warehouse = await getCentralWarehouse(params.companyId);
  if (!warehouse) throw new Error("WAREHOUSE_MISSING");

  const comment = params.comment?.trim() || params.reasonCode;
  const itemsKey = params.items
    .map((i) => `${i.productId}:${Number(i.quantity)}`)
    .sort()
    .join("|");
  const fingerprint =
    params.idempotencyKey?.trim() ||
    `${params.reasonCode}|${comment}|${itemsKey}`;

  const recent = await prisma.activityLog.findFirst({
    where: {
      companyId: params.companyId,
      userId: params.createdById,
      action: "WRITE_OFF",
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent?.metadata && typeof recent.metadata === "object") {
    const meta = recent.metadata as Record<string, unknown>;
    if (meta.fingerprint === fingerprint && recent.entityId) {
      return {
        operationId: recent.entityId,
        warehouseId: warehouse.id,
        itemCount: params.items.length,
        totalCost: Number(meta.totalCost ?? 0),
        reasonCode: params.reasonCode,
        deduplicated: true,
      };
    }
  }

  const operationId = `wo-${Date.now()}`;

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

      const totalCost = moved.reduce((s, m) => s + m.cost, 0);

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
          fingerprint,
          totalCost,
        },
      });

      return {
        operationId,
        warehouseId: warehouse.id,
        itemCount: moved.length,
        totalCost,
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
