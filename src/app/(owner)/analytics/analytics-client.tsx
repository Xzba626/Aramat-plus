"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelExpensePeriodicity, formatExpenseDescription } from "@/lib/i18n/labels";

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
  accountingType?: "PIECE" | "WEIGHT";
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
  allocatedAmount?: number;
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

type Period = "today" | "week" | "month" | "year";

function formatSoldQty(
  p: ProductRow,
  t: (key: string) => string
): string {
  const unit =
    p.accountingType === "WEIGHT" ? t("units.ml") : t("units.pcs");
  return `${p.sold} ${unit}`;
}

function expensesLabelKey(period: Period): string {
  if (period === "today") return "dashboard.expensesLabelToday";
  if (period === "week") return "dashboard.expensesLabelWeek";
  if (period === "year") return "dashboard.expensesLabelYear";
  return "dashboard.expensesLabelMonth";
}

function tabFromView(view: string | null): Tab {
  if (view === "expenses") return "expenses";
  if (view === "stores") return "stores";
  if (view === "products") return "products";
  if (view === "sellers") return "sellers";
  if (view === "network" || view === "finance") return "network";
  return "network";
}

export default function AnalyticsClient({
  initial,
  initialPeriod = "today",
  canViewFinance = true,
}: {
  initial?: {
    network: Network | null;
    stores: StoreRow[];
    products: ProductRow[];
    topSales?: ProductRow[];
    topUnsold?: ProductRow[];
    noSales?: ProductRow[];
    sellers: SellerRow[];
    expenses?: { items: ExpenseRow[]; total: number };
    categories?: NamedAgg[];
    productTypes?: NamedAgg[];
  } | null;
  initialPeriod?: Period;
  canViewFinance?: boolean;
}) {
  const { t, formatMoney, formatDate } = useI18n();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");
  const focus = searchParams.get("focus");

  const [tab, setTab] = useState<Tab>(() => tabFromView(view));
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [network, setNetwork] = useState<Network | null>(
    () => initial?.network ?? null
  );
  const [stores, setStores] = useState<StoreRow[]>(() => initial?.stores ?? []);
  const [products, setProducts] = useState<ProductRow[]>(
    () => initial?.products ?? []
  );
  const [topSales, setTopSales] = useState<ProductRow[]>(
    () => initial?.topSales ?? initial?.products ?? []
  );
  const [topUnsold, setTopUnsold] = useState<ProductRow[]>(
    () => initial?.topUnsold ?? []
  );
  const [noSales, setNoSales] = useState<ProductRow[]>(
    () => initial?.noSales ?? []
  );
  const [sellers, setSellers] = useState<SellerRow[]>(
    () => initial?.sellers ?? []
  );
  const [expenses, setExpenses] = useState<ExpenseRow[]>(
    () => initial?.expenses?.items ?? []
  );
  const [expenseTotal, setExpenseTotal] = useState(
    () => initial?.expenses?.total ?? 0
  );
  const [categories, setCategories] = useState<NamedAgg[]>(
    () => initial?.categories ?? []
  );
  const [productTypes, setProductTypes] = useState<NamedAgg[]>(
    () => initial?.productTypes ?? []
  );
  const [loading, setLoading] = useState(!initial);
  const [q, setQ] = useState("");
  const bootstrappedPeriod = useRef(initial ? initialPeriod : null);

  useEffect(() => {
    setTab(tabFromView(view));
  }, [view]);

  useEffect(() => {
    if (focus !== "net" || tab !== "network") return;
    const el = document.getElementById("finance-net");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus, tab, network, loading]);

  const load = useCallback(async (nextPeriod: Period) => {
    setLoading(true);
    const analyticsRes = await fetch(`/api/analytics?period=${nextPeriod}`);
    const analyticsData = await analyticsRes.json();
    if (analyticsRes.ok) {
      setNetwork(analyticsData.network ?? null);
      setStores(analyticsData.stores ?? []);
      setProducts(analyticsData.products ?? []);
      setTopSales(analyticsData.topSales ?? analyticsData.products ?? []);
      setTopUnsold(analyticsData.topUnsold ?? []);
      setNoSales(analyticsData.noSales ?? []);
      setSellers(analyticsData.sellers ?? []);
      setExpenses(analyticsData.expenses?.items ?? []);
      setExpenseTotal(analyticsData.expenses?.total ?? 0);
      setCategories(analyticsData.categories ?? []);
      setProductTypes(analyticsData.productTypes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (bootstrappedPeriod.current === period) {
      bootstrappedPeriod.current = null;
      return;
    }
    void load(period);
  }, [period, load]);

  const filteredTopSales = useMemo(
    () =>
      topSales.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q, topSales]
  );
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q, products]
  );
  const filteredWeak = useMemo(
    () =>
      topUnsold.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q, topUnsold]
  );
  const filteredNoSales = useMemo(
    () =>
      noSales.filter(
        (p) => !q.trim() || p.name.toLowerCase().includes(q.toLowerCase())
      ),
    [q, noSales]
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
      title={t("nav.finance")}
      subtitle={t("analyticsPage.subtitle")}
      kpis={[
        {
          label: t("analyticsPage.revenue"),
          value: loading
            ? "…"
            : formatMoney(network?.revenue ?? 0, { short: true }),
        },
        ...(canViewFinance
          ? [
              {
                label: t("dashboard.grossProfitLabel"),
                value: loading
                  ? "…"
                  : formatMoney(network?.grossProfit ?? 0, { short: true }),
              },
            ]
          : []),
        {
          label: t(expensesLabelKey(period)),
          value: loading
            ? "…"
            : formatMoney(network?.expenses ?? expenseTotal, { short: true }),
        },
        ...(canViewFinance
          ? [
              {
                label: t("dashboard.netProfit"),
                value: loading
                  ? "…"
                  : formatMoney(network?.netProfit ?? 0, { short: true }),
              },
            ]
          : []),
      ]}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {(["today", "week", "month", "year"] as Period[]).map((p) => (
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
            {(
              [
                ["revenue", network?.revenue],
                ...(canViewFinance
                  ? ([
                      ["cogs", network?.cogs],
                      ["gross", network?.grossProfit],
                    ] as const)
                  : []),
                ["expenses", network?.expenses],
                ...(canViewFinance
                  ? ([["net", network?.netProfit]] as const)
                  : []),
                ["sales", network?.salesCount],
              ] as [string, number | undefined][]
            ).map(([key, val]) => (
              <Card
                key={String(key)}
                id={key === "net" ? "finance-net" : undefined}
                className={cn(
                  "p-4",
                  key === "net" &&
                    focus === "net" &&
                    "ring-2 ring-brand/40 border-brand/30"
                )}
              >
                <div className="text-xs text-muted">
                  {key === "revenue"
                    ? t("dashboard.revenueLabel")
                    : key === "cogs"
                      ? t("dashboard.costLabel")
                      : key === "gross"
                        ? t("dashboard.grossProfitLabel")
                        : key === "expenses"
                          ? t(expensesLabelKey(period))
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
                <Card className="p-4">
                  <div className="font-semibold text-ink">{s.name}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <div className="text-[10px] uppercase text-muted">
                        {t("dashboard.revenueLabel")}
                      </div>
                      <div className="font-semibold tabular-nums">
                        {formatMoney(s.revenue, { short: true })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted">
                        {t("dashboard.grossProfitLabel")}
                      </div>
                      <div className="font-semibold tabular-nums">
                        {formatMoney(s.grossProfit, { short: true })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted">
                        {t(expensesLabelKey(period))}
                      </div>
                      <div className="font-semibold tabular-nums">
                        {formatMoney(s.expenses, { short: true })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-muted">
                        {t("dashboard.netProfit")}
                      </div>
                      <div className="font-semibold tabular-nums text-zone-money-deep">
                        {formatMoney(s.netProfit, { short: true })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {t("dashboard.salesN", { n: s.checks })}
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
              {t("analyticsPage.topSales")}
            </div>
            {filteredTopSales.length === 0 ? (
              <EmptyState title={t("analyticsPage.emptyTopSales")} />
            ) : (
              filteredTopSales.map((p, i) => (
                <Card
                  key={`top-${p.name}`}
                  className="flex flex-wrap justify-between gap-2 p-3 text-sm"
                >
                  <span className="font-medium text-ink">
                    <span className="mr-1.5 text-muted">
                      {t("analyticsPage.rankN", { n: i + 1 })}
                    </span>
                    {p.name}
                  </span>
                  <span className="text-muted">
                    {formatSoldQty(p, t)} ·{" "}
                    {formatMoney(p.revenue, { short: true })} ·{" "}
                    {formatMoney(p.profit, { short: true })}
                  </span>
                </Card>
              ))
            )}
          </div>
          <div className="mb-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted">
              {t("analyticsPage.topSelling")}
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState title={t("analyticsPage.emptyLeaders")} />
            ) : (
              filteredProducts.map((p) => (
                <Card
                  key={`pace-${p.name}`}
                  className="flex flex-wrap justify-between gap-2 p-3 text-sm"
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-muted">
                    {formatSoldQty(p, t)} ·{" "}
                    {formatMoney(p.revenue, { short: true })} ·{" "}
                    {formatMoney(p.profit, { short: true })}
                  </span>
                </Card>
              ))
            )}
          </div>
          <div className="mb-4 space-y-2">
            <div className="text-xs font-semibold uppercase text-muted">
              {t("analyticsPage.topUnsold")}
            </div>
            {filteredWeak.length === 0 ? (
              <EmptyState title={t("analyticsPage.emptyWeak")} />
            ) : (
              filteredWeak.map((p) => (
                <Card
                  key={`weak-${p.name}`}
                  className="flex flex-wrap justify-between gap-2 p-3 text-sm"
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-muted">{formatSoldQty(p, t)}</span>
                </Card>
              ))
            )}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase text-muted">
              {t("analyticsPage.noSales")}
            </div>
            {filteredNoSales.length === 0 ? (
              <EmptyState title={t("analyticsPage.emptyNoSales")} />
            ) : (
              filteredNoSales.map((p) => (
                <Card
                  key={`zero-${p.name}`}
                  className="flex flex-wrap justify-between gap-2 p-3 text-sm"
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-muted">{formatSoldQty(p, t)}</span>
                </Card>
              ))
            )}
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
              <span>
                {c.name.startsWith("analytics.") ? t(c.name) : c.name}
              </span>
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
            {t("analyticsPage.expensesAllocatedHint")} ·{" "}
            {formatMoney(expenseTotal, { short: true })}
          </div>
          {expenses.length === 0 ? (
            <Card className="p-4 text-sm text-muted">
              {t("analyticsPage.expensesEmpty")}
            </Card>
          ) : null}
          {expenses.map((e) => {
            const allocated = e.allocatedAmount ?? e.amount;
            const periodLabel = labelExpensePeriodicity(e.periodicity, t);
            return (
              <Card
                key={e.id}
                className="mb-2 flex flex-wrap justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <div className="font-semibold text-ink">
                    {e.type} · {e.store ?? "—"}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {periodLabel}
                    {e.periodicity && e.periodicity !== "ONCE"
                      ? ` · ${t("analyticsPage.expensesFullAmount", {
                          amount: formatMoney(e.amount, { short: true }),
                        })}`
                      : null}
                  </div>
                  {e.description ? (
                    <div className="mt-0.5 text-xs text-muted">
                      {formatExpenseDescription(e.description, t)}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-ink">
                    {formatMoney(allocated, { short: true })}
                  </div>
                  <div className="text-xs text-muted">
                    {t("analyticsPage.expensesInPeriod")} ·{" "}
                    {formatDate(e.incurredAt)}
                  </div>
                </div>
              </Card>
            );
          })}
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
