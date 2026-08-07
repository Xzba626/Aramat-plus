import { getSessionUser } from "@/lib/session";
import { isOwnerClass, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { batchSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { BatchOrigin, LocationType, ProductKind } from "@prisma/client";
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
    if (!isOwnerClass(user!.role)) {
      return jsonOk(
        batches.map(({ costPerUnit: _c, ...b }) => ({
          ...b,
          costPerUnit: null,
        }))
      );
    }
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
    if (isPackaging && !isOwnerClass(user!.role)) {
      costPerUnit =
        product.defaultCostPerUnit != null
          ? Number(product.defaultCostPerUnit)
          : body.costPerUnit;
    }

    const batchSalePrice = isPackaging
      ? 0
      : body.salePrice != null
        ? body.salePrice
        : Number(product.salePrice);

    const batch = await prisma.$transaction(async (tx) => {
      const created = await addBatch(tx, {
        productId: id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: body.quantity,
        costPerUnit,
        salePrice: batchSalePrice,
        receivedAt: body.receivedAt,
        notes: body.notes ?? undefined,
        supplierId: body.supplierId ?? null,
        createdById: user!.id,
      });

      // Catalog price only — never mutate existing Batch.salePrice
      if (
        !isPackaging &&
        body.updateCatalogPrice &&
        body.salePrice != null &&
        !product.salePrice.equals(new Prisma.Decimal(body.salePrice))
      ) {
        await tx.product.update({
          where: { id },
          data: { salePrice: new Prisma.Decimal(body.salePrice) },
        });
        await logActivity({
          tx,
          userId: user!.id,
          companyId: user!.companyId,
          action: "PRICE_CHANGE",
          entityType: "Product",
          entityId: id,
          comment: product.name,
          metadata: {
            reason: "batch_receive_catalog",
            before: { salePrice: product.salePrice.toString() },
            after: { salePrice: String(body.salePrice) },
          },
        });
      }

      // Last purchase price becomes current planned cost (OWNER receive only)
      if (isPackaging && isOwnerClass(user!.role)) {
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
          salePrice: batchSalePrice,
          supplierId: body.supplierId ?? null,
          supplierName,
          planCostUpdated: isPackaging && isOwnerClass(user!.role),
        },
      });

      return created;
    });

    return jsonOk(batch, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
