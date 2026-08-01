"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";

type Network = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  salesCount: number;
  itemsSold: number;
};

type StoreRow = {
  id: string;
  name: string;
  revenue: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  checks: number;
};

type ProductRow = {
  name: string;
  sold: number;
  revenue: number;
  profit: number;
};

type SellerRow = {
  name: string;
  store: string;
  checks: number;
  revenue: number;
  profit?: number;
};

type ExpenseRow = {
  id: string;
  amount: number;
  type: string;
  store: string | null;
  description: string | null;
  periodicity?: string;
  incurredAt: string;
};

type NamedAgg = {
  name: string;
  sold: number;
  revenue: number;
  profit: number;
};

type Tab =
  | "network"
  | "stores"
  | "products"
  | "sellers"
  | "expenses"
  | "categories"
  | "types";

type Period = "today" | "week" | "month";

export default function AnalyticsPage() {
  const { t, formatMoney, formatDate } = useI18n();
  const [tab, setTab] = useState<Tab>("network");
  const [period, setPeriod] = useState<Period>("month");
  const [network, setNetwork] = useState<Network | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [topUnsold, setTopUnsold] = useState<ProductRow[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [categories, setCategories] = useState<NamedAgg[]>([]);
  const [productTypes, setProductTypes] = useState<NamedAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const analyticsRes = await fetch(`/api/analytics?period=${period}`);
    const analyticsData = await analyticsRes.json();
    if (analyticsRes.ok) {
      setNetwork(analyticsData.network ?? null);
      setStores(analyticsData.stores ?? []);
      setProducts(analyticsData.products ?? []);
      setTopUnsold(analyticsData.topUnsold ?? []);
      setSellers(analyticsData.sellers ?? []);
      setExpenses(analyticsData.expenses?.items ?? []);
      setExpenseTotal(analyticsData.expenses?.total ?? 0);
      setCategories(analyticsData.categories ?? []);
      setProductTypes(analyticsData.productTypes ?? []);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q, products]
  );
  const filteredSellers = useMemo(
    () =>
      sellers.filter(
        (p) =>
          !q.trim() ||
          `${p.name} ${p.store}`.toLowerCase().includes(q.toLowerCase())
      ),
    [q, sellers]
  );

  const tabs: { id: Tab; labelKey: string }[] = [
    { id: "network", labelKey: "analyticsPage.tabNetwork" },
    { id: "stores", labelKey: "analyticsPage.tabStores" },
    { id: "products", labelKey: "analyticsPage.tabProducts" },
    { id: "sellers", labelKey: "analyticsPage.tabSellers" },
    { id: "categories", labelKey: "analyticsPage.tabCategories" },
    { id: "types", labelKey: "analyticsPage.tabTypes" },
    { id: "expenses", labelKey: "analyticsPage.tabExpenses" },
  ];

  return (
    <ModuleWorkspace
      title={t("analyticsPage.title")}
      subtitle={t("analyticsPage.subtitle")}
      kpis={[
        {
          label: t("analyticsPage.revenue"),
          value: loading
            ? "…"
            : formatMoney(network?.revenue ?? 0, { short: true }),
        },
        {
          label: t("dashboard.netProfit"),
          value: loading
            ? "…"
            : formatMoney(network?.netProfit ?? 0, { short: true }),
        },
        {
          label: t("dashboard.grossProfitLabel"),
          value: loading
            ? "…"
            : formatMoney(network?.grossProfit ?? 0, { short: true }),
        },
        {
          label: t("analyticsPage.expensesTitle"),
          value: loading
            ? "…"
            : formatMoney(network?.expenses ?? expenseTotal, { short: true }),
        },
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "week", "month"] as Period[]).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              period === p
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(`analyticsPage.period.${p}`)}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => setTab(tabItem.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              tab === tabItem.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === "network" ? (
        <ModuleSection title={t("analyticsPage.tabNetwork")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["revenue", network?.revenue],
              ["cogs", network?.cogs],
              ["gross", network?.grossProfit],
              ["expenses", network?.expenses],
              ["net", network?.netProfit],
              ["sales", network?.salesCount],
            ].map(([key, val]) => (
              <Card key={String(key)} className="p-4">
                <div className="text-xs text-muted">
                  {key === "revenue"
                    ? t("dashboard.revenueLabel")
                    : key === "cogs"
                      ? t("dashboard.costLabel")
                      : key === "gross"
                        ? t("dashboard.grossProfitLabel")
                        : key === "expenses"
                          ? t("dashboard.expensesLabel")
                          : key === "net"
                            ? t("dashboard.netProfit")
                            : t("analyticsPage.colChecks")}
                </div>
                <div className="mt-1 text-xl font-bold text-ink">
                  {key === "sales"
                    ? String(val ?? 0)
                    : formatMoney(Number(val ?? 0), { short: true })}
                </div>
              </Card>
            ))}
          </div>
        </ModuleSection>
      ) : null}

      {tab === "stores" ? (
        <ModuleSection title={t("analyticsPage.tabStores")}>
          <div className="space-y-2">
            {stores.map((s) => (
              <Link key={s.id} href={`/stores/${s.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div className="font-semibold text-ink">{s.name}</div>
                  <div className="text-sm text-muted">
                    {formatMoney(s.revenue, { short: true })} ·{" "}
                    {t("dashboard.netProfit")}{" "}
                    {formatMoney(s.netProfit, { short: true })}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </ModuleSection>
      ) : null}

      {tab === "products" ? (
        <ModuleSection title={t("analyticsPage.tabProducts")}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("common.search")}
            className="mb-3 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
          />
          <div className="mb-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted">
              {t("analyticsPage.topSelling")}
            </div>
            {filteredProducts.map((p) => (
              <Card
                key={p.name}
                className="flex flex-wrap justify-between gap-2 p-3 text-sm"
              >
                <span className="font-medium text-ink">{p.name}</span>
                <span className="text-muted">
                  {p.sold} · {formatMoney(p.revenue, { short: true })} ·{" "}
                  {formatMoney(p.profit, { short: true })}
                </span>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted">
              {t("analyticsPage.topUnsold")}
            </div>
            {topUnsold.map((p) => (
              <Card
                key={`u-${p.name}`}
                className="flex flex-wrap justify-between gap-2 p-3 text-sm"
              >
                <span className="font-medium text-ink">{p.name}</span>
                <span className="text-muted">{p.sold}</span>
              </Card>
            ))}
          </div>
        </ModuleSection>
      ) : null}

      {tab === "sellers" ? (
        <ModuleSection title={t("analyticsPage.tabSellers")}>
          {filteredSellers.map((s) => (
            <Card
              key={`${s.name}-${s.store}`}
              className="mb-2 flex flex-wrap justify-between gap-2 p-3 text-sm"
            >
              <span>
                {s.name} · {s.store}
              </span>
              <span className="text-muted">
                {s.checks} · {formatMoney(s.revenue, { short: true })}
              </span>
            </Card>
          ))}
        </ModuleSection>
      ) : null}

      {tab === "categories" ? (
        <ModuleSection title={t("analyticsPage.tabCategories")}>
          {categories.map((c) => (
            <Card
              key={c.name}
              className="mb-2 flex justify-between p-3 text-sm"
            >
              <span>{c.name}</span>
              <span className="text-muted">
                {formatMoney(c.revenue, { short: true })} ·{" "}
                {formatMoney(c.profit, { short: true })}
              </span>
            </Card>
          ))}
        </ModuleSection>
      ) : null}

      {tab === "types" ? (
        <ModuleSection title={t("analyticsPage.tabTypes")}>
          {productTypes.map((c) => (
            <Card
              key={c.name}
              className="mb-2 flex justify-between p-3 text-sm"
            >
              <span>{c.name}</span>
              <span className="text-muted">
                {formatMoney(c.revenue, { short: true })} ·{" "}
                {formatMoney(c.profit, { short: true })}
              </span>
            </Card>
          ))}
        </ModuleSection>
      ) : null}

      {tab === "expenses" ? (
        <ModuleSection title={t("analyticsPage.expensesTitle")}>
          <div className="mb-3 text-sm text-muted">
            {t("analyticsPage.expensesHint")} ·{" "}
            {formatMoney(expenseTotal, { short: true })}
          </div>
          {expenses.map((e) => (
            <Card
              key={e.id}
              className="mb-2 flex flex-wrap justify-between gap-2 p-3 text-sm"
            >
              <span>
                {e.type} · {e.store ?? "—"} · {e.periodicity ?? "ONCE"}
              </span>
              <span>
                {formatMoney(e.amount)} · {formatDate(e.incurredAt)}
              </span>
            </Card>
          ))}
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
