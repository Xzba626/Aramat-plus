import { LocationType, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { getStoreStock } from "@/lib/services/stock.service";

/** Catalog for Seller POS — ONLY stock at seller's BRANCH store. */
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
  const q = (params.q ?? "").trim().toLowerCase();

  let items = balances.map((b) => {
    const qty = decimalToNumber(b.quantity);
    const min = decimalToNumber(b.product.minStock);
    let stockStatus: "OK" | "LOW" | "OUT" = "OK";
    if (qty <= 0) stockStatus = "OUT";
    else if (min > 0 && qty <= min) stockStatus = "LOW";

    return {
      productId: b.productId,
      quantity: qty,
      stockStatus,
      salePrice: decimalToNumber(b.product.salePrice),
      product: {
        id: b.product.id,
        name: b.product.name,
        sku: b.product.sku,
        barcode: b.product.barcode,
        minStock: min,
        brand: b.product.brand
          ? { id: b.product.brand.id, name: b.product.brand.name, imageUrl: b.product.brand.imageUrl }
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

    // Exact barcode / sku match → first
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
