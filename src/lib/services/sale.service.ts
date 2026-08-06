import { AccountingType, LocationType, Prisma, Role, StoreKind } from "@prisma/client";
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
import {
  createBottleSaleExpenseInTx,
  deductBottleFromStore,
  ensureBottleExpenseType,
  getPackagingQtyAtStore,
  maybeNotifyLowBottleStock,
  resolvePackagingProduct,
} from "@/lib/services/packaging.service";

export type ContainerSourceInput = "STORE_BOTTLE" | "CUSTOMER_BOTTLE";

export type SaleLineInput = {
  productId: string;
  quantity: number;
  isGift?: boolean;
  /**
   * WEIGHT/decant: who provides the bottle.
   * STORE_BOTTLE (default when packaging is sent) deducts stock + bottle opex.
   * CUSTOMER_BOTTLE: perfume only — no bottle stock / AUTO_BOTTLE expense.
   */
  containerSource?: ContainerSourceInput;
  /** WEIGHT/decant: bottle from store stock (Product PACKAGING). Required for STORE_BOTTLE. */
  packagingProductId?: string;
  packagingSkuId?: string;
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
        status: true,
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
      select: {
        id: true,
        name: true,
        salePrice: true,
        accountingType: true,
        kind: true,
      },
    }),
  ]);

  if (!store) throw new Error("STORE_NOT_FOUND");
  if (!seller) throw new Error("USER_NOT_FOUND");
  if (store.status === "INVENTORY") {
    throw new Error("STORE_INVENTORY_IN_PROGRESS");
  }
  if (store.status === "CLOSED") {
    throw new Error("STORE_CLOSED");
  }

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
    isDecant: boolean;
    containerSource: ContainerSourceInput | null;
    packagingProductId: string | null;
    packagingQuantity: Prisma.Decimal | null;
    packagingCostPerUnit: Prisma.Decimal | null;
  };

  const requiresBottle = true;
  const bottleExpenseType = await ensureBottleExpenseType(params.companyId);

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
      const pendingBottleExpenses: Array<{
        productId: string;
        packagingProductId: string;
        amount: number;
      }> = [];
      const cartForDiscount: Array<{
        productId: string;
        quantity: number;
        salePrice: number;
      }> = [];

      for (const line of params.items) {
        const product = productById.get(line.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        if (product.kind === "PACKAGING") {
          throw new Error("PACKAGING_NOT_FOR_SALE");
        }

        const qty = new Prisma.Decimal(line.quantity);
        const isGift = Boolean(line.isGift);
        const isWeight = product.accountingType === AccountingType.WEIGHT;

        let containerSource: ContainerSourceInput | null = null;
        if (requiresBottle && isWeight && !isGift) {
          const raw = line.containerSource;
          if (raw === "CUSTOMER_BOTTLE" || raw === "STORE_BOTTLE") {
            containerSource = raw;
          } else if (line.packagingProductId || line.packagingSkuId) {
            // Backward-compatible: packaging without explicit source → store bottle
            containerSource = "STORE_BOTTLE";
          } else {
            throw new Error("CONTAINER_SOURCE_REQUIRED");
          }

          if (
            containerSource === "STORE_BOTTLE" &&
            !line.packagingProductId &&
            !line.packagingSkuId
          ) {
            throw new Error("BOTTLE_REQUIRED");
          }
        }

        const consumed = await deductBatchesFifo(tx, {
          productId: line.productId,
          locationType,
          locationId,
          quantity: qty,
        });

        let packagingProductId: string | null = null;
        let packagingQuantity: Prisma.Decimal | null = null;
        let packagingCostPerUnit: Prisma.Decimal | null = null;
        let bottleExpenseAmount = 0;

        if (
          requiresBottle &&
          isWeight &&
          !isGift &&
          containerSource === "STORE_BOTTLE"
        ) {
          const packaging = await resolvePackagingProduct({
            companyId: params.companyId,
            packagingProductId: line.packagingProductId,
            packagingSkuId: line.packagingSkuId,
          });
          const bottle = await deductBottleFromStore(tx, {
            packagingProductId: packaging.id,
            storeId: store.id,
            locationType,
            locationId,
            quantity: 1,
          });
          packagingProductId = bottle.packagingProductId;
          packagingQuantity = bottle.packagingQuantity;
          packagingCostPerUnit = bottle.packagingCostPerUnit;
          bottleExpenseAmount = bottle.bottleExpenseAmount;
        }

        let sliceIdx = 0;
        let lineRevenue = new Prisma.Decimal(0);
        for (const slice of consumed) {
          const unitPrice = isGift
            ? new Prisma.Decimal(0)
            : slice.salePrice;
          if (!isGift) {
            lineRevenue = lineRevenue.add(unitPrice.mul(slice.quantity));
            subtotal = subtotal.add(unitPrice.mul(slice.quantity));
          }
          const isFirstSlice = sliceIdx === 0;
          const useStoreBottle =
            isFirstSlice && containerSource === "STORE_BOTTLE";
          const useCustomerBottle =
            isFirstSlice && containerSource === "CUSTOMER_BOTTLE";
          lineRows.push({
            productId: line.productId,
            batchId: slice.batchId,
            quantity: slice.quantity,
            salePrice: unitPrice,
            costPerUnit: slice.costPerUnit,
            isGift,
            isDecant:
              useStoreBottle || useCustomerBottle
                ? true
                : isFirstSlice && Boolean(packagingProductId),
            containerSource: isFirstSlice ? containerSource : null,
            packagingProductId: useStoreBottle ? packagingProductId : null,
            packagingQuantity: useStoreBottle ? packagingQuantity : null,
            packagingCostPerUnit: useStoreBottle
              ? packagingCostPerUnit
              : null,
          });
          sliceIdx++;
        }

        if (!isGift) {
          // Composition fingerprint: one line per product (qty); price is FIFO-weighted estimate for display only
          const qtyNum = decimalToNumber(qty);
          cartForDiscount.push({
            productId: line.productId,
            quantity: qtyNum,
            salePrice:
              qtyNum > 0 ? decimalToNumber(lineRevenue) / qtyNum : 0,
          });
        }

        if (bottleExpenseAmount > 0 && packagingProductId) {
          pendingBottleExpenses.push({
            productId: line.productId,
            packagingProductId,
            amount: bottleExpenseAmount,
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

      if (!lineRows.length) {
        throw new Error("EMPTY_CART");
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
              isDecant: r.isDecant,
              containerSource: r.containerSource,
              packagingProductId: r.packagingProductId,
              packagingQuantity: r.packagingQuantity,
              packagingCostPerUnit: r.packagingCostPerUnit,
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
              isDecant: true,
              containerSource: true,
              packagingProductId: true,
              packagingQuantity: true,
              packagingCostPerUnit: true,
            },
          },
        },
      });

      if (!sale.items.length) {
        throw new Error("EMPTY_CART");
      }

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

      // Bottle opex: one ONCE expense per decant line (not perfume COGS)
      if (bottleExpenseType) {
        for (const row of pendingBottleExpenses) {
          const prodName = productById.get(row.productId)?.name ?? "";
          await createBottleSaleExpenseInTx(tx, {
            expenseTypeId: bottleExpenseType.id,
            createdById: params.sellerId,
            storeId: store.id,
            amount: row.amount,
            saleId: sale.id,
            label: prodName,
          });
        }
      }

      return { sale, total, subtotal, discount, pendingBottleExpenses };
    },
    { maxWait: 8000, timeout: 20000 }
  );

  // Low bottle stock alerts (post-commit) — must await so notify is durable
  if (locationType === LocationType.STORE) {
    const bottleIds = [
      ...new Set(
        committed.pendingBottleExpenses.map((r) => r.packagingProductId)
      ),
    ];
    for (const pid of bottleIds) {
      const packaging = await prisma.product.findUnique({
        where: { id: pid },
        select: { id: true, name: true },
      });
      if (!packaging) continue;
      const qtyAfter = await getPackagingQtyAtStore(pid, store.id);
      try {
        await maybeNotifyLowBottleStock({
          companyId: params.companyId,
          storeId: store.id,
          storeName: store.name,
          packagingProductId: pid,
          skuName: packaging.name,
          qtyAfter,
        });
      } catch (err) {
        console.error("[createSale] bottle low-stock notify failed", err);
      }
    }
  }

  // Merchandise low / out notifications (store or owner-direct warehouse)
  try {
    const {
      getLowStockThresholds,
      maybeNotifyLowMerchandiseStock,
    } = await import("@/lib/services/low-stock-thresholds.service");
    const { getQtyAtLocation } = await import("@/lib/services/stock.service");
    const thresholds = await getLowStockThresholds(params.companyId);
    const locationName =
      locationType === LocationType.WAREHOUSE
        ? store.name || "—"
        : store.name;
    const soldIds = [...new Set(params.items.map((i) => i.productId))];
    for (const productId of soldIds) {
      const product = productById.get(productId);
      if (!product || product.kind === "PACKAGING") continue;
      const qtyAfter = await getQtyAtLocation({
        productId,
        locationType,
        locationId,
      });
      await maybeNotifyLowMerchandiseStock({
        companyId: params.companyId,
        locationType,
        locationName,
        productId,
        productName: product.name,
        accountingType: product.accountingType,
        qtyAfter,
        thresholds,
        storeId:
          locationType === LocationType.STORE ? store.id : undefined,
      });
    }
  } catch (err) {
    console.error("[createSale] merchandise low-stock notify failed", err);
  }

  void logActivity({
    userId: params.sellerId,
    companyId: params.companyId,
    action: "SALE_CREATE",
    entityType: "Sale",
    entityId: committed.sale.id,
    comment: `${store.name} · ${decimalToNumber(committed.total)}`,
    metadata: {
      storeId: store.id,
      storeName: store.name,
      locationType,
      locationId,
      itemCount: params.items.length,
      productId: params.items[0]?.productId ?? null,
      productName:
        productById.get(params.items[0]?.productId ?? "")?.name ??
        (params.items.length > 1 ? `${params.items.length} SKU` : null),
      productNames: params.items
        .map((i) => productById.get(i.productId)?.name)
        .filter(Boolean)
        .join(", "),
      quantity: params.items.reduce((s, i) => s + i.quantity, 0),
      originalAmount: committed.subtotal.toString(),
      discountAmount: committed.discount.toString(),
      finalAmount: committed.total.toString(),
      amount: committed.total.toString(),
      discountRequestId: params.discountRequestId ?? null,
      reservationId: params.reservationId ?? null,
      paymentMethod: params.paymentMethod ?? "CASH",
      containerSources: params.items
        .map((i) => i.containerSource)
        .filter((v): v is ContainerSourceInput => Boolean(v)),
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
