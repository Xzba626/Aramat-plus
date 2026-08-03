import { ProductKind, Prisma } from "@prisma/client";

/** Sellable merchandise only — bottles live as ProductKind.PACKAGING. */
export const MERCHANDISE_KIND = ProductKind.STANDARD;

/** Prisma where-fragment for merchandise product lists / analytics. */
export function merchandiseProductWhere(
  extra: Prisma.ProductWhereInput = {}
): Prisma.ProductWhereInput {
  return { kind: MERCHANDISE_KIND, ...extra };
}

/** Nest under `product: { ... }` on SaleItem / StockBalance queries. */
export function merchandiseProductRelationWhere(
  extra: Prisma.ProductWhereInput = {}
): { product: Prisma.ProductWhereInput } {
  return { product: merchandiseProductWhere(extra) };
}

export function isMerchandiseProduct(product: {
  kind?: ProductKind | string | null;
}): boolean {
  return product.kind !== ProductKind.PACKAGING;
}
