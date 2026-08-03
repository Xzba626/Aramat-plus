import { LocationType, ProductKind, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { resolveProductImageUrl } from "@/lib/product-image";
import { getStoreStock } from "@/lib/services/stock.service";
import { reservedQtyByProduct } from "@/lib/services/reservation.service";

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
  });
  if (!store) throw new Error("SELLER_NO_STORE");

  const balances = await getStoreStock(store.id);
  const reserved = await reservedQtyByProduct({
    companyId: params.companyId,
    locationType: LocationType.STORE,
    locationId: store.id,
    productIds: balances.map((b) => b.productId),
  });
  const q = (params.q ?? "").trim().toLowerCase();

  let items = balances
    .filter((b) => b.product.kind !== ProductKind.PACKAGING)
    .map((b) => {
    const physical = decimalToNumber(b.quantity);
    const held = reserved.get(b.productId) ?? 0;
    const qty = Math.max(0, physical - held);
    const min = decimalToNumber(b.product.minStock);
    let stockStatus: "OK" | "LOW" | "OUT" = "OK";
    if (qty <= 0) stockStatus = "OUT";
    else if (min > 0 && qty <= min) stockStatus = "LOW";

    return {
      productId: b.productId,
      quantity: qty,
      physicalQty: physical,
      reservedQty: held,
      stockStatus,
      salePrice: decimalToNumber(b.product.salePrice),
      product: {
        id: b.product.id,
        name: b.product.name,
        sku: b.product.sku,
        barcode: b.product.barcode,
        kind: b.product.kind,
        minStock: min,
        accountingType: b.product.accountingType,
        /** Product photo (owner upload). Brand logo is fallback only. */
        imageUrl: resolveProductImageUrl(b.product),
        brand: b.product.brand
          ? {
              id: b.product.brand.id,
              name: b.product.brand.name,
              imageUrl: b.product.brand.imageUrl,
            }
          : null,
        category: b.product.category
          ? { id: b.product.category.id, name: b.product.category.name }
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
    store: { id: store.id, name: store.name },
    locationType: LocationType.STORE,
    items,
    categories,
  };
}
