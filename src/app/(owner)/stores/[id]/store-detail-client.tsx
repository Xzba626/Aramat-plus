"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { formatMoney, cn } from "@/lib/utils";
import { MOCK_EXPENSES } from "@/lib/ui-mocks";

type StoreDetail = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  workingHours?: string | null;
  kind: "BRANCH" | "OWNER_DIRECT";
  status: "ACTIVE" | "CLOSED" | "INVENTORY";
  statusLabel: string;
  isArchived: boolean;
  openedAt?: string | null;
  notifyLowStock: boolean;
  notifyRequests: boolean;
  manager?: { id: string; name: string } | null;
  stockSource: "WAREHOUSE" | "STORE";
  warehouseName?: string | null;
  overview: {
    sellersCount: number;
    skuCount: number;
    todaySalesCount: number;
    todayRevenue: number;
    todayProfit: number;
    monthProfit: number;
    monthRevenue: number;
    avgCheck: number;
    lastStaffLoginAt: string | null;
    lastStaffLoginName: string | null;
    lastSaleAt: string | null;
    lastRevisionAt: string | null;
  };
};

type StockItem = {
  id: string;
  quantity: number;
  minStock: number;
  salePrice: number;
  status: "OK" | "LOW" | "OUT";
  statusLabel: string;
  product: {
    name: string;
    imageUrl: string | null;
    brand: { name: string } | null;
    category: { name: string } | null;
    unit: { symbol: string } | null;
  };
};

type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  salesCount: number;
  salesSum: number;
  avgCheck: number;
  discountRequests: number;
  returnRequests: number;
};

const BRANCH_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "stock", label: "Остатки" },
  { id: "staff", label: "Продавцы" },
  { id: "sales", label: "История продаж" },
  { id: "discounts", label: "История скидок" },
  { id: "returns", label: "История возвратов" },
  { id: "revisions", label: "История ревизий" },
  { id: "expenses", label: "Расходы" },
  { id: "requests", label: "Запросы" },
  { id: "settings", label: "Настройки" },
] as const;

const OWNER_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "stock", label: "Остатки склада" },
  { id: "sales", label: "История продаж" },
  { id: "discounts", label: "История скидок" },
  { id: "returns", label: "История возвратов" },
  { id: "requests", label: "Запросы" },
  { id: "settings", label: "Настройки канала" },
] as const;

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(m: string) {
  if (m === "CARD") return "Карта";
  if (m === "TRANSFER") return "Перевод";
  return "Наличные";
}

