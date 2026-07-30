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
  Store,
  Truck,
  AlertTriangle,
  Wallet,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { useI18n } from "@/components/i18n/i18n-provider";

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn("flex h-10 items-end gap-1", className)} aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-full min-w-[6px] rounded-sm bg-white/45"
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

type ActionTile = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  tone: "money" | "stock" | "stores" | "brand" | "alert";
};

const ACTIONS: ActionTile[] = [
  {
    href: "/warehouse/receive?tab=batch",
    labelKey: "dashboard.actionReceive",
    icon: PackagePlus,
    tone: "stock",
  },
  {
    href: "/warehouse/transfers/new",
    labelKey: "dashboard.actionTransfer",
    icon: Truck,
    tone: "stock",
  },
  {
    href: "/analytics",
    labelKey: "dashboard.actionReport",
    icon: BarChart3,
    tone: "brand",
  },
  {
    href: "/stores",
    labelKey: "dashboard.actionStores",
    icon: Store,
    tone: "stores",
  },
];

const TONE_BG: Record<ActionTile["tone"], string> = {
  money: "bg-zone-money-soft text-zone-money-deep",
  stock: "bg-zone-stock-soft text-zone-stock-deep",
  stores: "bg-zone-stores-soft text-zone-stores-deep",
  brand: "bg-brand-soft text-brand",
  alert: "bg-zone-alert-soft text-zone-alert",
};

