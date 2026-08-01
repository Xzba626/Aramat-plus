"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Package,
  PackagePlus,
  Receipt,
  Store,
  TrendingUp,
  Truck,
  AlertTriangle,
  Wallet,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { cn } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { useI18n } from "@/components/i18n/i18n-provider";

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-full min-w-[6px] rounded-sm bg-zone-money/30"
          style={{ height: `${Math.max(12, Math.round((v / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function greetKey(
  hour: number
): "dashboard.greetMorning" | "dashboard.greetDay" | "dashboard.greetEvening" {
  if (hour < 12) return "dashboard.greetMorning";
  if (hour < 18) return "dashboard.greetDay";
  return "dashboard.greetEvening";
}

function ZoneHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-bold text-ink sm:text-lg">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

function TodayKpi({
  label,
  hintKey,
  value,
  emptyLabel,
  delta,
  vsYesterdayLabel,
}: {
  label: string;
  hintKey: string;
  value: string;
  emptyLabel?: string;
  delta?: { pct: number; label: string };
  vsYesterdayLabel: string;
}) {
  const isEmpty = value === "—" || value === "0 с." || value === "0";
  return (
    <div className="rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <HelpTip hintKey={hintKey}>
          <span className="text-xs font-bold uppercase tracking-wide text-muted">
            {label}
          </span>
        </HelpTip>
      </div>
      {isEmpty && emptyLabel ? (
        <>
          <p className="mt-3 text-lg font-bold text-muted">—</p>
          <p className="mt-1 text-xs text-muted">{emptyLabel}</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-ink">
            {value}
          </p>
          {delta ? (
            <p
              className={cn(
                "mt-1 flex items-center gap-0.5 text-xs font-semibold",
                delta.pct > 0 && "text-zone-money-deep",
                delta.pct < 0 && "text-danger",
                delta.pct === 0 && "text-muted"
              )}
            >
              {delta.pct > 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : delta.pct < 0 ? (
                <ArrowDownRight className="h-3.5 w-3.5" />
              ) : null}
              {delta.label} {vsYesterdayLabel}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

type ActionTile = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
};

const ACTIONS: ActionTile[] = [
  { href: "/warehouse/receive?tab=batch", labelKey: "dashboard.actionReceive", icon: PackagePlus },
  { href: "/warehouse/transfers/new", labelKey: "dashboard.actionTransfer", icon: Truck },
  { href: "/analytics", labelKey: "dashboard.actionReport", icon: BarChart3 },
  { href: "/warehouse/new", labelKey: "dashboard.actionNewProduct", icon: Plus },
  { href: "/warehouse/stock", labelKey: "dashboard.actionCheckStock", icon: Package },
];

type TrafficLevel = "red" | "yellow" | "green";

export function OwnerDashboardClient({
  initial,
  userName,
}: {
  initial: DashboardPayload;
  userName: string;
}) {
  const { t, formatMoney, formatDateTime } = useI18n();
  const [data, setData] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hour, setHour] = useState(12);

  const refreshStats = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return;
    setData(await res.json());
  }, []);

  useEffect(() => {
    setHour(new Date().getHours());
    const stats = setInterval(refreshStats, 30_000);
    const decisions = setInterval(refreshStats, 10_000);
    return () => {
      clearInterval(stats);
      clearInterval(decisions);
    };
  }, [refreshStats]);

  async function decide(
    kind: "DISCOUNT" | "RETURN",
    id: string,
    decision: "APPROVE" | "REJECT"
  ) {
    setBusyId(id);
    const url =
      kind === "DISCOUNT"
        ? `/api/discount-requests/${id}/decision`
        : `/api/returns/${id}/decision`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setBusyId(null);
    if (res.ok) refreshStats();
  }

  const { today, decisionSummary, decisions } = data;
  const pulse = data.pulse ?? {
    warehouseUnits: 0,
    warehouseSku: 0,
    lowStockCount: data.lowStock.length,
    storesOpen: data.stores.filter((s) => s.salesCount > 0).length,
    storesTotal: data.stores.length,
    sparkline: [0, 0, 0, 0, 0, 0, today.revenue],
  };

  const displayName = userName.trim() || t("roles.owner");
  const firstName = displayName.split(/\s+/)[0] || displayName;

  const traffic = useMemo((): {
    level: TrafficLevel;
    text: string;
    badge: string;
  } => {
    if (decisionSummary.total > 0 || data.lowStock.some((p) => p.empty)) {
      return {
        level: "red",
        text: t("dashboard.statusAttention", { n: decisionSummary.total }),
        badge: t("dashboard.trafficRed"),
      };
    }
    if (pulse.lowStockCount > 0 || data.stores.some((s) => s.salesCount === 0)) {
      return {
        level: "yellow",
        text: t("dashboard.statusLowStock", { n: pulse.lowStockCount }),
        badge: t("dashboard.trafficYellow"),
      };
    }
    if (today.deltas.revenue.pct > 0) {
      return {
        level: "green",
        text: t("dashboard.statusSalesUp", { pct: today.deltas.revenue.label }),
        badge: t("dashboard.trafficGreen"),
      };
    }
    return {
      level: "green",
      text: t("dashboard.statusAllGood"),
      badge: t("dashboard.trafficGreen"),
    };
  }, [data.lowStock, data.stores, decisionSummary.total, pulse.lowStockCount, t, today.deltas.revenue]);

  const bestStore =
    data.stores.find((s) => s.id === data.bestStoreId) ??
    [...data.stores].sort((a, b) => b.revenue - a.revenue)[0];
  const worstStore =
    data.stores.find((s) => s.id === data.worstStoreId) ??
    [...data.stores].sort((a, b) => a.revenue - b.revenue)[0];
  const quietStores = data.stores.filter((s) => s.salesCount === 0);

  const hasSales = today.count > 0;

  const trafficStyles: Record<TrafficLevel, string> = {
    red: "border-danger/30 bg-danger/5",
    yellow: "border-zone-alert/30 bg-zone-alert-soft",
    green: "border-zone-money/25 bg-zone-money-soft",
  };
  const trafficDot: Record<TrafficLevel, string> = {
    red: "bg-danger",
    yellow: "bg-zone-alert",
    green: "bg-zone-money",
  };

  return (
    <div className="space-y-10">
      {/* Header + traffic light */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {t(greetKey(hour), { name: firstName })}
        </h2>
        <Link
          href="/attention"
          className={cn(
            "flex items-center gap-3 rounded-[18px] border px-4 py-3.5 transition hover:shadow-[var(--shadow-card)]",
            trafficStyles[traffic.level]
          )}
        >
          <span
            className={cn("h-3 w-3 shrink-0 rounded-full", trafficDot[traffic.level])}
          />
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
              {traffic.badge}
            </span>
            <p className="text-sm font-medium text-ink">{traffic.text}</p>
          </div>
          <span className="text-sm font-semibold text-brand">
            {t("dashboard.attentionGo")} →
          </span>
        </Link>
      </section>

      {/* Zone 1 — Today */}
      <section>
        <ZoneHeader title={t("dashboard.zoneToday")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TodayKpi
            label={t("dashboard.salesToday")}
            hintKey="todayRevenue"
            value={hasSales ? formatMoney(today.revenue, { short: true }) : "—"}
            emptyLabel={t("dashboard.noSalesYet")}
            delta={hasSales ? today.deltas.revenue : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
          />
          <TodayKpi
            label={t("dashboard.netProfit")}
            hintKey="dashboardProfit"
            value={hasSales ? formatMoney(today.profit, { short: true }) : "—"}
            emptyLabel={t("dashboard.noProfitYet")}
            delta={hasSales ? today.deltas.profit : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
          />
          <TodayKpi
            label={t("dashboard.checksToday")}
            hintKey="dashboardChecks"
            value={hasSales ? String(today.count) : "—"}
            emptyLabel={t("dashboard.noChecksYet")}
            delta={hasSales ? today.deltas.count : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
          />
          <TodayKpi
            label={t("dashboard.avgCheck")}
            hintKey="dashboardAvgCheck"
            value={hasSales ? formatMoney(today.avgCheck, { short: true }) : "—"}
            emptyLabel={t("dashboard.noSalesHint")}
            delta={hasSales ? today.deltas.avgCheck : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
          />
        </div>
        <div className="mt-4 rounded-[18px] border border-zone-money/20 bg-zone-money-soft/50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-zone-money-deep">
              {t("dashboard.weekSales")}
            </span>
            <Link href="/analytics" className="text-xs font-semibold text-brand hover:underline">
              {t("dashboard.details")} →
            </Link>
          </div>
          <Sparkline values={pulse.sparkline} />
        </div>
      </section>

      {/* Zone 2 — Attention */}
      <section id="decisions">
        <ZoneHeader
          title={t("dashboard.zoneAttention")}
          subtitle={t("dashboard.attentionSubtitle")}
        />

        {decisionSummary.total === 0 &&
        data.lowStock.length === 0 &&
        quietStores.length === 0 ? (
          <div className="flex items-start gap-3 rounded-[18px] border border-zone-money/20 bg-zone-money-soft p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-zone-money-deep" />
            <p className="text-sm font-medium text-zone-money-deep">
              {t("dashboard.attentionOk")}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {decisions.map((d) => (
              <div
                key={`${d.type}-${d.id}`}
                className="rounded-[18px] border border-danger/20 border-l-4 border-l-danger bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-danger" />
                      <span className="text-sm font-bold text-ink">{t(d.titleKey)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {formatDateTime(d.createdAt)} · {d.storeName} · {d.actorName}
                    </p>
                    <p className="mt-1 text-sm text-ink">
                      {d.products ||
                        (d.productsFallbackKey ? t(d.productsFallbackKey) : "—")}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      fullWidth={false}
                      disabled={busyId === d.id}
                      onClick={() => decide(d.type, d.id, "APPROVE")}
                    >
                      {t("common.approve")}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      fullWidth={false}
                      disabled={busyId === d.id}
                      onClick={() => decide(d.type, d.id, "REJECT")}
                    >
                      {t("common.reject")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {data.lowStock.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-l-4 bg-card p-4 shadow-[var(--shadow-card)]",
                  p.empty ? "border-danger/20 border-l-danger" : "border-zone-alert/20 border-l-zone-alert"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      p.empty ? "bg-danger" : "bg-zone-alert"
                    )}
                  />
                  <div>
                    <p className="font-semibold text-ink">{p.name}</p>
                    <p className={cn("text-sm", p.empty ? "text-danger" : "text-muted")}>
                      {p.empty
                        ? t("dashboard.outOfStock")
                        : t("dashboard.leftQty", { qty: p.quantity, unit: p.unit })}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/warehouse/${p.productId}`}
                  className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white hover:brightness-110"
                >
                  {t("dashboard.openProduct")}
                </Link>
              </div>
            ))}

            {quietStores.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-l-4 border-l-zone-alert border-zone-alert/20 bg-card p-4 shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-zone-alert" />
                  <p className="font-semibold text-ink">
                    {t("dashboard.attentionNoSales", { name: s.name })}
                  </p>
                </div>
                <Link
                  href={`/stores/${s.id}`}
                  className="rounded-xl border border-border bg-page px-3 py-2 text-xs font-bold text-ink hover:border-brand/30"
                >
                  {t("dashboard.openStoreBtn")}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Zone 3 — Network */}
      <section>
        <ZoneHeader title={t("dashboard.zoneNetwork")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bestStore && bestStore.revenue > 0 ? (
            <Link
              href={`/stores/${bestStore.id}`}
              className="rounded-[18px] border border-zone-money/25 bg-zone-money-soft p-4 transition hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zone-money-deep">
                <TrendingUp className="h-4 w-4" />
                {t("dashboard.bestStoreLabel")}
              </div>
              <p className="mt-2 truncate text-lg font-bold text-ink">{bestStore.name}</p>
              <p className="mt-1 text-sm tabular-nums text-zone-money-deep">
                {formatMoney(bestStore.revenue, { short: true })} ·{" "}
                {t("dashboard.profitTodayShort", {
                  amount: formatMoney(bestStore.profit, { short: true }),
                })}
              </p>
            </Link>
          ) : null}

          {worstStore && data.stores.length > 1 ? (
            <Link
              href={`/stores/${worstStore.id}`}
              className="rounded-[18px] border border-border bg-card p-4 transition hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
                <Store className="h-4 w-4" />
                {t("dashboard.worstStoreLabel")}
              </div>
              <p className="mt-2 truncate text-lg font-bold text-ink">{worstStore.name}</p>
              <p className="mt-1 text-sm tabular-nums text-muted">
                {worstStore.revenue > 0
                  ? formatMoney(worstStore.revenue, { short: true })
                  : t("dashboard.noSalesYet")}
              </p>
            </Link>
          ) : null}

          <div className="rounded-[18px] border border-zone-stores/25 bg-zone-stores-soft/40 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-zone-stores-deep">
              <Receipt className="h-4 w-4" />
              {t("dashboard.quietStores")}
            </div>
            {quietStores.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-zone-stores-deep">
                {t("dashboard.allStoresSold")}
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {quietStores.slice(0, 4).map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/stores/${s.id}`}
                      className="text-sm font-semibold text-ink hover:text-brand"
                    >
                      {s.name} →
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Zone 4 — Actions */}
      <section>
        <ZoneHeader title={t("dashboard.zoneActions")} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="flex min-h-[100px] flex-col items-center justify-center gap-2.5 rounded-[18px] border border-border bg-card p-4 text-center shadow-[var(--shadow-card)] transition hover:border-brand/40 hover:shadow-[var(--shadow-lift)] active:scale-[0.98]"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="text-xs font-bold text-ink sm:text-sm">{t(a.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** @deprecated kept for any imports */
export function DeltaBadge({
  pct,
  label,
}: {
  pct: number;
  label: string;
}) {
  const up = pct > 0;
  const flat = pct === 0;
  return (
    <span
      className={cn(
        "mt-1 inline-flex text-xs font-semibold",
        flat && "text-muted",
        up && "text-success",
        !up && !flat && "text-danger"
      )}
    >
      {flat ? "→" : up ? "↑" : "↓"} {label}
    </span>
  );
}
