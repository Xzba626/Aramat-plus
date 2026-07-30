"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import {
  MOCK_ANALYTICS_PRODUCTS,
  MOCK_ANALYTICS_SELLERS,
} from "@/lib/ui-mocks";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type StoreRow = {
  id: string;
  name: string;
  kind: string;
  todayRevenue: number;
  todayProfit: number;
  todaySalesCount: number;
  monthRevenue: number;
  monthProfit: number;
};

type Tab = "network" | "stores" | "products" | "sellers" | "expenses";

export default function AnalyticsPage() {
  const { t, formatMoney } = useI18n();
  const [tab, setTab] = useState<Tab>("network");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/stores");
      const data = await res.json();
      if (!alive) return;
      if (res.ok && Array.isArray(data)) setStores(data);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const networkRevenue = stores.reduce((s, x) => s + x.todayRevenue, 0);
  const networkProfit = stores.reduce((s, x) => s + x.todayProfit, 0);
  const networkSales = stores.reduce((s, x) => s + x.todaySalesCount, 0);
  const monthRevenue = stores.reduce((s, x) => s + x.monthRevenue, 0);

  const products = useMemo(
    () =>
      MOCK_ANALYTICS_PRODUCTS.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q]
  );
  const sellers = useMemo(
    () =>
      MOCK_ANALYTICS_SELLERS.filter(
        (p) =>
          !q.trim() ||
          `${p.name} ${p.store}`.toLowerCase().includes(q.toLowerCase())
      ),
    [q]
  );

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "network", labelKey: "analyticsPage.tabNetwork" },
    { id: "stores", labelKey: "analyticsPage.tabStores" },
    { id: "products", labelKey: "analyticsPage.tabProducts" },
    { id: "sellers", labelKey: "analyticsPage.tabSellers" },
    { id: "expenses", labelKey: "analyticsPage.tabExpenses" },
  ];

  return (
    <ModuleWorkspace
      title={t("analyticsPage.title")}
      subtitle={t("analyticsPage.subtitle")}
      kpis={[
        {
          label: t("analyticsPage.salesToday"),
          value: loading ? "…" : formatMoney(networkRevenue, { short: true }),
        },
        {
          label: t("analyticsPage.profitToday"),
          value: loading ? "…" : formatMoney(networkProfit, { short: true }),
        },
        {
          label: t("analyticsPage.checksToday"),
          value: loading ? "…" : String(networkSales),
        },
        {
          label: t("analyticsPage.monthRevenue"),
          value: loading ? "…" : formatMoney(monthRevenue, { short: true }),
        },
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === item.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>

      {(tab === "products" || tab === "sellers") && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.search")}
          className="mb-4 w-full max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      )}

      {tab === "network" ? (
        <ModuleSection title={t("analyticsPage.storesToday")}>
          {loading ? (
            <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
          ) : (
            <div className="space-y-2">
              {stores.map((s) => (
                <Link key={s.id} href={`/stores/${s.id}`}>
                  <Card className="mb-2 flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-brand/30">
                    <div>
                      <div className="font-semibold text-ink">
                        {s.kind === "OWNER_DIRECT"
                          ? t("nav.storesOwnerDirect")
                          : s.name}
                      </div>
                      <div className="text-xs text-muted">
                        {s.kind === "OWNER_DIRECT"
                          ? t("storesPage.ownerDirectHint")
                          : t("analyticsPage.salesTodayCount", {
                              n: s.todaySalesCount,
                            })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-ink">
                        {formatMoney(s.todayRevenue, { short: true })}
                      </div>
                      <div className="text-xs font-semibold text-success">
                        {formatMoney(s.todayProfit, { short: true })}
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </ModuleSection>
      ) : null}

      {tab === "stores" ? (
        <ModuleSection title={t("analyticsPage.storesMonth")}>
          {loading ? (
            <Card className="p-5 text-sm text-muted">{t("common.loading")}</Card>
          ) : (
            <div className="space-y-2">
              {[...stores]
                .sort((a, b) => b.monthRevenue - a.monthRevenue)
                .map((s) => (
                  <Link key={s.id} href={`/stores/${s.id}`}>
                    <Card className="mb-2 flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-brand/30">
                      <div>
                        <div className="font-semibold text-ink">
                          {s.kind === "OWNER_DIRECT"
                            ? t("nav.storesOwnerDirect")
                            : s.name}
                        </div>
                        <div className="text-xs text-muted">
                          {t("analyticsPage.monthRevenueShort", {
                            amount: formatMoney(s.monthRevenue, { short: true }),
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-ink">
                          {formatMoney(s.monthRevenue, { short: true })}
                        </div>
                        <div className="text-xs font-semibold text-success">
                          {formatMoney(s.monthProfit, { short: true })}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
            </div>
          )}
        </ModuleSection>
      ) : null}

      {tab === "products" ? (
        <ModuleSection title={t("analyticsPage.topProducts")}>
          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colProduct")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colSold")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colRevenue")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colProfit")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-muted">{p.sold}</td>
                    <td className="px-4 py-3">
                      {formatMoney(p.revenue, { short: true })}
                    </td>
                    <td className="px-4 py-3 text-success">
                      {formatMoney(p.profit, { short: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "sellers" ? (
        <ModuleSection title={t("analyticsPage.topSellers")}>
          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colSeller")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colStore")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colChecks")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("analyticsPage.colRevenue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{s.name}</td>
                    <td className="px-4 py-3 text-muted">{s.store}</td>
                    <td className="px-4 py-3">{s.checks}</td>
                    <td className="px-4 py-3">
                      {formatMoney(s.revenue, { short: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "expenses" ? (
        <ModuleSection title={t("analyticsPage.expensesTitle")}>
          <Card className="p-5 text-sm text-muted">
            {t("analyticsPage.expensesHint")}
          </Card>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stores
              .filter((s) => s.kind !== "OWNER_DIRECT")
              .map((s) => (
                <Link key={s.id} href={`/stores/${s.id}?tab=expenses`}>
                  <Card className="p-4 transition hover:border-brand/30">
                    <div className="font-semibold text-ink">{s.name}</div>
                    <div className="mt-1 text-sm text-brand">
                      {t("analyticsPage.openExpenses")}
                    </div>
                  </Card>
                </Link>
              ))}
          </div>
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
