import { LocationType, ProductKind, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { resolveProductImageUrl } from "@/lib/product-image";
import { getStoreStock } from "@/lib/services/stock.service";
import { reservedQtyByProduct } from "@/lib/services/reservation.service";
import {
  getLowStockThresholds,
  resolveStockStatus,
} from "@/lib/services/low-stock-thresholds.service";
import { scrubStoredLabel } from "@/lib/security/sanitize-text";

/** Catalog for Seller POS — available qty = physical − ACTIVE reservations. */
export async function getPosCatalog(params: {
  companyId: string;
  storeId: string;
  q?: string;
  categoryId?: string;
}) {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      kind: StoreKind.BRANCH,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      status: true,
    },
  });
  if (!store) throw new Error("SELLER_NO_STORE");
  if (store.status === "INVENTORY") {
    throw new Error("STORE_INVENTORY_IN_PROGRESS");
  }
  if (store.status === "CLOSED") {
    throw new Error("STORE_CLOSED");
  }

  // includeZero: keep sold-out cards visible (OUT state)
  const balances = await getStoreStock(store.id, { includeZero: true });
  const thresholds = await getLowStockThresholds(params.companyId);
  const reserved = await reservedQtyByProduct({
    companyId: params.companyId,
    locationType: LocationType.STORE,
    locationId: store.id,
    productIds: balances.map((b) => b.productId),
  });
  const q = (params.q ?? "").trim().toLowerCase();

  const merchandise = balances.filter(
    (b) => b.product.kind !== ProductKind.PACKAGING
  );
  const productIds = merchandise.map((b) => b.productId);
  const openBatches = await prisma.batch.findMany({
    where: {
      productId: { in: productIds },
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
    select: { productId: true, salePrice: true },
  });
  const fifoFrontByProduct = new Map<string, number>();
  for (const row of openBatches) {
    if (fifoFrontByProduct.has(row.productId)) continue;
    if (row.salePrice != null) {
      fifoFrontByProduct.set(row.productId, Number(row.salePrice));
    }
  }

  let items = merchandise.map((b) => {
    const physical = decimalToNumber(b.quantity);
    const held = reserved.get(b.productId) ?? 0;
    const qty = Math.max(0, physical - held);
    const stockStatus = resolveStockStatus({
      quantity: qty,
      accountingType: b.product.accountingType,
      locationType: LocationType.STORE,
      thresholds,
    });

    return {
      productId: b.productId,
      quantity: qty,
      physicalQty: physical,
      reservedQty: held,
      stockStatus,
      /** POS display estimate only — final price from createSale FIFO. */
      salePrice:
        fifoFrontByProduct.get(b.productId) ??
        decimalToNumber(b.product.salePrice),
      product: {
        id: b.product.id,
        name: scrubStoredLabel(b.product.name),
        sku: b.product.sku,
        barcode: b.product.barcode,
        kind: b.product.kind,
        accountingType: b.product.accountingType,
        /** Product photo (owner upload). Brand logo is fallback only. */
        imageUrl: resolveProductImageUrl(b.product),
        brand: b.product.brand
          ? {
              id: b.product.brand.id,
              name: scrubStoredLabel(b.product.brand.name),
              imageUrl: b.product.brand.imageUrl,
            }
          : null,
        category: b.product.category
          ? {
              id: b.product.category.id,
              name: scrubStoredLabel(b.product.category.name),
            }
          : null,
        unit: b.product.unit
          ? { symbol: b.product.unit.symbol, name: b.product.unit.name }
          : null,
      },
    };
  });

  // Defense in depth: never expose packaging consumables as sellable SKUs
  items = items.filter((i) => i.product.kind !== ProductKind.PACKAGING);

  if (params.categoryId) {
    items = items.filter((i) => i.product.category?.id === params.categoryId);
  }

  if (q) {
    items = items.filter((i) => {
      const hay = [
        i.product.name,
        i.product.brand?.name,
        i.product.sku,
        i.product.barcode,
        i.product.category?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const exact = items.find(
      (i) =>
        i.product.barcode?.toLowerCase() === q ||
        i.product.sku?.toLowerCase() === q
    );
    if (exact) {
      items = [exact, ...items.filter((i) => i.productId !== exact.productId)];
    }
  }

  const categories = await prisma.category.findMany({
    where: { companyId: params.companyId, isArchived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return {
    store: { id: store.id, name: scrubStoredLabel(store.name) },
    locationType: LocationType.STORE,
    items,
    categories: categories.map((c) => ({
      id: c.id,
      name: scrubStoredLabel(c.name),
    })),
  };
}
