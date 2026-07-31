import { AccountingType, type PrismaClient } from "@prisma/client";
import { resolveAccountingTypeFromProductTypeName } from "@/lib/product-accounting";

export { resolveAccountingTypeFromProductTypeName } from "@/lib/product-accounting";

const DEFAULT_PRODUCT_TYPES = [
  "Парфюм",
  "Масляные духи",
  "Дезодорант",
  "Освежитель воздуха",
  "Часы",
  "Аксессуары",
  "Подарки",
  "Другое",
] as const;

/** Resolve accounting type from productTypeId; null = manual («Другое»). */
export async function resolveAccountingTypeForProductTypeId(
  prisma: PrismaClient,
  companyId: string,
  productTypeId: string | null | undefined
): Promise<AccountingType | null> {
  if (!productTypeId) return null;
  const pt = await prisma.productType.findFirst({
    where: { id: productTypeId, companyId },
    select: { name: true },
  });
  if (!pt) throw new Error("PRODUCT_TYPE_NOT_FOUND");
  return resolveAccountingTypeFromProductTypeName(pt.name);
}

/**
 * Final accounting type for create/update.
 * Known types override client; «Другое» keeps client choice.
 */
export async function resolveProductAccountingType(
  prisma: PrismaClient,
  companyId: string,
  productTypeId: string | null | undefined,
  clientAccountingType: AccountingType
): Promise<AccountingType> {
  const mapped = await resolveAccountingTypeForProductTypeId(
    prisma,
    companyId,
    productTypeId
  );
  return mapped ?? clientAccountingType;
}

/** Ensure company has analytics product types (idempotent). */
export async function ensureDefaultProductTypes(
  prisma: PrismaClient,
  companyId: string
) {
  const existing = await prisma.productType.findMany({
    where: { companyId },
    select: { name: true },
  });
  const have = new Set(existing.map((t) => t.name));
  const missing = DEFAULT_PRODUCT_TYPES.filter((n) => !have.has(n));
  if (missing.length === 0) return;
  await prisma.productType.createMany({
    data: missing.map((name) => ({ name, companyId })),
    skipDuplicates: true,
  });
}

/** ARM-{BRAND|GEN}-{####} */
export async function nextProductSku(
  prisma: PrismaClient,
  companyId: string,
  brandName?: string | null
) {
  const count = await prisma.product.count({ where: { companyId } });
  const raw = (brandName ?? "GEN").replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "");
  const prefix = (raw.slice(0, 3) || "GEN").toUpperCase();
  return `ARM-${prefix}-${String(count + 1).padStart(4, "0")}`;
}

/** Pick мл / шт unit for company by accounting type. */
export async function resolveUnitId(
  prisma: PrismaClient,
  companyId: string,
  accountingType: AccountingType,
  explicitUnitId?: string | null
) {
  if (explicitUnitId) return explicitUnitId;
  const symbol = accountingType === AccountingType.WEIGHT ? "мл" : "шт";
  const unit = await prisma.unit.findFirst({
    where: { companyId, symbol },
  });
  if (unit) return unit.id;
  const fallback = await prisma.unit.findFirst({ where: { companyId } });
  return fallback?.id ?? null;
}
