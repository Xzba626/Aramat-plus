import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { LocationType, Prisma } from "@prisma/client";
import { addBatch } from "@/lib/services/stock.service";
import { decimalToNumber } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const categoryId = searchParams.get("categoryId");
    const brandId = searchParams.get("brandId");
    const status = searchParams.get("status"); // active | archived | low | empty | all
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });

    const items = await prisma.product.findMany({
      where: {
        companyId: user!.companyId,
        ...(status === "archived"
          ? { isActive: false }
          : status === "all"
            ? {}
            : { isActive: true }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { sku: { contains: q, mode: "insensitive" } },
                { barcode: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(brandId ? { brandId } : {}),
      },
      include: {
        brand: true,
        category: true,
        unit: true,
        productType: true,
        stockBalances: warehouse
          ? {
              where: {
                locationType: LocationType.WAREHOUSE,
                locationId: warehouse.id,
              },
            }
          : true,
      },
      orderBy: { name: "asc" },
    });

    let rows = items.map((p) => {
      const qty = p.stockBalances.reduce(
        (s, b) => s + decimalToNumber(b.quantity),
        0
      );
      const min = decimalToNumber(p.minStock);
      return {
        ...p,
        warehouseQty: qty,
        statusLabel: !p.isActive
          ? "Архив"
          : qty <= 0
            ? "Отсутствует"
            : min > 0 && qty <= min
              ? "Заканчивается"
              : "Активен",
      };
    });

    if (status === "low") {
      rows = rows.filter(
        (p) => p.isActive && p.warehouseQty > 0 && p.warehouseQty <= decimalToNumber(p.minStock || 5)
      );
    }
    if (status === "empty") {
      rows = rows.filter((p) => p.isActive && p.warehouseQty <= 0);
    }

    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const data = await req.json();
    const body = productSchema.parse(data);
    const initialQty =
      data.initialQuantity != null ? Number(data.initialQuantity) : null;
    const costPerUnit =
      data.costPerUnit != null ? Number(data.costPerUnit) : null;

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });
    if (!warehouse)
      return handleApiError(new Error("Склад не найден. Запустите seed."));

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: body.name,
          sku: body.sku ?? null,
          barcode: body.barcode ?? null,
          description: body.description ?? null,
          companyId: user!.companyId,
          categoryId: body.categoryId ?? null,
          brandId: body.brandId ?? null,
          unitId: body.unitId ?? null,
          productTypeId: body.productTypeId ?? null,
          accountingType: body.accountingType,
          salePrice: new Prisma.Decimal(body.salePrice),
          minStock: new Prisma.Decimal(body.minStock ?? 0),
        },
      });

      // Остаток = 0 до поставки; партия только если явно переданы qty+cost
      if (initialQty && initialQty > 0 && costPerUnit && costPerUnit > 0) {
        await addBatch(tx, {
          productId: created.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: initialQty,
          costPerUnit,
          notes: "Начальная партия",
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
        batches: true,
        stockBalances: true,
      },
    });
    return jsonOk(full, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
