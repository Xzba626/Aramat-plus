import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { batchSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { BatchOrigin, LocationType, ProductKind, Role } from "@prisma/client";
import { addBatch } from "@/lib/services/stock.service";
import { getActiveSupplier } from "@/lib/services/supplier.service";
import { Prisma } from "@prisma/client";

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
    if (!product) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    const batches = await prisma.batch.findMany({
      where: { productId: id },
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
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
    if (!product) return handleApiError(new Error("PRODUCT_NOT_FOUND"));

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });
    if (!warehouse) return handleApiError(new Error("WAREHOUSE_MISSING"));

    let supplierName: string | null = null;
    if (body.supplierId) {
      const supplier = await getActiveSupplier(user!.companyId, body.supplierId);
      if (!supplier) return handleApiError(new Error("SUPPLIER_NOT_FOUND"));
      supplierName = supplier.name;
    }

    const isPackaging = product.kind === ProductKind.PACKAGING;
    // Non-owners cannot set a new plan cost — force current planned cost
    let costPerUnit = body.costPerUnit;
    if (isPackaging && user!.role !== Role.OWNER) {
      costPerUnit =
        product.defaultCostPerUnit != null
          ? Number(product.defaultCostPerUnit)
          : body.costPerUnit;
    }

    const batch = await prisma.$transaction(async (tx) => {
      const created = await addBatch(tx, {
        productId: id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: body.quantity,
        costPerUnit,
        receivedAt: body.receivedAt,
        notes: body.notes ?? undefined,
        supplierId: body.supplierId ?? null,
        createdById: user!.id,
      });

      // Last purchase price becomes current planned cost (OWNER receive only)
      if (isPackaging && user!.role === Role.OWNER) {
        const plan = new Prisma.Decimal(costPerUnit.toString());
        await tx.product.update({
          where: { id },
          data: { defaultCostPerUnit: plan },
        });
        if (product.packagingSkuId) {
          await tx.packagingSku.update({
            where: { id: product.packagingSkuId },
            data: { defaultCost: plan },
          });
        }
      }

      const supplierPart = supplierName ? ` · ${supplierName}` : "";
      await logActivity({
        tx,
        userId: user!.id,
        companyId: user!.companyId,
        action: "BATCH_CREATE",
        entityType: "Batch",
        entityId: created.id,
        comment: `${product.name}: ${body.quantity} @ ${costPerUnit}${supplierPart}`,
        metadata: {
          productId: id,
          quantity: body.quantity,
          costPerUnit,
          supplierId: body.supplierId ?? null,
          supplierName,
          planCostUpdated: isPackaging && user!.role === Role.OWNER,
        },
      });

      return created;
    });

    return jsonOk(batch, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
