import { prisma } from "@/lib/prisma";
import { LocationType } from "@prisma/client";
import { decimalToNumber } from "@/lib/utils";
import { scrubStoredLabel } from "@/lib/security/sanitize-text";

export type ProductCatalogStatus =
  | "active"
  | "archived"
  | "low"
  | "empty"
  | "all";

export type ProductCatalogKind = "STANDARD" | "PACKAGING" | "all";

export type ProductCatalogFilters = {
  q?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  status?: ProductCatalogStatus | string | null;
  kind?: ProductCatalogKind | string | null;
};

/**
 * Owner/Manager warehouse catalog rows — shared by API and RSC initialData.
 */
export async function listProductCatalog(
  companyId: string,
  filters: ProductCatalogFilters = {}
) {
  const q = filters.q?.trim() || undefined;
  const categoryId = filters.categoryId || undefined;
  const brandId = filters.brandId || undefined;
  const status = filters.status || "active";
  const kind = filters.kind || "STANDARD";

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });

  const items = await prisma.product.findMany({
    where: {
      companyId,
      ...(kind === "PACKAGING"
        ? { kind: "PACKAGING" }
        : kind === "all"
          ? {}
          : { kind: "STANDARD" }),
      ...(status === "archived"
        ? { isActive: false }
        : status === "all"
          ? {}
          : { isActive: true }),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { barcode: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(brandId ? { brandId } : {}),
    },
    include: {
      brand: true,
      category: true,
      unit: true,
      productType: true,
      packagingSku: true,
      stockBalances: warehouse
        ? {
            where: {
              locationType: LocationType.WAREHOUSE,
              locationId: warehouse.id,
            },
          }
        : true,
    },
    orderBy: { name: "asc" },
  });

  const {
    getLowStockThresholds,
    resolveStockStatus,
  } = await import("@/lib/services/low-stock-thresholds.service");
  const thresholds = await getLowStockThresholds(companyId);

  let rows = items.map((p) => {
    const qty = p.stockBalances.reduce(
      (s, b) => s + decimalToNumber(b.quantity),
      0
    );
    const stockStatus = resolveStockStatus({
      quantity: qty,
      accountingType: p.accountingType,
      locationType: "WAREHOUSE",
      thresholds,
    });
    const statusKey = !p.isActive
      ? ("archived" as const)
      : stockStatus === "OUT"
        ? ("empty" as const)
        : stockStatus === "LOW"
          ? ("low" as const)
          : ("active" as const);
    return {
      ...p,
      name: scrubStoredLabel(p.name),
      description: p.description
        ? scrubStoredLabel(p.description)
        : p.description,
      brand: p.brand
        ? { ...p.brand, name: scrubStoredLabel(p.brand.name) }
        : p.brand,
      category: p.category
        ? { ...p.category, name: scrubStoredLabel(p.category.name) }
        : p.category,
      warehouseQty: qty,
      statusKey,
    };
  });

  if (status === "low") {
    rows = rows.filter((p) => p.isActive && p.statusKey === "low");
  }
  if (status === "empty") {
    rows = rows.filter((p) => p.isActive && p.warehouseQty <= 0);
  }

  return rows;
}

export async function listCatalogRefs(companyId: string) {
  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      where: { companyId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.brand.findMany({
      where: { companyId, isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { categories, brands };
}
