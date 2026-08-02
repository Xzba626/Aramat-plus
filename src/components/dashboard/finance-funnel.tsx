import Link from "next/link";
import { HelpTip } from "@/components/ui/help-tip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

export type FinanceFunnelStoreRow = {
  id: string;
  name: string;
  expenses: number;
};

export type FinanceFunnelComparison = {
  today: number;
  yesterday: number;
  diff: number;
};

export type FinanceExpenseLayers = {
  packaging: number;
  operational: number;
};

type Props = {
  scope: "network" | "store";
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  storeExpenses?: FinanceFunnelStoreRow[];
  /** Bottles + opex inside step 3 (same totals already used for net). */
  expenseLayers?: FinanceExpenseLayers | null;
  revenueComparison?: FinanceFunnelComparison | null;
  grossComparison?: FinanceFunnelComparison | null;
  netComparison?: FinanceFunnelComparison | null;
  className?: string;
};

function StepConnector({ symbol }: { symbol: "−" | "=" }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center py-1 lg:px-1.5 lg:py-0"
      aria-hidden
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-page text-base font-bold text-ink">
        {symbol}
      </span>
    </div>
  );
}

/** One compact line: Сегодня / Вчера / Разница — no %. */
function AbsCompare({
  comparison,
}: {
  comparison: FinanceFunnelComparison | null | undefined;
}) {
  const { t, formatMoney } = useI18n();
  if (!comparison) return null;
  const { today, yesterday, diff } = comparison;
  const signed = `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatMoney(Math.abs(diff), { short: true })}`;
  return (
    <p
      className={cn(
        "mt-3 border-t border-border/70 pt-2 text-[11px] leading-snug",
        diff > 0 && "text-zone-money-deep",
        diff < 0 && "text-danger",
        diff === 0 && "text-muted"
      )}
    >
      {t("dashboard.compareTodayYesterday", {
        today: formatMoney(today, { short: true }),
        yesterday: formatMoney(yesterday, { short: true }),
        diff: signed,
      })}
    </p>
  );
}

