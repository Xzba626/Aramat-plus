/**
 * Unified discount / sale economics (money-safe, single source for validation).
 */

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Reject discount > subtotal or negative discount. */
export function assertDiscountWithinSubtotal(
  subtotal: number,
  discount: number
): void {
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("VALIDATION_ERROR");
  }
  if (!Number.isFinite(discount) || discount < 0) {
    throw new Error("NEGATIVE_DISCOUNT");
  }
  if (discount > subtotal + 1e-9) {
    throw new Error("DISCOUNT_EXCEEDS_TOTAL");
  }
}

export type DiscountEconomics = {
  subtotal: number;
  discount: number;
  finalRevenue: number;
  cogs: number;
  grossProfit: number;
  /** Largest discount keeping finalRevenue >= COGS (may be > subtotal cap). */
  maxDiscountWithoutLoss: number;
  belowCost: boolean;
};

export function computeDiscountEconomics(params: {
  subtotal: number;
  discount: number;
  cogs: number;
}): DiscountEconomics {
  const subtotal = money(params.subtotal);
  const discount = money(params.discount);
  const cogs = money(params.cogs);
  assertDiscountWithinSubtotal(subtotal, discount);
  const finalRevenue = money(subtotal - discount);
  const grossProfit = money(finalRevenue - cogs);
  const maxDiscountWithoutLoss = money(Math.max(0, subtotal - cogs));
  const belowCost = finalRevenue + 1e-9 < cogs;
  return {
    subtotal,
    discount,
    finalRevenue,
    cogs,
    grossProfit,
    maxDiscountWithoutLoss,
    belowCost,
  };
}

/** Sum line revenue: unitPrice × quantity. */
export function sumLineRevenue(
  lines: Array<{ salePrice: number; quantity: number }>
): number {
  return money(
    lines.reduce((s, l) => s + l.salePrice * l.quantity, 0)
  );
}

/** Sum actual COGS from committed sale line rows (FIFO snapshot). */
export function sumActualCogsFromLines(
  lines: Array<{
    costPerUnit: number;
    quantity: number;
    packagingCostPerUnit?: number | null;
    packagingQuantity?: number | null;
  }>
): number {
  return money(
    lines.reduce((s, l) => {
      let c = l.costPerUnit * l.quantity;
      if (l.packagingCostPerUnit != null && l.packagingQuantity != null) {
        c += l.packagingCostPerUnit * l.packagingQuantity;
      }
      return s + c;
    }, 0)
  );
}

/**
 * Require explicit owner confirmation for below-COGS or zero-revenue direct sales.
 * Approved discount requests skip this (owner already decided).
 */
export function assertSaleRiskConfirmation(params: {
  subtotal: number;
  discount: number;
  actualCogs: number;
  /** OWNER/ADMIN direct discount path (not seller / not pre-approved request). */
  requiresOwnerConfirmation: boolean;
  confirmBelowCost?: boolean;
  /** Pre-approved discount request — owner already reviewed. */
  approvedDiscountRequest?: boolean;
}): void {
  if (params.approvedDiscountRequest) return;

  const econ = computeDiscountEconomics({
    subtotal: params.subtotal,
    discount: params.discount,
    cogs: params.actualCogs,
  });

  const needsConfirm = econ.belowCost || econ.finalRevenue <= 1e-9;
  if (!needsConfirm) return;

  if (params.requiresOwnerConfirmation && params.confirmBelowCost) return;

  if (params.requiresOwnerConfirmation) {
    throw new Error("BELOW_COST_CONFIRMATION_REQUIRED");
  }

  throw new Error("SALE_BELOW_COST_NOT_ALLOWED");
}
