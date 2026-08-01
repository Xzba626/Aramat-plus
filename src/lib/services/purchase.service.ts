import { LocationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { getCentralWarehouse } from "@/lib/services/warehouse.service";

/** Batches created by returns must not appear as purchases. */
export const PURCHASE_BATCH_WHERE: Prisma.BatchWhereInput = {
  transferItemId: null,
  NOT: {
    OR: [
      { notes: { startsWith: "warehouse_return:" } },
      { notes: { startsWith: "sale_return:" } },
    ],
  },
};

export type PurchaseHistoryItem = {
  id: string;
  receivedAt: string;
  productId: string;
  productName: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
  notes: string | null;
  supplier: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
};

/** Purchase receipts = warehouse stock-in batches (not transfers / returns). */
export async function getPurchaseHistory(
  companyId: string,
  opts?: { limit?: number; offset?: number; showFinance?: boolean }
) {
  const warehouse = await getCentralWarehouse(companyId);
  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  const showFinance = opts?.showFinance ?? false;

  if (!warehouse) {
    return { total: 0, items: [] as PurchaseHistoryItem[] };
  }

  const where: Prisma.BatchWhereInput = {
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
    product: { companyId },
    ...PURCHASE_BATCH_WHERE,
  };

  const [total, batches] = await Promise.all([
    prisma.batch.count({ where }),
    prisma.batch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  const items: PurchaseHistoryItem[] = batches.map((b) => {
    const qty = decimalToNumber(b.initialQuantity);
    const cost = showFinance ? decimalToNumber(b.costPerUnit) : 0;
    return {
      id: b.id,
      receivedAt: b.receivedAt.toISOString(),
      productId: b.productId,
      productName: b.product.name,
      quantity: qty,
      costPerUnit: cost,
      totalCost: showFinance ? Math.round(qty * cost * 100) / 100 : 0,
      notes: b.notes,
      supplier: b.supplier,
      createdBy: b.createdBy,
    };
  });

  return { total, items };
}
