import { LocationType, Prisma, Role, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";
import {
  assertAvailableForSaleLines,
  assertReservationForSale,
  completeReservationInTx,
  expireStaleReservations,
} from "@/lib/services/reservation.service";
import {
  consumeApprovedDiscount,
  linkDiscountToSale,
} from "@/lib/services/discount-request.service";

export type SaleLineInput = {
  productId: string;
  quantity: number;
  isGift?: boolean;
};

/**
 * Fast path for POS checkout.
 * Optional discountRequestId: only APPROVED linked request may reduce total.
 */
export async function createSale(params: {
  companyId: string;
  storeId: string;
  sellerId: string;
  items: SaleLineInput[];
  discountAmount?: number;
  discountRequestId?: string;
  paymentMethod?: string;
  notes?: string;
  reservationId?: string;
  /** Seller must use approved request — cannot pass raw discountAmount. */
  enforceApprovedDiscount?: boolean;
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");

  for (const line of params.items) {
    if (!(line.quantity > 0)) {
      throw new Error("QTY_MUST_BE_POSITIVE");
    }
  }

  if (
    params.enforceApprovedDiscount &&
    (params.discountAmount ?? 0) > 0 &&
    !params.discountRequestId
  ) {
    throw new Error("DISCOUNT_REQUIRES_APPROVAL");
  }

  let discount = new Prisma.Decimal(params.discountAmount ?? 0);
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
      await expireStaleReservations(tx, params.companyId);

      if (params.reservationId) {
        await assertReservationForSale(tx, {
          companyId: params.companyId,
          reservationId: params.reservationId,
          storeId: store.id,
          sellerId: params.sellerId,
          items: params.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          sellerIsRestricted: seller.role === Role.SELLER,
        });
      }

      await assertAvailableForSaleLines(tx, {
        locationType,
        locationId,
        items: params.items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        reservationId: params.reservationId,
      });

      let subtotal = new Prisma.Decimal(0);
      const lineRows: LineRow[] = [];
      const cartForDiscount: Array<{
        productId: string;
        quantity: number;
        salePrice: number;
      }> = [];

      for (const line of params.items) {
        const product = productById.get(line.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const qty = new Prisma.Decimal(line.quantity);
        const isGift = Boolean(line.isGift);
        const unitPrice = isGift ? new Prisma.Decimal(0) : product.salePrice;

        if (!isGift) {
          cartForDiscount.push({
            productId: line.productId,
            quantity: decimalToNumber(qty),
            salePrice: decimalToNumber(unitPrice),
          });
        }

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

      let discountApprovedById: string | null = null;
      let discountApprovedAt: Date | null = null;
      let discountRequestId: string | null = null;

      if (params.discountRequestId) {
        const consumed = await consumeApprovedDiscount(tx, {
          companyId: params.companyId,
          discountRequestId: params.discountRequestId,
          sellerId: params.sellerId,
          storeId: store.id,
          cartItems: cartForDiscount,
          cartSubtotal: decimalToNumber(subtotal),
        });
        discount = new Prisma.Decimal(consumed.discountAmount);
        discountApprovedById = consumed.approvedById;
        discountApprovedAt = consumed.approvedAt;
        discountRequestId = consumed.requestId;
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
          discountRequestId,
          discountApprovedById,
          discountApprovedAt,
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

      if (discountRequestId) {
        await linkDiscountToSale(tx, {
          discountRequestId,
          saleId: sale.id,
        });
      }

      if (params.reservationId) {
        await completeReservationInTx(tx, {
          reservationId: params.reservationId,
          saleId: sale.id,
          userId: params.sellerId,
          companyId: params.companyId,
        });
      }

      return { sale, total, subtotal, discount };
    },
    {
      maxWait: 8000,
      timeout: 20000,
    }
  );

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
      originalAmount: committed.subtotal.toString(),
      discountAmount: committed.discount.toString(),
      finalAmount: committed.total.toString(),
      discountRequestId: params.discountRequestId ?? null,
      reservationId: params.reservationId ?? null,
    },
  }).catch((err) => console.error("[createSale] audit log failed", err));

  const { items, ...saleRest } = committed.sale;

  return {
    ...saleRest,
    originalAmount: decimalToNumber(committed.subtotal),
    discountAmount: decimalToNumber(committed.discount),
    finalAmount: decimalToNumber(committed.total),
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
