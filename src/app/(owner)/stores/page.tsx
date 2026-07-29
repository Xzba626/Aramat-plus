"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { formatMoney, cn } from "@/lib/utils";

type StoreCard = {
  id: string;
  name: string;
  address?: string | null;
  kind: "BRANCH" | "OWNER_DIRECT";
  statusLabel: string;
  status: string;
  staffCount: number;
  skuCount: number;
  unitsTotal: number;
  stockCost: number;
  todaySalesCount: number;
  todayRevenue: number;
  todayProfit: number;
  monthRevenue: number;
  monthProfit: number;
  pendingRequests: number;
  lastSaleAt: string | null;
  lastRevisionAt: string | null;
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StoresPage() {
  const [stores, setStores] = useState<StoreCard[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const res = await fetch("/api/stores");
    const data = await res.json();
    if (res.ok) setStores(data);
    else setError(data.error || "Ошибка");
  }

  useEffect(() => {
    load();
  }, []);

  const ownerDirect = useMemo(
    () => stores.find((s) => s.kind === "OWNER_DIRECT"),
    [stores]
  );
  const branches = useMemo(
    () => stores.filter((s) => s.kind !== "OWNER_DIRECT" && !("isArchived" in s && (s as { isArchived?: boolean }).isArchived)),
    [stores]
  );

  const network = useMemo(() => {
    const list = branches;
    return {
      branchCount: list.length,
      todayRevenue: list.reduce((s, x) => s + x.todayRevenue, 0) + (ownerDirect?.todayRevenue ?? 0),
      todayProfit: list.reduce((s, x) => s + x.todayProfit, 0) + (ownerDirect?.todayProfit ?? 0),
      pending: list.reduce((s, x) => s + x.pendingRequests, 0) + (ownerDirect?.pendingRequests ?? 0),
      staff: list.reduce((s, x) => s + x.staffCount, 0),
    };
  }, [branches, ownerDirect]);

  async function createStore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        address: String(fd.get("address") || "") || null,
        phone: String(fd.get("phone") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setShowForm(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Магазины"
        count={stores.length || null}
        subtitle="Двойной клик / клик открывает карточку · остатки только со склада"
        actions={
          <Button type="button" fullWidth={false} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Отмена" : "+ Филиал"}
          </Button>
        }
      />

      {/* Сводка сети — HQ экран */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NetStat label="Филиалы" value={String(network.branchCount)} />
        <NetStat label="Продажи сегодня" value={formatMoney(network.todayRevenue)} />
        <NetStat label="Прибыль сегодня" value={formatMoney(network.todayProfit)} accent />
        <NetStat
          label="Ожидают решения"
          value={String(network.pending)}
          warn={network.pending > 0}
        />
      </div>

      {showForm ? (
        <Card className="mb-6 max-w-lg p-4">
          <form onSubmit={createStore} className="space-y-3">
            <div>
              <FieldLabel>Название филиала</FieldLabel>
              <input name="name" required className="w-full" placeholder="Магазин Душанбе" />
            </div>
            <div>
              <FieldLabel>Адрес</FieldLabel>
              <input name="address" className="w-full" />
            </div>
            <div>
              <FieldLabel>Телефон</FieldLabel>
              <input name="phone" className="w-full" />
            </div>
            <Button type="submit">Сохранить</Button>
          </form>
        </Card>
      ) : null}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}

      {ownerDirect ? (
        <Link href={`/stores/${ownerDirect.id}`} id="owner-direct" className="mb-6 block scroll-mt-24">
          <Card className="border-brand/30 bg-gradient-to-br from-brand-soft to-card p-5 ring-1 ring-brand/15 transition hover:ring-brand/40">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-brand">
                  Личные продажи владельца
                </div>
                <div className="mt-1 text-xl font-bold text-ink">{ownerDirect.name}</div>
                <div className="mt-2 text-sm text-muted">
                  Источник: центральный склад · без перемещений
                  <br />
                  SKU на складе: {ownerDirect.skuCount} · единиц: {ownerDirect.unitsTotal}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-right text-sm">
                <div>
                  <div className="text-xs text-muted">Сегодня</div>
                  <div className="font-bold">{ownerDirect.todaySalesCount} прод.</div>
                  <div className="text-success">{formatMoney(ownerDirect.todayRevenue)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">Месяц</div>
                  <div className="font-bold text-ink">{formatMoney(ownerDirect.monthRevenue)}</div>
                  <div className="text-success">{formatMoney(ownerDirect.monthProfit)}</div>
                </div>
              </div>
            </div>
          </Card>
        </Link>
      ) : null}

      <SectionTitle>Филиалы ({branches.length})</SectionTitle>
      <div className="grid gap-3 lg:grid-cols-2">
        {branches.map((s) => (
          <Link key={s.id} href={`/stores/${s.id}`}>
            <Card tap className="h-full p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-ink">{s.name}</div>
                  <div className="mt-0.5 text-xs text-muted">{s.address || "Адрес не указан"}</div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    s.status === "ACTIVE" && "bg-success/10 text-success",
                    s.status === "CLOSED" && "bg-muted/30 text-muted",
                    s.status === "INVENTORY" && "bg-warning/15 text-warning"
                  )}
                >
                  {s.statusLabel}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <Metric label="Сотрудники" value={String(s.staffCount)} />
                <Metric label="SKU" value={String(s.skuCount)} />
                <Metric label="Единиц" value={String(s.unitsTotal)} />
                <Metric label="Стоимость ост." value={formatMoney(s.stockCost)} />
                <Metric label="Продажи сегодня" value={formatMoney(s.todayRevenue)} />
                <Metric label="Месяц" value={formatMoney(s.monthRevenue)} />
                <Metric label="Прибыль сегодня" value={formatMoney(s.todayProfit)} accent />
                <Metric
                  label="Запросы"
                  value={String(s.pendingRequests)}
                  warn={s.pendingRequests > 0}
                />
                <Metric label="Посл. продажа" value={fmtDate(s.lastSaleAt)} />
                <Metric label="Посл. ревизия" value={fmtDate(s.lastRevisionAt)} />
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {branches.length === 0 ? (
        <div className="py-8 text-center text-muted">
          Нет филиалов — добавьте первую точку или отправьте товар со склада
        </div>
      ) : null}
    </div>
  );
}

function NetStat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-bold text-ink",
          accent && "text-success",
          warn && "text-warning"
        )}
      >
        {value}
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div
        className={cn(
          "font-semibold text-ink",
          accent && "text-success",
          warn && "text-warning"
        )}
      >
        {value}
      </div>
    </div>
  );
}
