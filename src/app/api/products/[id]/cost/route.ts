import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { costSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

/** Update planned/default cost with CostHistory + audit. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = costSchema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!product) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    const newCost =
      body.defaultCostPerUnit == null
        ? null
        : new Prisma.Decimal(body.defaultCostPerUnit);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.costHistory.create({
        data: {
          productId: id,
          oldCost: product.defaultCostPerUnit,
          newCost,
          reason: body.reason.trim(),
          changedById: user!.id,
        },
      });

      const p = await tx.product.update({
        where: { id },
        data: { defaultCostPerUnit: newCost },
      });

      await logActivity({
        tx,
        userId: user!.id,
        companyId: user!.companyId,
        action: "COST_CHANGE",
        entityType: "Product",
        entityId: id,
        comment: body.reason.trim(),
        metadata: {
          before: {
            defaultCostPerUnit: product.defaultCostPerUnit?.toString() ?? null,
          },
          after: { defaultCostPerUnit: newCost?.toString() ?? null },
          reason: body.reason.trim(),
        },
      });

      return p;
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
