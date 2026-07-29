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
import { cn, formatMoney } from "@/lib/utils";

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

  return (
    <ModuleWorkspace
      title="Аналитика"
      subtitle="Каждый магазин отдельно и сводка по всей сети"
      kpis={[
        {
          label: "Продажи сегодня",
          value: loading ? "…" : formatMoney(networkRevenue),
        },
        {
          label: "Прибыль сегодня",
          value: loading ? "…" : formatMoney(networkProfit),
        },
        {
          label: "Чеков сегодня",
          value: loading ? "…" : String(networkSales),
        },
        {
          label: "Выручка за месяц",
          value: loading ? "…" : formatMoney(monthRevenue),
        },
      ]}
    >
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-border pb-3">
        {(
          [
            ["network", "Сеть"],
            ["stores", "По магазинам"],
            ["products", "Товары"],
            ["sellers", "Продавцы"],
            ["expenses", "Расходы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-xl px-3.5 py-2 text-sm font-semibold transition",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {(tab === "products" || tab === "sellers") && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск…"
          className="mb-4 w-full max-w-md rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
      )}

      {tab === "network" || tab === "stores" ? (
        <ModuleSection title="Магазины сегодня">
          {loading ? (
            <Card className="p-5 text-sm text-muted">Загрузка…</Card>
          ) : (
            <div className="space-y-2">
              {stores.map((s) => (
                <Link key={s.id} href={`/stores/${s.id}`}>
                  <Card className="mb-2 flex flex-wrap items-center justify-between gap-3 p-4 transition hover:border-brand/30">
                    <div>
                      <div className="font-semibold text-ink">{s.name}</div>
                      <div className="text-xs text-muted">
                        {s.kind === "OWNER_DIRECT"
                          ? "Личные продажи владельца"
                          : `${s.todaySalesCount} продаж сегодня`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-ink">
                        {formatMoney(s.todayRevenue)}
                      </div>
                      <div className="text-xs font-semibold text-success">
                        {formatMoney(s.todayProfit)}
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
        <ModuleSection title="Топ товары">
          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Товар</th>
                  <th className="px-4 py-3 font-semibold">Продано</th>
                  <th className="px-4 py-3 font-semibold">Выручка</th>
                  <th className="px-4 py-3 font-semibold">Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{p.name}</td>
                    <td className="px-4 py-3 text-muted">{p.sold}</td>
                    <td className="px-4 py-3">{formatMoney(p.revenue)}</td>
                    <td className="px-4 py-3 text-success">{formatMoney(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "sellers" ? (
        <ModuleSection title="Лучшие продавцы">
          <Card className="overflow-hidden p-0">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Продавец</th>
                  <th className="px-4 py-3 font-semibold">Магазин</th>
                  <th className="px-4 py-3 font-semibold">Чеки</th>
                  <th className="px-4 py-3 font-semibold">Выручка</th>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s) => (
                  <tr key={s.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-semibold text-ink">{s.name}</td>
                    <td className="px-4 py-3 text-muted">{s.store}</td>
                    <td className="px-4 py-3">{s.checks}</td>
                    <td className="px-4 py-3">{formatMoney(s.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </ModuleSection>
      ) : null}

      {tab === "expenses" ? (
        <ModuleSection title="Расходы по магазинам">
          <Card className="p-5 text-sm text-muted">
            Расходы ведутся в карточке каждого магазина (вкладка «Расходы»). Откройте
            точку, чтобы добавить аренду, зарплату или коммунальные.
          </Card>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {stores
              .filter((s) => s.kind !== "OWNER_DIRECT")
              .map((s) => (
                <Link key={s.id} href={`/stores/${s.id}?tab=expenses`}>
                  <Card className="p-4 transition hover:border-brand/30">
                    <div className="font-semibold text-ink">{s.name}</div>
                    <div className="mt-1 text-sm text-brand">Открыть расходы →</div>
                  </Card>
                </Link>
              ))}
          </div>
        </ModuleSection>
      ) : null}
    </ModuleWorkspace>
  );
}