export default function StoreDetailClient() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = search.get("tab") || "overview";

  const [store, setStore] = useState<StoreDetail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/stores/${id}`);
    const data = await res.json();
    if (res.ok) setStore(data);
    else setError(data.error || "Ошибка");
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwnerDirect = store?.kind === "OWNER_DIRECT";
  const tabs = isOwnerDirect ? OWNER_TABS : BRANCH_TABS;

  if (!store) {
    return (
      <>
        <PageHeader title="Торговая точка" />
        <div className="p-6 text-muted">{error || "Загрузка…"}</div>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title={store.name}
        subtitle={
          isOwnerDirect
            ? `Источник: ${store.warehouseName ?? "центральный склад"} · без перемещений`
            : store.address ?? undefined
        }
        actions={
          isOwnerDirect ? (
            <Link href={`/stores/${id}/pos`}>
              <Button fullWidth={false}>Открыть продажи</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 -mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => router.replace(`/stores/${id}?tab=${t.id}`)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition",
              tab === t.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab store={store} isOwnerDirect={!!isOwnerDirect} /> : null}
      {tab === "stock" ? <StockTab storeId={id} /> : null}
      {tab === "staff" && !isOwnerDirect ? (
        <StaffTab storeId={id} onChanged={load} setError={setError} setMsg={setMsg} />
      ) : null}
      {tab === "sales" ? <SalesTab storeId={id} /> : null}
      {tab === "discounts" ? <DiscountsTab storeId={id} /> : null}
      {tab === "returns" ? <ReturnsTab storeId={id} /> : null}
      {tab === "revisions" && !isOwnerDirect ? <RevisionsTab storeId={id} /> : null}
      {tab === "expenses" && !isOwnerDirect ? <ExpensesTab /> : null}
      {tab === "requests" ? <RequestsTab storeId={id} /> : null}
      {tab === "settings" ? (
        <SettingsTab
          store={store}
          isOwnerDirect={!!isOwnerDirect}
          onSaved={load}
          setError={setError}
          setMsg={setMsg}
        />
      ) : null}

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {msg ? <p className="mt-3 text-sm text-success">{msg}</p> : null}
    </div>
  );
}

function OverviewTab({
  store,
  isOwnerDirect,
}: {
  store: StoreDetail;
  isOwnerDirect: boolean;
}) {
  const o = store.overview;
  return (
    <div className="space-y-4">
      {isOwnerDirect ? (
        <Card className="border-brand/20 bg-brand-soft/40 p-4">
          <div className="text-sm font-semibold text-ink">
            Центральный склад → продажа владельцем
          </div>
          <p className="mt-1 text-sm text-muted">
            Без перемещений. Скидки — сразу. Возвраты — на склад.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Статус" value={store.statusLabel} />
        <Stat label="Адрес" value={store.address || "—"} />
        <Stat label="Дата открытия" value={fmtDate(store.openedAt)} />
        {!isOwnerDirect ? (
          <Stat label="Менеджер" value={store.manager?.name || "Не назначен"} />
        ) : null}
        {!isOwnerDirect ? <Stat label="Продавцы" value={String(o.sellersCount)} /> : null}
        <Stat label="Товаров (SKU)" value={String(o.skuCount)} />
        <Stat label="Продажи сегодня" value={formatMoney(o.todayRevenue)} />
        <Stat label="Прибыль сегодня" value={formatMoney(o.todayProfit)} accent />
        <Stat label="Прибыль месяца" value={formatMoney(o.monthProfit)} accent />
        <Stat label="Средний чек" value={formatMoney(o.avgCheck)} />
        {!isOwnerDirect ? (
          <Stat
            label="Последний вход"
            value={
              o.lastStaffLoginAt
                ? `${fmtDate(o.lastStaffLoginAt)}${o.lastStaffLoginName ? ` · ${o.lastStaffLoginName}` : ""}`
                : "—"
            }
          />
        ) : null}
        {!isOwnerDirect ? (
          <Stat label="Последняя ревизия" value={fmtDate(o.lastRevisionAt)} />
        ) : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 text-lg font-bold text-ink", accent && "text-success")}>
        {value}
      </div>
    </Card>
  );
}

function StockTab({ storeId }: { storeId: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    items: StockItem[];
    total: number;
    pages: number;
    page: number;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const sp = new URLSearchParams({
        q,
        status,
        sort,
        page: String(page),
        pageSize: "20",
      });
      const res = await fetch(`/api/stores/${storeId}/stock?${sp}`);
      const json = await res.json();
      if (res.ok) setData(json);
    }, 200);
    return () => clearTimeout(t);
  }, [storeId, q, status, sort, page]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          className="min-w-[200px] flex-1"
          placeholder="Поиск…"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="ALL">Все статусы</option>
          <option value="OK">Нормально</option>
          <option value="LOW">Заканчивается</option>
          <option value="OUT">Закончился</option>
        </select>
        <select
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">По названию</option>
          <option value="qty">По остатку</option>
          <option value="price">По цене</option>
          <option value="status">По статусу</option>
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        {!data ? (
          <div className="py-8 text-center text-muted">Загрузка…</div>
        ) : data.items.length === 0 ? (
          <div className="py-8 text-center text-muted">Нет позиций</div>
        ) : (
          <ul>
            {data.items.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-3 border-b border-border px-4 py-3 last:border-0",
                  s.status === "LOW" && "bg-warning/10",
                  s.status === "OUT" && "bg-danger/5"
                )}
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-soft text-sm font-bold text-brand">
                  {s.product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (s.product.brand?.name ?? s.product.name).slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{s.product.name}</div>
                  <div className="text-xs text-muted">
                    {s.product.brand?.name ?? "—"} · {s.product.category?.name ?? "—"} · мин.{" "}
                    {s.minStock}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-bold text-ink">
                    {s.quantity}
                    {s.product.unit?.symbol ?? ""}
                  </div>
                  <div className="text-xs text-muted">{formatMoney(s.salePrice)}</div>
                  <div
                    className={cn(
                      "mt-0.5 text-xs font-semibold",
                      s.status === "OK" && "text-success",
                      s.status === "LOW" && "text-warning",
                      s.status === "OUT" && "text-danger"
                    )}
                  >
                    {s.statusLabel}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && data.pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">
            {data.total} поз. · стр. {data.page}/{data.pages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StaffTab({
  storeId,
  onChanged,
  setError,
  setMsg,
}: {
  storeId: string;
  onChanged: () => void;
  setError: (v: string) => void;
  setMsg: (v: string) => void;
}) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");

  async function load() {
    const res = await fetch(`/api/stores/${storeId}/staff`);
    const data = await res.json();
    if (res.ok) setStaff(data);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  async function createSeller(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        role: "SELLER",
        storeId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Продавец создан (пароль сохранён как hash)");
    setShowForm(false);
    load();
    onChanged();
  }

  async function patchUser(id: string, patch: Record<string, unknown>) {
    setError("");
    setMsg("");
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Сохранено");
    load();
  }

  async function resetPassword(userId: string) {
    if (newPass.length < 4) {
      setError("Пароль минимум 4 символа");
      return;
    }
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, newPassword: newPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Пароль сброшен (hash). Старый/новый пароль не отображается.");
    setResetFor(null);
    setNewPass("");
  }

  return (
    <div>
      <SectionTitle>Продавцы филиала</SectionTitle>
      <Card className="mb-4 overflow-hidden p-0">
        {staff.length === 0 ? (
          <div className="py-6 text-center text-muted">Нет сотрудников</div>
        ) : (
          staff.map((u) => (
            <div key={u.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">
                    {u.name}{" "}
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        u.isActive ? "text-success" : "text-danger"
                      )}
                    >
                      {u.isActive ? "Активен" : "Заблокирован"}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {u.email} · {u.role} · созд. {fmtDate(u.createdAt)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Вход: {fmtDate(u.lastLoginAt)} · продаж {u.salesCount} ·{" "}
                    {formatMoney(u.salesSum)} · ср. чек {formatMoney(u.avgCheck)} · скидок{" "}
                    {u.discountRequests} · возвратов {u.returnRequests}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                  >
                    {u.isActive ? "Блок" : "Разблок"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    onClick={() =>
                      patchUser(u.id, { role: u.role === "SELLER" ? "MANAGER" : "SELLER" })
                    }
                  >
                    Роль
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    onClick={() => setResetFor(u.id)}
                  >
                    Сброс пароля
                  </Button>
                </div>
              </div>
              {resetFor === u.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="flex-1">
                    <FieldLabel>Новый пароль (не отображается после сохранения)</FieldLabel>
                    <input
                      type="password"
                      className="w-full"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      minLength={4}
                    />
                  </div>
                  <Button type="button" fullWidth={false} onClick={() => resetPassword(u.id)}>
                    Сохранить hash
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </Card>

      <Button type="button" variant="secondary" onClick={() => setShowForm((v) => !v)}>
        {showForm ? "Отмена" : "+ Добавить продавца"}
      </Button>
      {showForm ? (
        <form onSubmit={createSeller} className="mt-3 max-w-md space-y-3">
          <div>
            <FieldLabel>Имя</FieldLabel>
            <input name="name" required className="w-full" />
          </div>
          <div>
            <FieldLabel>Email</FieldLabel>
            <input name="email" type="email" required className="w-full" />
          </div>
          <div>
            <FieldLabel>Пароль (только при создании, потом только hash)</FieldLabel>
            <input name="password" type="password" required minLength={4} className="w-full" />
          </div>
          <Button type="submit">Создать</Button>
        </form>
      ) : null}
    </div>
  );
}

function SalesTab({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      number: string;
      createdAt: string;
      seller: { name: string };
      discountAmount: number;
      total: number;
      paymentMethod: string;
      status: string;
      items: Array<{ productName: string; quantity: number; isGift: boolean }>;
    }>
  >([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/sales?page=${page}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        setPages(data.pages);
      }
    })();
  }, [storeId, page]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">Продажи неизменяемы после завершения.</p>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">Нет продаж</div>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">№ {s.number}</div>
                  <div className="text-xs text-muted">
                    {fmtDate(s.createdAt)} · {s.seller.name} · {paymentLabel(s.paymentMethod)} ·{" "}
                    {s.status}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {s.items
                      .map(
                        (it) =>
                          `${it.productName} ×${it.quantity}${it.isGift ? " (подарок)" : ""}`
                      )
                      .join(", ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{formatMoney(s.total)}</div>
                  {s.discountAmount > 0 ? (
                    <div className="text-xs text-warning">
                      скидка {formatMoney(s.discountAmount)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </Card>
      {pages > 1 ? (
        <div className="mt-3 flex gap-2">
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Далее
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DiscountsTab({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      createdAt: string;
      reviewedAt: string | null;
      requester: { name: string };
      reason: string | null;
      amount: number;
      status: string;
      reviewNote: string | null;
    }>
  >([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/discounts`);
      const data = await res.json();
      if (res.ok) setItems(data);
    })();
  }, [storeId]);

  return (
    <Card className="overflow-hidden p-0">
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted">Нет запросов скидок</div>
      ) : (
        items.map((r) => (
          <div key={r.id} className="border-b border-border px-4 py-3 last:border-0">
            <div className="font-semibold text-ink">
              {formatMoney(r.amount)} · {r.status}
            </div>
            <div className="text-xs text-muted">
              {fmtDate(r.createdAt)} · {r.requester.name} · {r.reason ?? "—"}
            </div>
            {r.reviewedAt ? (
              <div className="mt-1 text-xs text-muted">
                Решение: {fmtDate(r.reviewedAt)} · {r.reviewNote ?? "—"}
              </div>
            ) : null}
          </div>
        ))
      )}
    </Card>
  );
}

