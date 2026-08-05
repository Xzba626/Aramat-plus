"use client";

import { HelpTip } from "@/components/ui/help-tip";

export type PaymentBreakdownRow = {
  method: string;
  amount: number;
  count: number;
};

function paymentMethodLabel(
  method: string,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  const key = `payment.${method}`;
  const labeled = t(key);
  if (labeled !== key) return labeled;
  return method;
}

export function PaymentMethodBreakdown({
  rows,
  formatMoney,
  t,
  titleKey = "dashboard.paymentMethodsTitle",
}: {
  rows: PaymentBreakdownRow[];
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
  titleKey?: string;
}) {
  if (!rows.length) return null;

  return (
    <div className="mt-4">
      <HelpTip hintKey="paymentMethods">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          {t(titleKey)}
        </p>
      </HelpTip>
      <div className="grid gap-2 sm:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.method}
            className="rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-card)]"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {paymentMethodLabel(row.method, t)}
            </div>
            <div className="mt-0.5 text-base font-bold tabular-nums text-ink">
              {formatMoney(row.amount)}
            </div>
            {row.count > 0 ? (
              <div className="mt-0.5 text-[11px] text-muted">
                {t("dashboard.paymentMethodChecks", { count: row.count })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContainerSourceBreakdown({
  storeBottles,
  customerBottles,
  salesCount,
  t,
}: {
  storeBottles: number;
  customerBottles: number;
  salesCount: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (salesCount <= 0 && storeBottles <= 0 && customerBottles <= 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <HelpTip hintKey="containerSource">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          {t("dashboard.containerSourceTitle")}
        </p>
      </HelpTip>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-card)]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("dashboard.containerSalesCount")}
          </div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-ink">
            {salesCount}
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-card)]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("dashboard.containerStoreBottles")}
          </div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-ink">
            {storeBottles}
          </div>
        </div>
        <div className="rounded-[14px] border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-card)]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {t("dashboard.containerCustomerBottles")}
          </div>
          <div className="mt-0.5 text-base font-bold tabular-nums text-ink">
            {customerBottles}
          </div>
        </div>
      </div>
    </div>
  );
}
