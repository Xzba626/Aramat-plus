import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { canViewWarehouseFinance } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleApiError } from "@/lib/api";
import { decimalToNumber } from "@/lib/utils";
import { LocationType } from "@prisma/client";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: user!.companyId, isActive: true },
    });

    const batches = warehouse
      ? await prisma.batch.findMany({
          where: {
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: { gt: 0 },
          },
          include: { product: { include: { brand: true, unit: true } } },
          orderBy: { receivedAt: "asc" },
          take: 100,
        })
      : [];

    return jsonOk({
      showFinance: canViewWarehouseFinance(user!),
      batches: batches.map((b) => ({
        id: b.id,
        productId: b.productId,
        receivedAt: b.receivedAt.toISOString(),
        quantity: decimalToNumber(b.quantity),
        costPerUnit: decimalToNumber(b.costPerUnit),
        notes: b.notes,
        product: {
          name: b.product.name,
          unit: b.product.unit ? { symbol: b.product.unit.symbol } : null,
        },
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
