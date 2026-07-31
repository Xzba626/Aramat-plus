import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { Prisma } from "@prisma/client";
import {
  resolveProductAccountingType,
  resolveUnitId,
} from "@/lib/services/product-nomenclature.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;

    const item = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
      include: {
        brand: true,
        category: true,
        unit: true,
        productType: true,
        batches: { orderBy: { receivedAt: "asc" } },
        stockBalances: true,
        priceHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
    if (!item) return handleApiError(new Error("PRODUCT_NOT_FOUND"));
    return jsonOk(item);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = productSchema.partial().parse(await req.json());

    const existing = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    const nextProductTypeId =
      body.productTypeId === undefined
        ? existing.productTypeId
        : body.productTypeId;
    const accountingType =
      body.accountingType !== undefined || body.productTypeId !== undefined
        ? await resolveProductAccountingType(
            prisma,
            user!.companyId,
            nextProductTypeId,
            body.accountingType ?? existing.accountingType
          )
        : undefined;

    const unitId =
      accountingType != null && body.unitId === undefined
        ? await resolveUnitId(prisma, user!.companyId, accountingType, null)
        : body.unitId === undefined
          ? undefined
          : body.unitId;

    const item = await prisma.product.update({
      where: { id },
      data: {
        name: body.name,
        sku: body.sku === undefined ? undefined : body.sku,
        categoryId: body.categoryId === undefined ? undefined : body.categoryId,
        brandId: body.brandId === undefined ? undefined : body.brandId,
        unitId,
        productTypeId:
          body.productTypeId === undefined ? undefined : body.productTypeId,
        accountingType,
        salePrice:
          body.salePrice != null ? new Prisma.Decimal(body.salePrice) : undefined,
        defaultCostPerUnit:
          body.defaultCostPerUnit === undefined
            ? undefined
            : body.defaultCostPerUnit == null
              ? null
              : new Prisma.Decimal(body.defaultCostPerUnit),
      },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "PRODUCT_UPDATE",
      entityType: "Product",
      entityId: item.id,
    });
    return jsonOk(item);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;

    const existing = await prisma.product.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "PRODUCT_DEACTIVATE",
      entityType: "Product",
      entityId: id,
    });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
