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

export async function createSale(params: {
  companyId: string;
  storeId: string;
  sellerId: string;
  items: SaleLineInput[];
  discountAmount?: number;
  paymentMethod?: string;
  notes?: string;
}) {
  if (!params.items.length) throw new Error("Добавьте хотя бы один товар");

  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      isActive: true,
      isArchived: false,
    },
  });
  if (!store) throw new Error("Магазин не найден");

  const seller = await prisma.user.findFirst({
    where: { id: params.sellerId, companyId: params.companyId, isActive: true },
  });
  if (!seller) throw new Error("Продавец не найден");

  // Seller may only sell at their assigned BRANCH store
  if (seller.role === "SELLER") {
    if (!seller.storeId || seller.storeId !== store.id) {
      throw new Error("Продавец может продавать только в своём магазине");
    }
    if (store.kind !== StoreKind.BRANCH) {
      throw new Error("Seller POS работает только с филиалом");
    }
  }

  let locationType: LocationType;
  let locationId: string;

  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: params.companyId, isActive: true },
    });
    if (!warehouse) throw new Error("Центральный склад не найден");
    locationType = LocationType.WAREHOUSE;
    locationId = warehouse.id;
  } else {
    locationType = LocationType.STORE;
    locationId = store.id;
  }

  const discount = new Prisma.Decimal(params.discountAmount ?? 0);
  if (discount.lt(0)) throw new Error("Скидка не может быть отрицательной");

  return prisma.$transaction(async (tx) => {
    let subtotal = new Prisma.Decimal(0);
    const lineRows: Array<{
      productId: string;
      batchId: string | null;
      quantity: Prisma.Decimal;
      salePrice: Prisma.Decimal;
      costPerUnit: Prisma.Decimal;
      isGift: boolean;
    }> = [];

    for (const line of params.items) {
      const qty = new Prisma.Decimal(line.quantity);
      if (qty.lte(0)) throw new Error("Количество должно быть больше нуля");

      const product = await tx.product.findFirst({
        where: {
          id: line.productId,
          companyId: params.companyId,
          isActive: true,
        },
      });
      if (!product) throw new Error(`Товар не найден: ${line.productId}`);

      const isGift = Boolean(line.isGift);
      const unitPrice = isGift ? new Prisma.Decimal(0) : product.salePrice;

      const consumed = await deductBatchesFifo(tx, {
        productId: line.productId,
        locationType,
        locationId,
        quantity: qty,
      });

      for (const slice of consumed) {
        const sliceSub = unitPrice.mul(slice.quantity);
        if (!isGift) subtotal = subtotal.add(sliceSub);
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
      throw new Error("Скидка больше суммы продажи");
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
        items: { include: { product: { select: { id: true, name: true } } } },
        seller: { select: { id: true, name: true } },
        store: { select: { id: true, name: true, kind: true } },
      },
    });

    await logActivity({
      tx,
      userId: params.sellerId,
      companyId: params.companyId,
      action: "SALE_CREATE",
      entityType: "Sale",
      entityId: sale.id,
      comment: `${store.name} · ${decimalToNumber(total)} с.`,
      metadata: {
        storeId: store.id,
        locationType,
        locationId,
        itemCount: params.items.length,
        total: total.toString(),
      },
    });

    return sale;
  });
}