type AttentionTone = "danger" | "warning" | "ok";

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
    const next = await res.json();
    setData(next);
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
  const revDelta = today.deltas.revenue;
  const cost = Number(
    today.cost ?? Math.max(0, today.revenue - today.profit)
  );

  const displayName =
    userName.trim() || t("roles.owner");

  const status = useMemo(() => {
    if (decisionSummary.total > 0) {
      return {
        tone: "alert" as const,
        text: t("dashboard.statusAttention", { n: decisionSummary.total }),
        icon: AlertTriangle,
      };
    }
    if (pulse.lowStockCount > 0) {
      return {
        tone: "alert" as const,
        text: t("dashboard.statusLowStock", { n: pulse.lowStockCount }),
        icon: AlertTriangle,
      };
    }
    if (revDelta.pct > 0) {
      return {
        tone: "good" as const,
        text: t("dashboard.statusSalesUp", { pct: revDelta.label }),
        icon: CheckCircle2,
      };
    }
    return {
      tone: "good" as const,
      text: t("dashboard.statusAllGood"),
      icon: CheckCircle2,
    };
  }, [decisionSummary.total, pulse.lowStockCount, revDelta.label, revDelta.pct, t]);

  const StatusIcon = status.icon;

  const attentionItems = useMemo(() => {
    const items: { id: string; href: string; label: string; tone: AttentionTone }[] = [];

    for (const d of decisions) {
      items.push({
        id: `dec-${d.type}-${d.id}`,
        href: "/dashboard#decisions",
        label: t(d.titleKey),
        tone: "danger",
      });
    }
    for (const p of data.lowStock.slice(0, 4)) {
      items.push({
        id: `stock-${p.id}`,
        href: `/warehouse/${p.productId}`,
        label: p.empty
          ? t("dashboard.attentionOut", { name: p.name })
          : t("dashboard.attentionLow", { name: p.name }),
        tone: p.empty ? "danger" : "warning",
      });
    }
    for (const s of data.stores.filter((x) => x.salesCount === 0).slice(0, 3)) {
      items.push({
        id: `store-${s.id}`,
        href: `/stores/${s.id}`,
        label: t("dashboard.attentionNoSales", { name: s.name }),
        tone: "warning",
      });
    }
    return items.slice(0, 6);
  }, [data.lowStock, data.stores, decisions, t]);

  const recommendations = useMemo(() => {
    const items: { href: string; label: string }[] = [];
    if (decisionSummary.total > 0) {
      items.push({
        href: "/dashboard#decisions",
        label: t("dashboard.recommendDecide", { n: decisionSummary.total }),
      });
    }
    for (const p of data.lowStock.slice(0, 2)) {
      items.push({
        href: `/warehouse/${p.productId}`,
        label: t("dashboard.recommendOrder", { name: p.name }),
      });
    }
    const quietStore = data.stores.find((s) => s.salesCount === 0);
    if (quietStore) {
      items.push({
        href: `/stores/${quietStore.id}`,
        label: t("dashboard.recommendStore", { name: quietStore.name }),
      });
    }
    if (items.length === 0) {
      items.push({
        href: "/warehouse/receive?tab=batch",
        label: t("dashboard.recommendReceive"),
      });
    }
    return items.slice(0, 3);
  }, [data.lowStock, data.stores, decisionSummary.total, t]);

  const bestStore = data.stores.find((s) => s.id === data.bestStoreId) ??
    [...data.stores].sort((a, b) => b.revenue - a.revenue)[0];

  const firstName = displayName.split(/\s+/)[0] || displayName;

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {t(greetKey(hour), { name: firstName })}
          </h2>
        </div>
        <div
          className={cn(
            "flex items-start gap-3 rounded-[20px] border px-4 py-4 shadow-[var(--shadow-card)] sm:px-5",
            status.tone === "good"
              ? "border-zone-money/20 bg-zone-money-soft"
              : "border-zone-alert/25 bg-zone-alert-soft"
          )}
        >
          <StatusIcon
            className={cn(
              "mt-0.5 h-6 w-6 shrink-0",
              status.tone === "good" ? "text-zone-money-deep" : "text-zone-alert"
            )}
            strokeWidth={1.75}
          />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-medium leading-relaxed sm:text-base",
                status.tone === "good" ? "text-zone-money-deep" : "text-zone-alert"
              )}
            >
              {status.text}
            </p>
            {status.tone === "alert" ? (
              <Link
                href="/attention"
                className="mt-2 inline-flex text-sm font-bold text-zone-alert underline-offset-2 hover:underline"
              >
                {t("dashboard.attentionGo")} →
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      {/* Attention strip: red / yellow / green */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.attentionTitle")}
          </h3>
          {attentionItems.length > 0 ? (
            <Link
              href="/attention"
              className="text-xs font-semibold text-brand hover:underline"
            >
              {t("dashboard.attentionGo")} →
            </Link>
          ) : null}
        </div>
        {attentionItems.length === 0 ? (
          <div className="flex items-start gap-3 rounded-[20px] border border-zone-money/20 bg-zone-money-soft p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-zone-money-deep" />
            <p className="text-sm font-medium text-zone-money-deep">
              {t("dashboard.attentionOk")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {attentionItems.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[16px] border px-4 py-3 text-sm font-semibold transition hover:shadow-[var(--shadow-card)]",
                    item.tone === "danger" &&
                      "border-danger/25 bg-danger/5 text-danger",
                    item.tone === "warning" &&
                      "border-zone-alert/25 bg-zone-alert-soft text-zone-alert"
                  )}
                >
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      item.tone === "danger" ? "bg-danger" : "bg-zone-alert"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-ink">{item.label}</span>
                  <span className="text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Three business zones */}
      <section className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        <Link
          href="/analytics"
          className="group relative overflow-hidden rounded-[20px] bg-zone-money p-5 text-white shadow-[var(--shadow-lift)] transition hover:brightness-105 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-white/80">
                {t("dashboard.salesToday")}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                {t("dashboard.moneyHint")}
              </p>
              <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
                {formatMoney(today.revenue, { short: true })}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-white/90">
                <span className="inline-flex items-center gap-1">
                  {revDelta.pct >= 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {revDelta.label} {t("dashboard.vsYesterday")}
                </span>
                <span className="font-medium text-white/75">
                  {t("dashboard.salesCountShort", { n: today.count })}
                </span>
              </div>
              <div className="mt-3 space-y-1 border-t border-white/15 pt-3 text-xs text-white/80">
                <div className="flex justify-between gap-2">
                  <span>{t("dashboard.revenueLabel")}</span>
                  <span className="tabular-nums font-semibold">
                    {formatMoney(today.revenue, { short: true })}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{t("dashboard.costLabel")}</span>
                  <span className="tabular-nums font-semibold">
                    {formatMoney(cost, { short: true })}
                  </span>
                </div>
                <div className="flex justify-between gap-2 text-white">
                  <span className="font-bold">{t("dashboard.profitLabel")}</span>
                  <span className="tabular-nums font-bold">
                    {formatMoney(today.profit, { short: true })}
                  </span>
                </div>
                <div className="pt-1 text-white/65">
                  {t("dashboard.avgCheckShort", {
                    amount: formatMoney(today.avgCheck, { short: true }),
                  })}
                </div>
              </div>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Wallet className="h-6 w-6" strokeWidth={1.75} />
            </span>
          </div>
          <div className="mt-5">
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/60">
              {t("dashboard.weekSales")}
            </div>
            <Sparkline values={pulse.sparkline} />
          </div>
        </Link>

        <Link
          href="/warehouse"
          className="group relative overflow-hidden rounded-[20px] bg-zone-stock p-5 text-white shadow-[var(--shadow-lift)] transition hover:brightness-105 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white/80">
                {t("dashboard.stockTitle")}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                {t("dashboard.stockHint")}
              </p>
              <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
                {t("dashboard.stockUnits", {
                  n: Math.round(pulse.warehouseUnits),
                })}
              </div>
              <div className="mt-2 text-sm text-white/85">
                {t("dashboard.stockKinds", { n: pulse.warehouseSku })}
              </div>
              <div
                className={cn(
                  "mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold",
                  pulse.lowStockCount > 0
                    ? "bg-white/20 text-white"
                    : "bg-white/15 text-white/90"
                )}
              >
                {pulse.lowStockCount > 0
                  ? t("dashboard.stockLow", { n: pulse.lowStockCount })
                  : t("dashboard.stockOk")}
              </div>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Package className="h-6 w-6" strokeWidth={1.75} />
            </span>
          </div>
        </Link>

        <Link
          href="/stores"
          className="group relative overflow-hidden rounded-[20px] bg-zone-stores p-5 text-white shadow-[var(--shadow-lift)] transition hover:brightness-105 sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white/80">
                {t("dashboard.storesTitle")}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-white/55">
                {t("dashboard.storesHint")}
              </p>
              <div className="mt-3 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">
                {t("dashboard.storesOf", {
                  open: pulse.storesOpen,
                  total: pulse.storesTotal,
                })}
              </div>
              <div className="mt-3 text-sm font-medium text-white/90">
                {pulse.storesOpen > 0
                  ? t("dashboard.storesSelling")
                  : t("dashboard.storesQuiet")}
              </div>
              {bestStore && bestStore.revenue > 0 ? (
                <div className="mt-2 text-xs font-semibold text-white/75">
                  {t("dashboard.bestStore", { name: bestStore.name })}
                </div>
              ) : null}
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Store className="h-6 w-6" strokeWidth={1.75} />
            </span>
          </div>
        </Link>
      </section>

      <section className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <h3 className="text-base font-bold text-ink">
            {t("dashboard.recommendTitle")}
          </h3>
        </div>
        <ul className="space-y-2">
          {recommendations.map((r) => (
            <li key={r.href + r.label}>
              <Link
                href={r.href}
                className="flex items-center justify-between gap-3 rounded-2xl bg-page px-4 py-3 text-sm font-semibold text-ink transition hover:bg-brand-soft hover:text-brand"
              >
                <span>{r.label}</span>
                <span className="text-muted">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("dashboard.actionsTitle")}
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                className="flex min-h-[108px] flex-col items-center justify-center gap-3 rounded-[20px] border border-border bg-card p-4 text-center shadow-[var(--shadow-card)] transition active:scale-[0.98] hover:border-brand/30 hover:shadow-[var(--shadow-lift)] sm:min-h-0 sm:p-5"
              >
                <span
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-2xl",
                    TONE_BG[a.tone]
                  )}
                >
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-bold text-ink">{t(a.labelKey)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="decisions">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("dashboard.needDecision")}
          {decisionSummary.total > 0 ? (
            <span className="ml-2 rounded-full bg-zone-alert px-2 py-0.5 text-xs text-white">
              {decisionSummary.total}
            </span>
          ) : null}
        </h3>

        {decisionSummary.total === 0 ? (
          <div className="flex items-start gap-3 rounded-[20px] border border-zone-money/20 bg-zone-money-soft p-5">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-zone-money-deep" />
            <p className="text-sm font-medium text-zone-money-deep">
              {t("dashboard.allClear")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {decisions.map((d) => (
              <div
                key={`${d.type}-${d.id}`}
                className="rounded-[20px] border border-zone-alert/20 border-l-4 border-l-zone-alert bg-card p-4 shadow-[var(--shadow-card)] sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-ink">{t(d.titleKey)}</div>
                    <div className="mt-1 text-xs text-muted">
                      {formatDateTime(d.createdAt)} · {d.storeName} · {d.actorName}
                    </div>
                    <div className="mt-2 text-sm text-ink">
                      {d.products ||
                        (d.productsFallbackKey ? t(d.productsFallbackKey) : "—")}
                    </div>
                    {d.type === "DISCOUNT" ? (
                      <div className="mt-1 text-sm text-muted">
                        {d.originalTotal != null
                          ? t("dashboard.was", {
                              amount: formatMoney(d.originalTotal),
                            })
                          : ""}
                        {t("dashboard.request", { amount: formatMoney(d.amount) })}
                        {d.percent != null ? ` (−${d.percent}%)` : ""}
                      </div>
                    ) : (
                      <div className="mt-1 text-sm text-muted">
                        {d.reason || t("dashboard.noReason")} · {t("dashboard.receipt")}{" "}
                        {d.originalTotal != null
                          ? formatMoney(d.originalTotal)
                          : "—"}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
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
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.storesToday")}
          </h3>
          <div className="space-y-3">
            {data.stores.map((s) => (
              <Link key={s.id} href={`/stores/${s.id}`} className="block">
                <div className="flex items-center gap-4 rounded-[20px] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition hover:border-zone-stores/40 hover:shadow-[var(--shadow-lift)]">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zone-stores-soft text-zone-stores-deep">
                    <Store className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-ink">{s.name}</div>
                    <div className="text-xs text-muted">
                      {t("dashboard.salesN", { n: s.salesCount })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums text-ink">
                      {formatMoney(s.revenue, { short: true })}
                    </div>
                    <div className="text-xs font-semibold tabular-nums text-zone-money-deep">
                      {t("dashboard.profitTodayShort", {
                        amount: formatMoney(s.profit, { short: true }),
                      })}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {data.stores.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-border p-5 text-sm text-muted">
                {t("dashboard.noStores")}
              </div>
            ) : null}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.productsAttention")}
          </h3>
          <div className="space-y-3">
            {data.lowStock.map((p) => {
              const pct = Math.min(100, Math.round((p.quantity / 5) * 100));
              return (
                <Link key={p.id} href={`/warehouse/${p.productId}`} className="block">
                  <div
                    className={cn(
                      "rounded-[20px] border bg-card p-4 shadow-[var(--shadow-card)] transition hover:shadow-[var(--shadow-lift)]",
                      p.empty ? "border-danger/30" : "border-zone-alert/25"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                          p.empty
                            ? "bg-danger/10 text-danger"
                            : "bg-zone-alert-soft text-zone-alert"
                        )}
                      >
                        <Package className="h-6 w-6" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-ink">{p.name}</div>
                        <div
                          className={cn(
                            "mt-0.5 text-sm",
                            p.empty ? "font-semibold text-danger" : "text-muted"
                          )}
                        >
                          {p.empty
                            ? t("dashboard.outOfStock")
                            : t("dashboard.leftQty", {
                                qty: p.quantity,
                                unit: p.unit,
                              })}
                        </div>
                        {!p.empty ? (
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-page">
                            <div
                              className="h-full rounded-full bg-zone-alert"
                              style={{ width: `${Math.max(8, pct)}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
            {data.lowStock.length === 0 ? (
              <div className="flex items-start gap-3 rounded-[20px] border border-zone-money/20 bg-zone-money-soft p-5">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-zone-money-deep" />
                <p className="text-sm font-medium text-zone-money-deep">
                  {t("dashboard.noCriticalStock")}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
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
