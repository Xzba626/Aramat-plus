import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { BatchOrigin, LocationType, Prisma } from "@prisma/client";
import { addBatch } from "@/lib/services/stock.service";
import {
  nextProductSku,
  resolveProductAccountingType,
  resolveUnitId,
} from "@/lib/services/product-nomenclature.service";
import { sanitizeIncomingImageUrl } from "@/lib/product-image-url";
import { listProductCatalog } from "@/lib/services/products-catalog.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const rows = await listProductCatalog(user!.companyId, {
      q: searchParams.get("q"),
      categoryId: searchParams.get("categoryId"),
      brandId: searchParams.get("brandId"),
      status: searchParams.get("status"),
      kind: searchParams.get("kind"),
    });
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const data = await req.json();
    const { imageUrl: safeImage, stripped } = sanitizeIncomingImageUrl(
      data.imageUrl
    );
    const body = productSchema.parse({ ...data, imageUrl: safeImage });
    const imageStripped = stripped;
    const initialQty =
      data.initialQuantity != null ? Number(data.initialQuantity) : null;
    const costPerUnit =
      body.defaultCostPerUnit != null
        ? Number(body.defaultCostPerUnit)
        : data.costPerUnit != null
          ? Number(data.costPerUnit)
          : null;

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });
    if (!warehouse) {
      return handleApiError(new Error("WAREHOUSE_MISSING"));
    }

    const brand = body.brandId
      ? await prisma.brand.findFirst({
          where: { id: body.brandId, companyId: user!.companyId },
        })
      : null;

    const sku =
      (body.sku && body.sku.trim()) ||
      (await nextProductSku(prisma, user!.companyId, brand?.name));

    const accountingType = await resolveProductAccountingType(
      prisma,
      user!.companyId,
      body.productTypeId,
      body.accountingType
    );

    const unitId = await resolveUnitId(
      prisma,
      user!.companyId,
      accountingType,
      body.unitId
    );

    if (initialQty != null && initialQty > 0 && !(costPerUnit && costPerUnit > 0)) {
      return handleApiError(new Error("COST_REQUIRED_FOR_STOCK"));
    }

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: body.name,
          sku,
          barcode: body.barcode ?? null,
          description: body.description ?? null,
          imageUrl: body.imageUrl ?? null,
          companyId: user!.companyId,
          categoryId: body.categoryId ?? null,
          brandId: body.brandId ?? null,
          unitId,
          productTypeId: body.productTypeId ?? null,
          accountingType,
          salePrice: new Prisma.Decimal(body.salePrice),
          defaultCostPerUnit:
            costPerUnit != null && costPerUnit > 0
              ? new Prisma.Decimal(costPerUnit)
              : null,
          minStock: new Prisma.Decimal(body.minStock ?? 0),
        },
      });

      if (initialQty && initialQty > 0 && costPerUnit && costPerUnit > 0) {
        await addBatch(tx, {
          productId: created.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: initialQty,
          costPerUnit,
          notes: "Initial stock",
          createdById: user!.id,
        });
      }

      await logActivity({
        tx,
        userId: user!.id,
        companyId: user!.companyId,
        action: "PRODUCT_CREATE",
        entityType: "Product",
        entityId: created.id,
        comment: created.name,
      });

      return created;
    });

    const full = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: {
        brand: true,
        category: true,
        unit: true,
        productType: true,
        batches: true,
        stockBalances: true,
      },
    });
    return jsonOk(
      imageStripped ? { ...full, imageWarning: "IMAGE_STRIPPED" } : full,
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
