"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DeltaBadge } from "@/components/layout/owner-top-bar";
import type { DashboardPayload } from "@/lib/services/dashboard.service";
import { useI18n } from "@/components/i18n/i18n-provider";
import { HelpTip } from "@/components/ui/help-tip";

const QUICK = [
  { href: "/warehouse", labelKey: "dashboard.quickWarehouse" },
  { href: "/stores", labelKey: "dashboard.quickStores" },
  { href: "/returns", labelKey: "dashboard.quickReturns" },
  { href: "/revision", labelKey: "dashboard.quickRevision" },
  { href: "/analytics", labelKey: "dashboard.quickAnalytics" },
  { href: "/users", labelKey: "dashboard.quickUsers" },
  { href: "/journal", labelKey: "dashboard.quickJournal" },
  { href: "/settings", labelKey: "dashboard.quickSettings" },
] as const;

export function OwnerDashboardClient({
  initial,
  userName,
}: {
  initial: DashboardPayload;
  userName: string;
}) {
  const { t, formatMoney, formatDateTime, formatTime } = useI18n();
  const [data, setData] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    const res = await fetch("/api/dashboard");
    if (!res.ok) return;
    const next = await res.json();
    setData(next);
  }, []);

  useEffect(() => {
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

  const kpis = [
    {
      key: "revenue",
      labelKey: "dashboard.salesToday",
      hintKey: "todayRevenue",
      value: formatMoney(today.revenue),
      delta: today.deltas.revenue,
      profit: false,
    },
    {
      key: "profit",
      labelKey: "dashboard.netProfit",
      hintKey: "todayProfit",
      value: formatMoney(today.profit),
      delta: today.deltas.profit,
      profit: true,
    },
    {
      key: "count",
      labelKey: "dashboard.salesCount",
      hintKey: "todayCount",
      value: String(today.count),
      delta: today.deltas.count,
      profit: false,
    },
    {
      key: "items",
      labelKey: "dashboard.itemsSold",
      hintKey: "todayItems",
      value: String(Math.round(today.itemsSold * 10) / 10),
      delta: today.deltas.itemsSold,
      profit: false,
    },
    {
      key: "avg",
      labelKey: "dashboard.avgCheck",
      hintKey: "todayAvgCheck",
      value: formatMoney(today.avgCheck),
      delta: today.deltas.avgCheck,
      profit: false,
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[16px] border border-border bg-card p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand">
          {t("dashboard.commandCenter")}
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-ink">
          {t("dashboard.welcome", { name: userName })}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("dashboard.welcomeHint")}</p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("dashboard.today")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {kpis.map((kpi) => (
            <Card key={kpi.key} className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                <HelpTip hintKey={kpi.hintKey}>{t(kpi.labelKey)}</HelpTip>
              </div>
              <div
                className={cn(
                  "mt-2 text-xl font-bold tabular-nums sm:text-2xl",
                  kpi.profit ? "text-success" : "text-ink"
                )}
              >
                {kpi.value}
              </div>
              <DeltaBadge
                pct={kpi.delta?.pct ?? 0}
                label={kpi.delta?.label ?? "0%"}
              />
            </Card>
          ))}
        </div>
      </section>

      <section id="decisions">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.needDecision")}
            {decisionSummary.total > 0 ? (
              <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs text-white">
                {decisionSummary.total}
              </span>
            ) : null}
          </h2>
          {decisionSummary.total > 0 ? (
            <p className="text-xs text-muted">
              {decisionSummary.discount
                ? t("dashboard.summaryDiscount", { n: decisionSummary.discount })
                : ""}
              {decisionSummary.return
                ? t("dashboard.summaryReturn", { n: decisionSummary.return })
                : ""}
              {decisionSummary.price
                ? t("dashboard.summaryPrice", { n: decisionSummary.price })
                : ""}
              {decisionSummary.writeOff
                ? t("dashboard.summaryWriteOff", { n: decisionSummary.writeOff })
                : ""}
            </p>
          ) : null}
        </div>

        {decisionSummary.total === 0 ? (
          <Card className="border-success/20 bg-success/5 p-5 text-sm text-success">
            {t("dashboard.allClear")}
          </Card>
        ) : (
          <div className="space-y-3">
            {decisions.map((d) => (
              <Card
                key={`${d.type}-${d.id}`}
                className={cn(
                  "border-l-4 p-4",
                  d.priority === "urgent" ? "border-l-warning" : "border-l-border"
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-ink">{d.title}</div>
                    <div className="mt-1 text-xs text-muted">
                      {formatDateTime(d.createdAt)} · {d.storeName} · {d.actorName}
                    </div>
                    <div className="mt-2 text-sm text-ink">{d.products}</div>
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
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.importantNotifs")}
          </h2>
          <Card className="divide-y divide-border p-0">
            {data.notifications.length === 0 ? (
              <div className="p-4 text-sm text-muted">
                {t("dashboard.noImportantNotifs")}
              </div>
            ) : (
              data.notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  className="block px-4 py-3 hover:bg-page"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        n.tone === "danger" && "bg-danger",
                        n.tone === "warning" && "bg-warning",
                        n.tone !== "danger" && n.tone !== "warning" && "bg-info"
                      )}
                    />
                    <div>
                      <div className="text-sm font-semibold text-ink">{n.title}</div>
                      <div className="text-xs text-muted">{n.message}</div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </Card>
          <Link
            href="/notifications"
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            {t("common.showAll")}
          </Link>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.storesToday")}
          </h2>
          <div className="space-y-2">
            {data.stores.map((s) => (
              <Link key={s.id} href={`/stores/${s.id}`}>
                <Card className="mb-2 flex items-center justify-between p-4 transition hover:border-brand/30">
                  <div>
                    <div className="font-semibold text-ink">{s.name}</div>
                    <div className="text-xs text-muted">
                      {t("dashboard.salesN", { n: s.salesCount })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-ink">
                      {formatMoney(s.revenue)}
                    </div>
                    <div className="text-xs font-semibold text-success">
                      {formatMoney(s.profit)}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
            {data.stores.length === 0 ? (
              <Card className="p-4 text-sm text-muted">{t("dashboard.noStores")}</Card>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.productsAttention")}
          </h2>
          <div className="space-y-2">
            {data.lowStock.map((p) => (
              <Link key={p.id} href={`/warehouse/${p.productId}`}>
                <Card
                  className={cn(
                    "mb-2 p-4",
                    p.empty && "border-danger/40 bg-danger/5"
                  )}
                >
                  <div className="font-semibold text-ink">{p.name}</div>
                  <div
                    className={cn(
                      "text-sm",
                      p.empty ? "font-semibold text-danger" : "text-muted"
                    )}
                  >
                    {p.empty
                      ? t("dashboard.outOfStock")
                      : t("dashboard.leftQty", { qty: p.quantity, unit: p.unit })}
                  </div>
                </Card>
              </Link>
            ))}
            {data.lowStock.length === 0 ? (
              <Card className="p-4 text-sm text-muted">
                {t("dashboard.noCriticalStock")}
              </Card>
            ) : null}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            {t("dashboard.recentActions")}
          </h2>
          <Card className="divide-y divide-border p-0">
            {data.recent.map((log) => (
              <div key={log.id} className="px-4 py-3">
                <div className="text-xs text-muted">{formatTime(log.createdAt)}</div>
                <div className="text-sm font-semibold text-ink">
                  {log.userName}
                  {log.role ? ` · ${log.role}` : ""}
                </div>
                <div className="text-sm text-muted">
                  {log.action}
                  {log.comment ? ` — ${log.comment}` : ""}
                </div>
              </div>
            ))}
            {data.recent.length === 0 ? (
              <div className="p-4 text-sm text-muted">{t("dashboard.noRecords")}</div>
            ) : null}
          </Card>
          <Link
            href="/journal"
            className="mt-2 inline-block text-sm font-semibold text-brand hover:underline"
          >
            {t("dashboard.goJournal")}
          </Link>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {t("dashboard.quickLinks")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/10 hover:bg-brand hover:text-white"
            >
              {t(q.labelKey)}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
