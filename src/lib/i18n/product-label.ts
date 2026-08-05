/** Product pick/list labels — always show accounting unit to avoid PIECE/WEIGHT twins. */

export type ProductNameParts = {
  name: string;
  accountingType?: string | null;
  category?: string | null;
  unitSymbol?: string | null;
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function accountingUnitLabel(
  accountingType: string | null | undefined,
  t: TranslateFn,
  unitSymbol?: string | null
): string {
  if (unitSymbol?.trim()) return unitSymbol.trim();
  if (accountingType === "WEIGHT") return t("warehouse.unitMl");
  return t("warehouse.unitPcs");
}

/** `Dior Sauvage · шт` */
export function formatProductName(
  product: ProductNameParts,
  t: TranslateFn
): string {
  const unit = accountingUnitLabel(
    product.accountingType,
    t,
    product.unitSymbol
  );
  return `${product.name} · ${unit}`;
}

/** Multi-line pick hint: name · unit + category | unit */
export function formatProductPickLines(
  product: ProductNameParts,
  t: TranslateFn
): { title: string; subtitle: string } {
  const unit = accountingUnitLabel(
    product.accountingType,
    t,
    product.unitSymbol
  );
  const cat = product.category?.trim() || "—";
  return {
    title: `${product.name} · ${unit}`,
    subtitle: `${cat} | ${unit}`,
  };
}
