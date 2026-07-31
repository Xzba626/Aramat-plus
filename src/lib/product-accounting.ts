import { AccountingType } from "@prisma/client";

/** Normalize RU product-type name for mapping. */
function normalizeProductTypeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * ProductType → AccountingType (Stage 4).
 * Returns null for «Другое» / unknown → UI may choose manually.
 * Safe for client + server (no Prisma client calls).
 */
export function resolveAccountingTypeFromProductTypeName(
  name: string | null | undefined
): AccountingType | null {
  if (!name?.trim()) return null;
  const n = normalizeProductTypeName(name);

  if (n === "масляные духи") return AccountingType.WEIGHT;

  if (
    n === "парфюм" ||
    n === "дезодорант" ||
    n === "освежитель" ||
    n === "освежитель воздуха" ||
    n === "часы" ||
    n === "аксессуары" ||
    n === "подарки"
  ) {
    return AccountingType.PIECE;
  }

  if (n === "другое") return null;
  return null;
}