function FunnelCard({
  step,
  label,
  hintKey,
  value,
  children,
  emphasis,
}: {
  step: number;
  label: string;
  hintKey: string;
  value: string;
  children?: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-[18px] border bg-card p-4 shadow-[var(--shadow-card)]",
        emphasis ? "border-brand/35 ring-1 ring-brand/15" : "border-border"
      )}
    >
      <HelpTip hintKey={hintKey}>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-page text-[10px] font-bold text-brand">
            {step}
          </span>
          {label}
        </span>
      </HelpTip>
      <p
        className={cn(
          "mt-3 text-2xl font-bold tabular-nums tracking-tight sm:text-[1.65rem]",
          emphasis ? "text-brand" : "text-ink"
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

/** Visual finance funnel — display only; numbers from existing dashboard math. */
export function FinanceFunnel({
  scope,
  revenue,
  cogs: _cogs,
  grossProfit,
  expenses,
  netProfit,
  storeExpenses,
  expenseLayers,
  revenueComparison,
  grossComparison,
  netComparison,
  className,
}: Props) {
  const { t, formatMoney } = useI18n();
  void _cogs; // reserved for tooltips / future formula display; not shown in card body
  const storeRows = (storeExpenses ?? [])
    .slice()
    .sort((a, b) => b.expenses - a.expenses);
  const listedSum =
    Math.round(storeRows.reduce((s, r) => s + r.expenses, 0) * 100) / 100;
  const packaging = expenseLayers?.packaging ?? 0;
  const operational = expenseLayers?.operational ?? 0;
  const showLayers = packaging > 0 || operational > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-0 lg:flex-row lg:items-stretch lg:gap-0">
        <FunnelCard
          step={1}
          label={t("dashboard.funnelRevenue")}
          hintKey={scope === "network" ? "funnelRevenue" : "funnelRevenueStore"}
          value={formatMoney(revenue, { short: true })}
        >
          <AbsCompare comparison={revenueComparison} />
        </FunnelCard>

        <StepConnector symbol="−" />

        <FunnelCard
          step={2}
          label={t("dashboard.funnelGross")}
          hintKey="funnelGross"
          value={formatMoney(grossProfit, { short: true })}
        >
          <AbsCompare comparison={grossComparison} />
        </FunnelCard>

        <StepConnector symbol="−" />

        <FunnelCard
          step={3}
          label={t("dashboard.funnelExpenses")}
          hintKey={
            scope === "network" ? "funnelExpenses" : "funnelExpensesStore"
          }
          value={formatMoney(expenses, { short: true })}
        >
          {showLayers ? (
            <ul className="mt-3 space-y-1 border-t border-border/70 pt-2 text-[11px] text-muted">
              <li className="flex justify-between gap-2">
                <span>{t("dashboard.packagingLayer")}</span>
                <span className="tabular-nums text-ink">
                  {formatMoney(packaging, { short: true })}
                </span>
              </li>
              <li className="flex justify-between gap-2">
                <span>{t("dashboard.operationalLayer")}</span>
                <span className="tabular-nums text-ink">
                  {formatMoney(operational, { short: true })}
                </span>
              </li>
            </ul>
          ) : null}

          {scope === "network" && storeRows.length > 0 ? (
            <ul
              className={cn(
                "space-y-1.5 text-xs",
                showLayers ? "mt-2" : "mt-3 border-t border-border/70 pt-2"
              )}
            >
              {storeRows.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2"
                >
                  <Link
                    href={`/stores/${s.id}`}
                    className="truncate font-medium text-ink hover:text-brand"
                  >
                    {s.name}
                  </Link>
                  <span className="shrink-0 tabular-nums text-muted">
                    {formatMoney(s.expenses, { short: true })}
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 font-bold text-ink">
                <span>{t("dashboard.funnelExpensesTotal")}</span>
                <span className="tabular-nums">
                  {formatMoney(expenses, { short: true })}
                </span>
              </li>
              {Math.abs(listedSum - expenses) >= 0.05 ? (
                <li className="text-[10px] font-normal text-muted">
                  {t("dashboard.funnelExpensesUnallocated", {
                    amount: formatMoney(
                      Math.round((expenses - listedSum) * 100) / 100,
                      { short: true }
                    ),
                  })}
                </li>
              ) : null}
            </ul>
          ) : null}
        </FunnelCard>

        <StepConnector symbol="=" />

        <FunnelCard
          step={4}
          label={t("dashboard.funnelNet")}
          hintKey={scope === "network" ? "funnelNet" : "funnelNetStore"}
          value={formatMoney(netProfit, { short: true })}
          emphasis
        >
          <AbsCompare comparison={netComparison} />
        </FunnelCard>
      </div>
    </div>
  );
}

export type StoreProfitRow = {
  id: string;
  name: string;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
};

/** Table: profit by store today + network totals (same numbers as funnel). */
export function StoresProfitTable({
  rows,
  totals,
}: {
  rows: StoreProfitRow[];
  totals: {
    revenue: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
  };
}) {
  const { t, formatMoney } = useI18n();
  const sorted = [...rows].sort((a, b) => b.netProfit - a.netProfit);

  return (
    <div className="overflow-x-auto rounded-[18px] border border-border bg-card shadow-[var(--shadow-card)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-muted">
            <th className="px-4 py-3">{t("dashboard.funnelColStore")}</th>
            <th className="px-4 py-3 text-right">
              {t("dashboard.funnelRevenue")}
            </th>
            <th className="px-4 py-3 text-right">
              {t("dashboard.funnelGross")}
            </th>
            <th className="px-4 py-3 text-right">
              {t("dashboard.funnelExpenses")}
            </th>
            <th className="px-4 py-3 text-right">{t("dashboard.funnelNet")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} className="border-b border-border/70 last:border-0">
              <td className="px-4 py-3">
                <Link
                  href={`/stores/${s.id}`}
                  className="font-semibold text-ink hover:text-brand"
                >
                  {s.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(s.revenue, { short: true })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMoney(s.grossProfit, { short: true })}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted">
                {formatMoney(s.expenses, { short: true })}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right font-bold tabular-nums",
                  s.netProfit < 0 ? "text-danger" : "text-ink"
                )}
              >
                {formatMoney(s.netProfit, { short: true })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-page/80 text-sm font-bold">
            <td className="px-4 py-3">{t("dashboard.funnelNetworkTotal")}</td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatMoney(totals.revenue, { short: true })}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatMoney(totals.grossProfit, { short: true })}
            </td>
            <td className="px-4 py-3 text-right tabular-nums">
              {formatMoney(totals.expenses, { short: true })}
            </td>
            <td
              className={cn(
                "px-4 py-3 text-right tabular-nums",
                totals.netProfit < 0 ? "text-danger" : "text-brand"
              )}
            >
              {formatMoney(totals.netProfit, { short: true })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
