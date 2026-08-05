import { decimalToNumber } from "@/lib/utils";

export type PaymentMethodTotal = {
  method: string;
  amount: number;
  count: number;
};

const KNOWN_ORDER = ["CASH", "CARD", "TRANSFER"] as const;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregate sale totals by paymentMethod.
 * Unknown / future methods are included automatically (no hard-coded switch).
 */
export function aggregatePaymentMethods(
  sales: Array<{ paymentMethod?: string | null; total: unknown }>
): PaymentMethodTotal[] {
  const map = new Map<string, { amount: number; count: number }>();

  for (const s of sales) {
    const method = (s.paymentMethod?.trim() || "CASH").toUpperCase();
    const prev = map.get(method) ?? { amount: 0, count: 0 };
    prev.amount += decimalToNumber(s.total as never);
    prev.count += 1;
    map.set(method, prev);
  }

  const rows: PaymentMethodTotal[] = [...map.entries()].map(
    ([method, v]) => ({
      method,
      amount: round2(v.amount),
      count: v.count,
    })
  );

  rows.sort((a, b) => {
    const ia = (KNOWN_ORDER as readonly string[]).indexOf(a.method);
    const ib = (KNOWN_ORDER as readonly string[]).indexOf(b.method);
    if (ia >= 0 || ib >= 0) {
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    }
    return a.method.localeCompare(b.method);
  });

  return rows;
}

/** Ensure CASH / CARD / TRANSFER always appear (zeros when missing). */
export function ensureKnownPaymentMethods(
  rows: PaymentMethodTotal[]
): PaymentMethodTotal[] {
  const byMethod = new Map(rows.map((r) => [r.method, r]));
  const result: PaymentMethodTotal[] = KNOWN_ORDER.map((method) => {
    const existing = byMethod.get(method);
    byMethod.delete(method);
    return existing ?? { method, amount: 0, count: 0 };
  });
  for (const extra of byMethod.values()) {
    result.push(extra);
  }
  return result;
}
