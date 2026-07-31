import { LocationType, Prisma, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";

export type SaleLineInput = {
  productId: string;
  quantity: number;
  isGift?: boolean;
};

/**
 * Fast path for POS checkout.
 * Reads (store/seller/products) are outside the interactive transaction.
 * TX only: FIFO batch deduct + stock balance + Sale/SaleItem writes.
 * Audit log runs after commit (does not hold stock locks).
 */
export async function createSale(params: {
  companyId: string;
  storeId: string;
  sellerId: string;
  items: SaleLineInput[];
  discountAmount?: number;
  paymentMethod?: string;
  notes?: string;
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");

  for (const line of params.items) {
    if (!(line.quantity > 0)) {
      throw new Error("QTY_MUST_BE_POSITIVE");
    }
  }

  const discount = new Prisma.Decimal(params.discountAmount ?? 0);
  if (discount.lt(0)) throw new Error("NEGATIVE_DISCOUNT");

  const productIds = [...new Set(params.items.map((i) => i.productId))];

  const [store, seller, products] = await Promise.all([
    prisma.store.findFirst({
      where: {
        id: params.storeId,
        companyId: params.companyId,
        isActive: true,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        kind: true,
        companyId: true,
      },
    }),
    prisma.user.findFirst({
      where: {
        id: params.sellerId,
        companyId: params.companyId,
        isActive: true,
      },
      select: { id: true, name: true, role: true, storeId: true },
    }),
    prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId: params.companyId,
        isActive: true,
      },
      select: { id: true, name: true, salePrice: true },
    }),
  ]);

  if (!store) throw new Error("STORE_NOT_FOUND");
  if (!seller) throw new Error("USER_NOT_FOUND");

  if (seller.role === "SELLER") {
    if (!seller.storeId || seller.storeId !== store.id) {
      throw new Error("SELLER_WRONG_STORE");
    }
    if (store.kind !== StoreKind.BRANCH) {
      throw new Error("SELLER_POS_BRANCH_ONLY");
    }
  }

  let locationType: LocationType;
  let locationId: string;

  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: params.companyId, isActive: true },
      select: { id: true },
    });
    if (!warehouse) throw new Error("WAREHOUSE_MISSING");
    locationType = LocationType.WAREHOUSE;
    locationId = warehouse.id;
  } else {
    locationType = LocationType.STORE;
    locationId = store.id;
  }

  if (products.length !== productIds.length) {
    throw new Error("PRODUCT_NOT_FOUND");
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  type LineRow = {
    productId: string;
    batchId: string | null;
    quantity: Prisma.Decimal;
    salePrice: Prisma.Decimal;
    costPerUnit: Prisma.Decimal;
    isGift: boolean;
  };

  const committed = await prisma.$transaction(
    async (tx) => {
      let subtotal = new Prisma.Decimal(0);
      const lineRows: LineRow[] = [];

      for (const line of params.items) {
        const product = productById.get(line.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const qty = new Prisma.Decimal(line.quantity);
        const isGift = Boolean(line.isGift);
        const unitPrice = isGift ? new Prisma.Decimal(0) : product.salePrice;

        const consumed = await deductBatchesFifo(tx, {
          productId: line.productId,
          locationType,
          locationId,
          quantity: qty,
        });

        for (const slice of consumed) {
          if (!isGift) {
            subtotal = subtotal.add(unitPrice.mul(slice.quantity));
          }
          lineRows.push({
            productId: line.productId,
            batchId: slice.batchId,
            quantity: slice.quantity,
            salePrice: unitPrice,
            costPerUnit: slice.costPerUnit,
            isGift,
          });
        }
      }

      if (discount.gt(subtotal)) {
        throw new Error("DISCOUNT_EXCEEDS_TOTAL");
      }

      const total = subtotal.sub(discount);

      const sale = await tx.sale.create({
        data: {
          storeId: store.id,
          sellerId: params.sellerId,
          status: "COMPLETED",
          subtotal,
          discountAmount: discount,
          total,
          paymentMethod: params.paymentMethod ?? "CASH",
          notes: params.notes,
          items: {
            create: lineRows.map((r) => ({
              productId: r.productId,
              batchId: r.batchId,
              quantity: r.quantity,
              salePrice: r.salePrice,
              costPerUnit: r.costPerUnit,
              isGift: r.isGift,
            })),
          },
        },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              batchId: true,
              quantity: true,
              salePrice: true,
              costPerUnit: true,
              isGift: true,
            },
          },
        },
      });

      return { sale, total };
    },
    {
      maxWait: 5000,
      timeout: 10000,
    }
  );

  // Do not hold the API on audit RTT — log after response path
  void logActivity({
    userId: params.sellerId,
    companyId: params.companyId,
    action: "SALE_CREATE",
    entityType: "Sale",
    entityId: committed.sale.id,
    comment: `${store.name} · ${decimalToNumber(committed.total)}`,
    metadata: {
      storeId: store.id,
      locationType,
      locationId,
      itemCount: params.items.length,
      total: committed.total.toString(),
    },
  }).catch((err) => console.error("[createSale] audit log failed", err));

  const { items, ...saleRest } = committed.sale;

  return {
    ...saleRest,
    items: items.map((it) => ({
      ...it,
      product: {
        id: it.productId,
        name: productById.get(it.productId)?.name ?? "",
      },
    })),
    seller: { id: seller.id, name: seller.name },
    store: { id: store.id, name: store.name, kind: store.kind },
  };
}
