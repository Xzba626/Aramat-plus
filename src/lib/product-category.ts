import { AccountingType } from "@prisma/client";

/** Owner TZ Part 4 — warehouse category catalog (not ProductType analytics). */
export const DEFAULT_CATEGORIES = [
  "Аксессуары",
  "Дезодоранты",
  "Освежитель воздуха",
  "Парфюм",
  "Подарки",
  "Часы",
  "Другое",
] as const;

export type DefaultCategoryName = (typeof DEFAULT_CATEGORIES)[number];

function normalizeCategoryName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Suggested sales method for a category.
 * `null` = user must choose (Парфюм / Другое / unknown).
 */
export function resolveAccountingTypeFromCategoryName(
  name: string | null | undefined
): AccountingType | null {
  if (!name?.trim()) return null;
  const n = normalizeCategoryName(name);

  if (n === "парфюм" || n === "другое") return null;

  if (
    n === "часы" ||
    n === "аксессуары" ||
    n === "дезодоранты" ||
    n === "дезодорант" ||
    n === "подарки" ||
    n === "освежитель воздуха" ||
    n === "освежитель"
  ) {
    return AccountingType.PIECE;
  }

  return null;
}
