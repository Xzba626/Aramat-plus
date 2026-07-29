import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { batchSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { LocationType } from "@prisma/client";
import { addBatch } from "@/lib/services/stock.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;

    const product = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!product) return handleApiError(new Error("Товар не найден"));

    const batches = await prisma.batch.findMany({
      where: { productId: id },
      orderBy: { receivedAt: "desc" },
    });
    return jsonOk(batches);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = batchSchema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId, isActive: true },
    });
    if (!product) return handleApiError(new Error("Товар не найден"));

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });
    if (!warehouse) return handleApiError(new Error("Склад не найден"));

    const batch = await prisma.$transaction(async (tx) => {
      const created = await addBatch(tx, {
        productId: id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: body.quantity,
        costPerUnit: body.costPerUnit,
        receivedAt: body.receivedAt,
        notes: body.notes ?? "Новая партия",
      });

      await logActivity({
        tx,
        userId: user!.id,
        companyId: user!.companyId,
        action: "BATCH_CREATE",
        entityType: "Batch",
        entityId: created.id,
        comment: `${product.name}: ${body.quantity} @ ${body.costPerUnit}`,
      });

      return created;
    });

    return jsonOk(batch, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
