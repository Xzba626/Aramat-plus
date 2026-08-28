import { prisma } from "@/lib/prisma";
import type { AccountingType, Product } from "@prisma/client";

/** Fingerprint for double-submit / idempotency on product create. */
export function productCreateFingerprint(params: {
  userId: string;
  name: string;
  brandId?: string | null;
  categoryId?: string | null;
  accountingType: AccountingType | string;
  salePrice: number;
  sku?: string | null;
  idempotencyKey?: string | null;
}): string {
  const key = params.idempotencyKey?.trim();
  if (key) return key.slice(0, 120);
  const norm = params.name.trim().toLowerCase();
  const sku = params.sku?.trim().toLowerCase() ?? "";
  return `pc:${params.userId}|${norm}|${sku}|${params.brandId ?? ""}|${params.categoryId ?? ""}|${params.accountingType}|${params.salePrice}`;
}

/**
 * Return product created in the last `withinMs` with the same fingerprint
 * (prevents double-click / duplicate POST within one operation).
 */
export async function findRecentProductCreateByFingerprint(params: {
  companyId: string;
  userId: string;
  fingerprint: string;
  withinMs?: number;
}): Promise<Product | null> {
  const since = new Date(Date.now() - (params.withinMs ?? 15_000));
  const recent = await prisma.activityLog.findMany({
    where: {
      companyId: params.companyId,
      userId: params.userId,
      action: "PRODUCT_CREATE",
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { entityId: true, metadata: true },
  });

  for (const row of recent) {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    if (meta?.createFingerprint !== params.fingerprint || !row.entityId) continue;
    const product = await prisma.product.findFirst({
      where: { id: row.entityId, companyId: params.companyId },
    });
    if (product) return product;
  }
  return null;
}

/**
 * Reject logically identical catalog entries (server-side, not only double-click dedup).
 * Different SKU ⇒ different product even if name matches (e.g. Harizma A vs Harizma B).
 */
export async function findLogicalDuplicateProduct(params: {
  companyId: string;
  name: string;
  brandId?: string | null;
  categoryId?: string | null;
  accountingType: AccountingType;
  unitId: string;
  sku?: string | null;
  excludeId?: string;
}): Promise<Product | null> {
  const sku = params.sku?.trim() || null;
  const notSelf = params.excludeId ? { NOT: { id: params.excludeId } } : {};

  if (sku) {
    return prisma.product.findFirst({
      where: {
        companyId: params.companyId,
        sku: { equals: sku, mode: "insensitive" },
        ...notSelf,
      },
    });
  }

  return prisma.product.findFirst({
    where: {
      companyId: params.companyId,
      name: { equals: params.name.trim(), mode: "insensitive" },
      brandId: params.brandId ?? null,
      categoryId: params.categoryId ?? null,
      accountingType: params.accountingType,
      ...(params.unitId ? { unitId: params.unitId } : { unitId: null }),
      OR: [{ sku: null }, { sku: "" }],
      ...notSelf,
    },
  });
}