function ReturnsTab({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      createdAt: string;
      reason: string | null;
      status: string;
      requester: { name: string };
      reviewer: { name: string } | null;
      products: Array<{ name: string; quantity: number }>;
    }>
  >([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/returns`);
      const data = await res.json();
      if (res.ok) setItems(data);
    })();
  }, [storeId]);

  return (
    <Card className="overflow-hidden p-0">
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted">Нет возвратов</div>
      ) : (
        items.map((r) => (
          <div key={r.id} className="border-b border-border px-4 py-3 last:border-0">
            <div className="font-semibold text-ink">{r.status}</div>
            <div className="text-xs text-muted">
              {fmtDate(r.createdAt)} · {r.requester.name}
              {r.reviewer ? ` · подтвердил: ${r.reviewer.name}` : ""}
            </div>
            <div className="mt-1 text-xs text-muted">
              {r.reason ?? "—"} ·{" "}
              {r.products.map((p) => `${p.name} ×${p.quantity}`).join(", ")}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function RevisionsTab({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<
    Array<{
      id: string;
      createdAt: string;
      status: string;
      createdBy: { name: string };
      blind: boolean;
      shortageQty?: number;
      surplusQty?: number;
      items: Array<Record<string, number | string | null>>;
    }>
  >([]);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/revisions`);
      const data = await res.json();
      if (res.ok) setItems(data);
    })();
  }, [storeId]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Manager видит только введённый факт (blind). Owner — ожидание, расхождения, суммы.
      </p>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">Нет ревизий</div>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="font-semibold text-ink">
                {fmtDate(s.createdAt)} · {s.status}
              </div>
              <div className="text-xs text-muted">Проводил: {s.createdBy.name}</div>
              {s.blind ? (
                <div className="mt-1 text-xs text-muted">
                  Blind: только факт · позиций {s.items.length}
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted">
                  Недостача: {s.shortageQty ?? 0} · Излишки: {s.surplusQty ?? 0} · позиций{" "}
                  {s.items.length}
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function ExpensesTab() {
  return <StoreExpensesPanel />;
}

function StoreExpensesPanel() {
  const [rows, setRows] = useState(
    () =>
      MOCK_EXPENSES.map((e) => ({ ...e })) as Array<{
        id: string;
        date: string;
        type: string;
        amount: number;
        description: string;
        actor: string;
      }>
  );
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [msg, setMsg] = useState("");

  const types = ["Аренда", "Зарплата", "Коммунальные", "Прочее"];
  const filtered = rows.filter((r) => {
    const matchQ =
      !q.trim() ||
      `${r.type} ${r.description} ${r.actor}`.toLowerCase().includes(q.toLowerCase());
    const matchT = typeFilter === "ALL" || r.type === typeFilter;
    return matchQ && matchT;
  });
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const row = {
      id: `ex-${Date.now()}`,
      date: new Date().toLocaleDateString("ru-RU"),
      type: String(fd.get("type")),
      amount: Number(fd.get("amount")),
      description: String(fd.get("description") || ""),
      actor: "Вы",
    };
    setRows((prev) => [row, ...prev]);
    setShowForm(false);
    setMsg("Расход добавлен");
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">Итого по фильтру</div>
          <div className="mt-1 text-xl font-bold text-ink">{formatMoney(total)}</div>
          <p className="mt-1 text-xs text-muted">
            Расходы принадлежат этому магазину. Общего раздела «Расходы» нет.
          </p>
        </div>
        <Button type="button" fullWidth={false} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Отмена" : "+ Расход"}
        </Button>
      </Card>

      {msg ? <p className="text-sm text-success">{msg}</p> : null}

      {showForm ? (
        <Card className="max-w-lg p-4">
          <form onSubmit={onAdd} className="space-y-3">
            <div>
              <FieldLabel>Тип</FieldLabel>
              <select name="type" required className="w-full" defaultValue="Аренда">
                {types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Сумма (сомони)</FieldLabel>
              <input name="amount" type="number" min="1" step="0.01" required className="w-full" />
            </div>
            <div>
              <FieldLabel>Описание</FieldLabel>
              <input name="description" className="w-full" placeholder="За что" />
            </div>
            <Button type="submit">Сохранить</Button>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск…"
          className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="ALL">Все типы</option>
          {types.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Дата</th>
                <th className="px-4 py-3 font-semibold">Тип</th>
                <th className="px-4 py-3 font-semibold">Сумма</th>
                <th className="px-4 py-3 font-semibold">Описание</th>
                <th className="px-4 py-3 font-semibold">Кто</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted">{r.date}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{r.type}</td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    {formatMoney(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.description || "—"}</td>
                  <td className="px-4 py-3 text-muted">{r.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">Нет расходов</div>
        ) : null}
      </Card>
    </div>
  );
}

function RequestsTab({ storeId }: { storeId: string }) {
  const [status, setStatus] = useState("ALL");
  const [items, setItems] = useState<
    Array<{
      id: string;
      typeLabel: string;
      status: string;
      createdAt: string;
      requester: { name: string };
      summary: string;
    }>
  >([]);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/requests?status=${status}`);
      const data = await res.json();
      if (res.ok) {
        setItems(data.items);
        setNote(data.writeOffsNote ?? "");
      }
    })();
  }, [storeId, status]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {[
          ["ALL", "Все"],
          ["PENDING", "Новые"],
          ["APPROVED", "Подтверждённые"],
          ["REJECTED", "Отклонённые"],
        ].map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setStatus(v)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              status === v ? "bg-brand text-white" : "bg-card ring-1 ring-border text-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">Нет запросов</div>
        ) : (
          items.map((r) => (
            <div key={`${r.typeLabel}-${r.id}`} className="border-b border-border px-4 py-3 last:border-0">
              <div className="font-semibold text-ink">
                {r.typeLabel} · {r.status}
              </div>
              <div className="text-xs text-muted">
                {fmtDate(r.createdAt)} · {r.requester.name} · {r.summary}
              </div>
            </div>
          ))
        )}
      </Card>
      {note ? <p className="mt-2 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

function SettingsTab({
  store,
  isOwnerDirect,
  onSaved,
  setError,
  setMsg,
}: {
  store: StoreDetail;
  isOwnerDirect: boolean;
  onSaved: () => void;
  setError: (v: string) => void;
  setMsg: (v: string) => void;
}) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [hours, setHours] = useState(store.workingHours ?? "");
  const [status, setStatus] = useState(store.status);
  const [notifyLow, setNotifyLow] = useState(store.notifyLowStock);
  const [notifyReq, setNotifyReq] = useState(store.notifyRequests);
  const [archived, setArchived] = useState(store.isArchived);

  useEffect(() => {
    setName(store.name);
    setAddress(store.address ?? "");
    setPhone(store.phone ?? "");
    setHours(store.workingHours ?? "");
    setStatus(store.status);
    setNotifyLow(store.notifyLowStock);
    setNotifyReq(store.notifyRequests);
    setArchived(store.isArchived);
  }, [store]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: store.id,
        name,
        address: address || null,
        phone: phone || null,
        workingHours: hours || null,
        status,
        notifyLowStock: notifyLow,
        notifyRequests: notifyReq,
        isArchived: archived,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    setMsg("Настройки сохранены");
    onSaved();
  }

  return (
    <form onSubmit={save} className="max-w-lg space-y-3">
      <div>
        <FieldLabel>Название</FieldLabel>
        <input
          className="w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isOwnerDirect}
          required
        />
      </div>
      <div>
        <FieldLabel>Адрес</FieldLabel>
        <input className="w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div>
        <FieldLabel>Телефон</FieldLabel>
        <input className="w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <FieldLabel>Рабочее время</FieldLabel>
        <input
          className="w-full"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="09:00–21:00"
        />
      </div>
      <div>
        <FieldLabel>Статус</FieldLabel>
        <select
          className="w-full rounded-lg border border-border bg-card px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value as StoreDetail["status"])}
        >
          <option value="ACTIVE">Работает</option>
          <option value="CLOSED">Закрыт</option>
          <option value="INVENTORY">На ревизии</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notifyLow} onChange={(e) => setNotifyLow(e.target.checked)} />
        Уведомления о низком остатке
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notifyReq} onChange={(e) => setNotifyReq(e.target.checked)} />
        Уведомления о запросах
      </label>
      {!isOwnerDirect ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          Архивный (удаление запрещено)
        </label>
      ) : (
        <p className="text-xs text-muted">Канал владельца нельзя архивировать.</p>
      )}
      <Button type="submit">Сохранить</Button>
    </form>
  );
}
