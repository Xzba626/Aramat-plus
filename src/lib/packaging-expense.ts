/**
 * Shared packaging / bottle expense markers.
 * Prefer AUTO_BOTTLE description over localized expense type name.
 */
export const BOTTLE_EXPENSE_TYPE_NAME = "Флаконы";

/** Expense.description markers written by createBottleSaleExpenseInTx */
export const AUTO_BOTTLE_PREFIX = "AUTO_BOTTLE";

export function isAutoBottleDescription(description: string | null | undefined) {
  if (!description) return false;
  const d = description.trim();
  return d === AUTO_BOTTLE_PREFIX || d.startsWith(`${AUTO_BOTTLE_PREFIX}|`);
}

/**
 * Classify packaging opex for P&L split.
 * Primary: AUTO_BOTTLE description (rename-safe).
 * Fallback: expense type name "Флаконы" for manual packaging expenses.
 */
export function isPackagingExpenseRow(params: {
  expenseTypeName: string;
  description?: string | null;
}) {
  if (isAutoBottleDescription(params.description)) return true;
  return (
    params.expenseTypeName.trim().toLowerCase() ===
    BOTTLE_EXPENSE_TYPE_NAME.toLowerCase()
  );
}
