"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Role } from "@prisma/client";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Package,
  PackagePlus,
  RotateCcw,
  Store,
  TrendingUp,
  AlertTriangle,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/ui/help-tip";
import { cn } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { useI18n } from "@/components/i18n/i18n-provider";
import { entityHref, labelAction } from "@/lib/i18n/labels";

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
  subtitle,
  comparison,
}: {
  label: string;
  hintKey: string;
  value: string;
  emptyLabel?: string;
  delta?: {
    pct: number;
    label: string;
    abs: number;
    absLabel?: string;
    current?: number;
    previous?: number;
    isNew?: boolean;
  };
  vsYesterdayLabel: string;
  subtitle?: string;
  comparison?: { today: number; yesterday: number; diff: number } | null;
}) {
  const { formatMoney, t } = useI18n();
  const isEmpty = value === "—" || value === "0 с." || value === "0";
  const signedDelta =
    delta && delta.abs !== 0
      ? `${delta.abs > 0 ? "+" : "−"}${formatMoney(Math.abs(delta.abs), { short: true })}`
      : delta
        ? formatMoney(0, { short: true })
        : null;
  return (
    <div className="rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <HelpTip hintKey={hintKey}>
        <span className="text-xs font-bold uppercase tracking-wide text-muted">
          {label}
        </span>
      </HelpTip>
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
          {subtitle ? (
            <p className="mt-1 text-xs text-muted">{subtitle}</p>
          ) : null}
          {comparison ? (
            <p className="mt-2 text-[11px] leading-snug text-muted">
              {t("dashboard.compareTodayYesterday", {
                today: formatMoney(comparison.today, { short: true }),
                yesterday: formatMoney(comparison.yesterday, { short: true }),
                diff: `${comparison.diff > 0 ? "+" : comparison.diff < 0 ? "−" : ""}${formatMoney(Math.abs(comparison.diff), { short: true })}`,
              })}
            </p>
          ) : null}
          {delta ? (
            <>
              <p
                className={cn(
                  "mt-1 flex items-center gap-0.5 text-xs font-semibold",
                  delta.abs > 0 && "text-zone-money-deep",
                  delta.abs < 0 && "text-danger",
                  delta.abs === 0 && "text-muted"
                )}
              >
                {delta.abs > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : delta.abs < 0 ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : null}
                {signedDelta} {vsYesterdayLabel}
              </p>
              {delta.isNew || delta.pct !== 0 ? (
                <p
                  className={cn(
                    "mt-0.5 text-[10px] font-medium",
                    delta.isNew && "text-muted",
                    !delta.isNew && delta.abs > 0 && "text-zone-money-deep",
                    !delta.isNew && delta.abs < 0 && "text-danger",
                    !delta.isNew && delta.abs === 0 && "text-muted"
                  )}
                >
                  {delta.isNew ? t("dashboard.deltaNew") : delta.label}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

type DecisionChip = {
  href: string;
  count: number;
  labelKey: string;
  icon: LucideIcon;
  tone: "danger" | "alert" | "muted";
};

type TrafficLevel = "red" | "yellow" | "green";

export function OwnerDashboardClient({
  initial,
  userName,
  userRole,
}: {
  initial: DashboardPayload;
  userName: string;
  userRole: Role;
}) {
  const { t, formatMoney, formatDateTime } = useI18n();
  const [data, setData] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hour, setHour] = useState(12);
  const [chartRange, setChartRange] = useState<"7d" | "30d">("7d");
  const canDecide = userRole === Role.OWNER;

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
    if (res.status === 403) return;
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
    netSparkline: [0, 0, 0, 0, 0, 0, today.netProfit ?? today.profit],
    sparklineLabels: [] as string[],
    netSparklineMonth: [] as number[],
    sparklineLabelsMonth: [] as string[],
  };

  const chartValues =
    chartRange === "30d" &&
    pulse.netSparklineMonth &&
    pulse.netSparklineMonth.length
      ? pulse.netSparklineMonth
      : pulse.netSparkline && pulse.netSparkline.length
        ? pulse.netSparkline
        : pulse.sparkline;
  const chartLabels =
    chartRange === "30d" && pulse.sparklineLabelsMonth?.length
      ? pulse.sparklineLabelsMonth
      : pulse.sparklineLabels ?? [];
  const chartMax = Math.max(...chartValues.map((v) => Math.abs(v)), 1);

  const sortedStores = useMemo(
    () =>
      [...data.stores].sort(
        (a, b) =>
          (b.netProfit ?? b.profit ?? 0) - (a.netProfit ?? a.profit ?? 0)
      ),
    [data.stores]
  );

  const displayName = userName.trim() || t("roles.owner");
  const firstName = displayName.split(/\s+/)[0] || displayName;
  const hasSales = today.count > 0;

  const decisionChips: DecisionChip[] = [
    {
      href: "/discounts",
      count: decisionSummary.discount,
      labelKey: "dashboard.chipDiscounts",
      icon: Bell,
      tone: "danger",
    },
    {
      href: "/returns",
      count: decisionSummary.return,
      labelKey: "dashboard.chipReturns",
      icon: RotateCcw,
      tone: "danger",
    },
  ];

  const infoChips: DecisionChip[] = [
    {
      href: "/warehouse/stock",
      count: decisionSummary.lowStock ?? pulse.lowStockCount,
      labelKey: "dashboard.chipLowStock",
      icon: Package,
      tone: "alert",
    },
    {
      href: "/revision",
      count: decisionSummary.revision ?? 0,
      labelKey: "dashboard.chipRevisions",
      icon: ClipboardList,
      tone: "alert",
    },
  ];

  const attentionTotal = decisionSummary.discount + decisionSummary.return;

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
    // Low stock only when there are actually low-stock SKUs (never "Заканчиваются 0")
    if (pulse.lowStockCount > 0) {
      return {
        level: "yellow",
        text: t("dashboard.statusLowStock", { n: pulse.lowStockCount }),
        badge: t("dashboard.trafficYellow"),
      };
    }
    // Quiet store(s) today — separate, neutral message (not stock alarm)
    if (data.stores.some((s) => s.salesCount === 0)) {
      return {
        level: "yellow",
        text: t("dashboard.statusNoSalesToday"),
        badge: t("dashboard.trafficYellow"),
      };
    }
    if (today.deltas.revenue.pct > 0 && !today.deltas.revenue.isNew) {
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
  }, [
    data.lowStock,
    data.stores,
    decisionSummary.total,
    pulse.lowStockCount,
    t,
    today.deltas.revenue,
  ]);

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

  const recent = data.recent ?? [];

  return (
    <div className="space-y-10">
      {/* Control Center header */}
      <section className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand">
            {t("dashboard.controlCenter")}
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t(greetKey(hour), { name: firstName })}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("dashboard.controlHint")}</p>
        </div>
        <Link
          href="#decisions"
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

      {/* Today — money */}
      <section>
        <ZoneHeader title={t("dashboard.zoneToday")} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TodayKpi
            label={t("dashboard.revenueLabel")}
            hintKey="todayRevenue"
            value={hasSales ? formatMoney(today.revenue, { short: true }) : "—"}
            emptyLabel={t("dashboard.noSalesYet")}
            delta={hasSales ? today.deltas.revenue : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
            comparison={
              hasSales
                ? {
                    today: today.revenue,
                    yesterday: today.yesterday?.revenue ?? 0,
                    diff: today.deltas.revenue.abs,
                  }
                : null
            }
          />
          <TodayKpi
            label={t("dashboard.grossProfitLabel")}
            hintKey="dashboardProfit"
            value={
              hasSales
                ? formatMoney(today.grossProfit ?? today.profit, { short: true })
                : "—"
            }
            emptyLabel={t("dashboard.noProfitYet")}
            delta={hasSales ? today.deltas.grossProfit : undefined}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
            subtitle={
              hasSales
                ? `${t("dashboard.costLabel")}: ${formatMoney(today.cogs ?? 0, { short: true })}`
                : undefined
            }
            comparison={
              hasSales
                ? {
                    today: today.grossProfit ?? today.profit,
                    yesterday: today.yesterday?.grossProfit ?? 0,
                    diff: today.deltas.grossProfit.abs,
                  }
                : null
            }
          />
          <TodayKpi
            label={t("dashboard.netProfit")}
            hintKey="dashboardProfit"
            value={formatMoney(today.netProfit ?? today.profit, { short: true })}
            emptyLabel={t("dashboard.noProfitYet")}
            delta={today.deltas.netProfit}
            vsYesterdayLabel={t("dashboard.vsYesterday")}
            subtitle={t("dashboard.netProfitProrateHint")}
            comparison={{
              today: today.netProfit ?? today.profit,
              yesterday: today.yesterday?.netProfit ?? 0,
              diff: today.deltas.netProfit.abs,
            }}
          />
        </div>

        <div className="mt-3 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("dashboard.expenseLayersTitle")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {t("dashboard.cogsLayer")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                {formatMoney(today.cogs ?? 0, { short: true })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {t("dashboard.packagingLayer")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                {formatMoney(today.packagingCost ?? 0, { short: true })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {t("dashboard.operationalLayer")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-ink">
                {formatMoney(today.operationalExpenses ?? 0, { short: true })}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("dashboard.expenseLayersHint", {
              total: formatMoney(today.expenses ?? 0, { short: true }),
            })}
          </p>
        </div>

        {chartValues.length > 0 ? (
          <div className="mt-4 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {t("dashboard.weekNetProfit")}
              </p>
              <div className="flex gap-1 rounded-full border border-border p-0.5">
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold",
                    chartRange === "7d"
                      ? "bg-brand text-white"
                      : "text-muted hover:text-ink"
                  )}
                  onClick={() => setChartRange("7d")}
                >
                  {t("dashboard.chart7d")}
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold",
                    chartRange === "30d"
                      ? "bg-brand text-white"
                      : "text-muted hover:text-ink"
                  )}
                  onClick={() => setChartRange("30d")}
                >
                  {t("dashboard.chart30d")}
                </button>
              </div>
            </div>
            <div className="flex items-end gap-0.5 sm:gap-1 overflow-x-auto">
              {chartValues.map((val, i) => {
                const barPct = Math.max(4, (Math.abs(val) / chartMax) * 100);
                const dayLabel = chartLabels[i];
                const weekday = dayLabel
                  ? new Date(`${dayLabel}T12:00:00`).toLocaleDateString(
                      undefined,
                      {
                        weekday: chartRange === "7d" ? "short" : undefined,
                        day: chartRange === "30d" ? "numeric" : undefined,
                      }
                    )
                  : String(i + 1);
                return (
                  <div
                    key={dayLabel ?? i}
                    className={cn(
                      "flex min-w-0 flex-col items-center gap-1",
                      chartRange === "30d" ? "w-2 shrink-0 sm:w-2.5" : "flex-1"
                    )}
                  >
                    {chartRange === "7d" ? (
                      <span className="text-[9px] tabular-nums text-muted sm:text-[10px]">
                        {formatMoney(val, { short: true })}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        "flex w-full items-end justify-center",
                        chartRange === "30d" ? "h-14" : "h-16 sm:h-20"
                      )}
                    >
                      <div
                        className={cn(
                          "w-full rounded-t-md",
                          chartRange === "7d" && "max-w-[28px] sm:max-w-[36px]",
                          val >= 0 ? "bg-brand/75" : "bg-danger/60"
                        )}
                        style={{ height: `${barPct}%` }}
                        title={`${dayLabel ?? ""}: ${formatMoney(val, { short: true })}`}
                      />
                    </div>
                    {chartRange === "7d" || i % 5 === 0 ? (
                      <span className="truncate text-[8px] text-muted sm:text-[10px]">
                        {weekday}
                      </span>
                    ) : (
                      <span className="h-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* Request center — decisions vs informational alerts */}
      <section id="decisions">
        <ZoneHeader
          title={t("dashboard.needDecision")}
          subtitle={t("dashboard.requestCenterBreakdown", {
            total: attentionTotal,
            returns: decisionSummary.return,
            discounts: decisionSummary.discount,
          })}
        />

        {decisionChips.some((c) => c.count > 0) ? (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
            {decisionChips
              .filter((chip) => chip.count > 0)
              .map((chip) => {
                const Icon = chip.icon;
                return (
                  <Link
                    key={chip.labelKey}
                    href={chip.href}
                    className={cn(
                      "rounded-[16px] border p-3 transition hover:shadow-[var(--shadow-card)]",
                      chip.tone === "danger" && "border-danger/25 bg-danger/5",
                      chip.tone === "alert" &&
                        "border-zone-alert/25 bg-zone-alert-soft"
                    )}
                  >
                    <div className="flex items-center gap-2 text-muted">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide">
                        {t(chip.labelKey)}
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                      {chip.count}
                    </p>
                  </Link>
                );
              })}
          </div>
        ) : null}

        {infoChips.some((c) => c.count > 0) ? (
          <>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
              {t("dashboard.infoAlerts")}
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-2">
              {infoChips
                .filter((chip) => chip.count > 0)
                .map((chip) => {
                  const Icon = chip.icon;
                  return (
                    <Link
                      key={chip.labelKey}
                      href={chip.href}
                      className="rounded-[16px] border border-zone-alert/25 bg-zone-alert-soft p-3 transition hover:shadow-[var(--shadow-card)]"
                    >
                      <div className="flex items-center gap-2 text-muted">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                        <span className="text-[11px] font-semibold uppercase tracking-wide">
                          {t(chip.labelKey)}
                        </span>
                      </div>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-ink">
                        {chip.count}
                      </p>
                    </Link>
                  );
                })}
            </div>
          </>
        ) : null}

        {attentionTotal === 0 && decisions.length === 0 && data.lowStock.length === 0 ? (
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
                    {d.type === "DISCOUNT" ? (
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {formatMoney(d.originalTotal ?? d.amount)} →{" "}
                        <span className="text-success">
                          {formatMoney(
                            "finalTotal" in d && d.finalTotal != null
                              ? d.finalTotal
                              : (d.originalTotal ?? 0) - d.amount
                          )}
                        </span>
                        <span className="ml-2 text-xs font-normal text-muted">
                          (−{formatMoney(d.amount)}
                          {d.percent != null ? ` · ${d.percent}%` : ""})
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {formatMoney(d.amount)}
                      </p>
                    )}
                    {d.reason ? (
                      <p className="mt-1 text-xs text-muted">{d.reason}</p>
                    ) : null}
                  </div>
                  {canDecide ? (
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
                  ) : null}
                </div>
              </div>
            ))}

            {data.lowStock.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-l-4 bg-card p-4 shadow-[var(--shadow-card)]",
                  p.empty
                    ? "border-danger/20 border-l-danger"
                    : "border-zone-alert/20 border-l-zone-alert"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AlertTriangle
                    className={cn(
                      "h-4 w-4 shrink-0",
                      p.empty ? "text-danger" : "text-zone-alert"
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
          </div>
        )}
      </section>

      {/* Stores */}
      <section>
        <ZoneHeader
          title={t("dashboard.storesToday")}
          subtitle={t("dashboard.storesNetSum", {
            amount: formatMoney(today.storesNetSum ?? today.netProfit ?? 0, {
              short: true,
            }),
          })}
        />
        {sortedStores.length === 0 && pulse.storesTotal === 0 ? (
          <p className="text-sm text-muted">{t("dashboard.noStores")}</p>
        ) : (
          <ol className="space-y-2">
            {sortedStores.map((s, idx) => {
              const problems =
                "problems" in s && Array.isArray(s.problems) ? s.problems : [];
              const net = s.netProfit ?? s.profit ?? 0;
              const packagingCost =
                "packagingCost" in s
                  ? ((s as { packagingCost?: number }).packagingCost ?? 0)
                  : 0;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-[18px] border bg-card px-4 py-3 shadow-[var(--shadow-card)]",
                    net < 0
                      ? "border-danger/25"
                      : s.id === data.bestStoreId && s.revenue > 0
                        ? "border-zone-money/30"
                        : "border-border"
                  )}
                >
                  <Link
                    href={`/stores/${s.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page text-sm font-bold tabular-nums text-muted">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink">{s.name}</p>
                      <p className="text-xs text-muted">
                        {t("dashboard.salesN", { n: s.salesCount })}
                        {packagingCost > 0
                          ? ` · ${t("dashboard.packagingLayer")}: ${formatMoney(packagingCost, { short: true })}`
                          : ""}
                      </p>
                    </div>
                  </Link>
                  <p
                    className={cn(
                      "text-base font-bold tabular-nums",
                      net < 0 ? "text-danger" : "text-zone-money-deep"
                    )}
                  >
                    {net > 0 ? "+" : net < 0 ? "−" : ""}
                    {formatMoney(Math.abs(net), { short: true })}
                  </p>
                  {problems.length > 0 ? (
                    <ul className="w-full space-y-1 border-t border-border pt-2">
                      {problems.map((p) => (
                        <li key={p.key}>
                          <Link
                            href={p.href}
                            className={cn(
                              "text-xs font-semibold hover:underline",
                              p.tone === "danger"
                                ? "text-danger"
                                : "text-zone-alert"
                            )}
                          >
                            ↓ {t(p.labelKey)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Decision / activity feed */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h3 className="text-base font-bold text-ink sm:text-lg">
            {t("dashboard.decisionFeed")}
          </h3>
          <Link
            href="/journal"
            className="shrink-0 text-xs font-semibold text-brand hover:underline"
          >
            {t("dashboard.goJournal")} →
          </Link>
        </div>

        {decisions.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {decisions.slice(0, 5).map((d) => (
              <li
                key={`feed-${d.type}-${d.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-danger/20 bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {t(d.titleKey)}
                    {d.type === "DISCOUNT" ? (
                      <span className="ml-2 font-normal text-muted">
                        {formatMoney(d.originalTotal ?? d.amount)} →{" "}
                        {formatMoney(
                          d.finalTotal ??
                            (d.originalTotal ?? 0) - d.amount
                        )}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted">
                    {d.storeName} · {d.actorName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={"href" in d && d.href ? d.href : "/dashboard#decisions"}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-ink hover:border-brand/30"
                  >
                    {t("dashboard.openAction")}
                  </Link>
                  {canDecide ? (
                    <>
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
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {recent.length === 0 && decisions.length === 0 ? (
          <p className="text-sm text-muted">{t("dashboard.noRecords")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-[18px] border border-border bg-card">
            {recent.slice(0, 8).map((log) => {
              const href = entityHref(
                "entityType" in log ? (log.entityType as string) : null,
                "entityId" in log ? (log.entityId as string | null) : null,
                log.action
              );
              const row = (
                <div className="flex items-start gap-3 px-4 py-3">
                  <PackagePlus className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {labelAction(log.action, t)}
                      {log.comment ? (
                        <span className="font-normal text-muted">
                          {" "}
                          — {log.comment}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {log.userName || t("dashboard.systemUser")} ·{" "}
                      {formatDateTime(log.createdAt)}
                    </p>
                  </div>
                  {href ? (
                    <span className="shrink-0 text-xs font-semibold text-brand">
                      {t("dashboard.openAction")} →
                    </span>
                  ) : null}
                </div>
              );
              return (
                <li key={log.id}>
                  {href ? (
                    <Link href={href} className="block hover:bg-page/80">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
