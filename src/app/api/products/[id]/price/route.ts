import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { priceSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = priceSchema.parse(await req.json());

    const product = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!product) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    const newPrice = new Prisma.Decimal(body.salePrice);
    if (product.salePrice.equals(newPrice)) {
      return jsonOk(product);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.priceHistory.create({
        data: {
          productId: id,
          oldPrice: product.salePrice,
          newPrice,
          reason: body.reason.trim(),
          changedById: user!.id,
        },
      });

      const p = await tx.product.update({
        where: { id },
        data: { salePrice: newPrice },
      });

      await logActivity({
        tx,
        userId: user!.id,
        companyId: user!.companyId,
        action: "PRICE_CHANGE",
        entityType: "Product",
        entityId: id,
        comment: body.reason.trim(),
        metadata: {
          before: { salePrice: product.salePrice.toString() },
          after: { salePrice: newPrice.toString() },
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
