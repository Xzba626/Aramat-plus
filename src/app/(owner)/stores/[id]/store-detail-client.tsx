"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Role } from "@prisma/client";
import { useSession } from "next-auth/react";
import { isOwnerClass } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  apiErrorMessage,
  formatExpenseDescription,
  labelDecisionStatus,
  labelRevisionStatus,
  labelRole,
  labelSaleStatus,
} from "@/lib/i18n/labels";
import { FinanceFunnel } from "@/components/dashboard/finance-funnel";
import {
  ContainerSourceBreakdown,
  PaymentMethodBreakdown,
} from "@/components/dashboard/payment-container-breakdown";
import { ProductThumb } from "@/components/products/product-thumb";
import { InitialStoreStockModal } from "@/components/stores/initial-store-stock-modal";

type StoreDetail = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  workingHours?: string | null;
  kind: "BRANCH" | "OWNER_DIRECT";
  status: "ACTIVE" | "CLOSED" | "INVENTORY";
  isArchived: boolean;
  openedAt?: string | null;
  notifyLowStock: boolean;
  notifyRequests: boolean;
  manager?: { id: string; name: string } | null;
  stockSource: "WAREHOUSE" | "STORE";
  warehouseName?: string | null;
  overview: {
    sellersCount: number;
    managersCount: number;
    skuCount: number;
    todaySalesCount: number;
    todayRevenue: number;
    todayCogs?: number;
    todayGrossProfit?: number;
    todayExpenses?: number;
    todayNetProfit?: number;
    todayProfit: number;
    monthProfit: number;
    monthRevenue: number;
    avgCheck: number;
    lastStaffLoginAt: string | null;
    lastStaffLoginName: string | null;
    lastSaleAt: string | null;
    lastRevisionAt: string | null;
    paymentMethods?: Array<{ method: string; amount: number; count: number }>;
    containerSource?: { storeBottles: number; customerBottles: number };
  };
};

type StockItem = {
  id: string;
  quantity: number;
  minStock: number;
  salePrice: number;
  status: "OK" | "LOW" | "OUT";
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

const BRANCH_TAB_KEYS = [
  { id: "overview", labelKey: "storeDetail.overview" },
  { id: "stock", labelKey: "storeDetail.stock" },
  { id: "staff", labelKey: "storeDetail.sellers" },
  { id: "sales", labelKey: "storeDetail.salesHistory" },
  { id: "discounts", labelKey: "storeDetail.discountsHistory" },
  { id: "returns", labelKey: "storeDetail.returnsHistory" },
  { id: "revisions", labelKey: "storeDetail.revisionsHistory" },
  { id: "expenses", labelKey: "storeDetail.expenses" },
  { id: "requests", labelKey: "storeDetail.requests" },
  { id: "settings", labelKey: "storeDetail.settings" },
] as const;

const OWNER_TAB_KEYS = [
  { id: "overview", labelKey: "storeDetail.overview" },
  { id: "stock", labelKey: "storeDetail.warehouseStock" },
  { id: "sales", labelKey: "storeDetail.salesHistory" },
  { id: "discounts", labelKey: "storeDetail.discountsHistory" },
  { id: "returns", labelKey: "storeDetail.returnsHistory" },
  { id: "requests", labelKey: "storeDetail.requests" },
  { id: "settings", labelKey: "storeDetail.channelSettings" },
] as const;

function storeStatusLabel(
  status: string,
  isArchived: boolean,
  t: (key: string) => string
) {
  if (isArchived) return t("storeDetail.archived");
  if (status === "CLOSED") return t("storeDetail.closed");
  if (status === "INVENTORY") return t("storeDetail.inventory");
  return t("storeDetail.working");
}

function stockStatusLabel(status: StockItem["status"], t: (key: string) => string) {
  if (status === "OUT") return t("storeDetail.stockOut");
  if (status === "LOW") return t("storeDetail.stockLow");
  return t("storeDetail.stockOk");
}

export function StoreDetailLoading() {
  return (
    <div className="p-6">
      <LoadingBlock rows={5} />
    </div>
  );
}

export default function StoreDetailClient() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const tab = search.get("tab") || "overview";
  const { t, formatMoney, formatDate, formatDateTime } = useI18n();
  const { data: session } = useSession();
  const isOwner = isOwnerClass(session?.user?.role);

  const [store, setStore] = useState<StoreDetail | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/stores/${id}`);
    const data = await res.json();
    if (res.ok) setStore(data);
    else setError(apiErrorMessage(data.error, t, "common.error"));
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load]);

  const isOwnerDirect = store?.kind === "OWNER_DIRECT";
  const tabs = (isOwnerDirect ? OWNER_TAB_KEYS : BRANCH_TAB_KEYS).filter(
    (tabItem) => tabItem.id !== "expenses" || isOwner
  );

  if (!store) {
    return (
      <>
        <PageHeader title={t("storeDetail.storeTitle")} />
        <div className="p-6">
          {error ? (
            <p className="text-danger">{error}</p>
          ) : (
            <LoadingBlock rows={5} />
          )}
        </div>
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title={
          isOwnerDirect ? t("nav.storesOwnerDirect") : store.name
        }
        subtitle={
          isOwnerDirect
            ? t("storeDetail.ownerDirectSubtitle", {
                warehouse: store.warehouseName ?? t("storeDetail.centralWarehouse"),
              })
            : store.address ?? undefined
        }
        actions={
          isOwnerDirect ? (
            <Link href={`/stores/${id}/pos`}>
              <Button fullWidth={false}>{t("storeDetail.openSales")}</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-6 -mx-1 flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            onClick={() => router.replace(`/stores/${id}?tab=${tabItem.id}`)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition",
              tab === tabItem.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border hover:text-ink"
            )}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <OverviewTab store={store} isOwnerDirect={!!isOwnerDirect} t={t} formatMoney={formatMoney} formatDate={formatDate} formatDateTime={formatDateTime} />
      ) : null}
      {tab === "stock" ? (
        <StockTab
          storeId={id}
          isOwner={!!isOwner}
          isOwnerDirect={!!isOwnerDirect}
          t={t}
          formatMoney={formatMoney}
        />
      ) : null}
      {tab === "staff" && !isOwnerDirect ? (
        <StaffTab
          storeId={id}
          isOwner={!!isOwner}
          onChanged={load}
          setError={setError}
          setMsg={setMsg}
          t={t}
          formatMoney={formatMoney}
          formatDateTime={formatDateTime}
        />
      ) : null}
      {tab === "sales" ? <SalesTab storeId={id} t={t} formatMoney={formatMoney} formatDateTime={formatDateTime} /> : null}
      {tab === "discounts" ? <DiscountsTab storeId={id} t={t} formatMoney={formatMoney} formatDateTime={formatDateTime} /> : null}
      {tab === "returns" ? <ReturnsTab storeId={id} t={t} formatDateTime={formatDateTime} /> : null}
      {tab === "revisions" && !isOwnerDirect ? <RevisionsTab storeId={id} t={t} formatDateTime={formatDateTime} /> : null}
      {tab === "expenses" && !isOwnerDirect && store && isOwner ? (
        <StoreExpensesPanel
          storeId={store.id}
          t={t}
          formatMoney={formatMoney}
          formatDateTime={formatDateTime}
        />
      ) : null}
      {tab === "requests" ? <RequestsTab storeId={id} t={t} formatDateTime={formatDateTime} /> : null}
      {tab === "settings" ? (
        <SettingsTab
          store={store}
          isOwnerDirect={!!isOwnerDirect}
          onSaved={load}
          setError={setError}
          setMsg={setMsg}
          t={t}
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
  t,
  formatMoney,
  formatDate,
  formatDateTime,
}: {
  store: StoreDetail;
  isOwnerDirect: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDate: (date: Date | string | number) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
  const o = store.overview;
  const revenue = o.todayRevenue;
  const gross = o.todayGrossProfit ?? o.todayProfit;
  const cogs = o.todayCogs ?? Math.max(0, Math.round((revenue - gross) * 100) / 100);
  const expenses = o.todayExpenses ?? 0;
  const net = o.todayNetProfit ?? Math.round((gross - expenses) * 100) / 100;

  return (
    <div className="space-y-4">
      {isOwnerDirect ? (
        <Card className="border-brand/20 bg-brand-soft/40 p-4">
          <div className="text-sm font-semibold text-ink">{t("storeDetail.ownerDirectBanner")}</div>
          <p className="mt-1 text-sm text-muted">{t("storeDetail.ownerDirectHint")}</p>
        </Card>
      ) : null}

      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
          {t("dashboard.zoneToday")}
        </div>
        <p className="mb-3 text-sm text-muted">{t("dashboard.funnelSectionHint")}</p>
        <FinanceFunnel
          scope="store"
          revenue={revenue}
          cogs={cogs}
          grossProfit={gross}
          expenses={expenses}
          netProfit={net}
        />
        <PaymentMethodBreakdown
          rows={o.paymentMethods ?? []}
          formatMoney={formatMoney}
          t={t}
        />
        <ContainerSourceBreakdown
          salesCount={o.todaySalesCount}
          storeBottles={o.containerSource?.storeBottles ?? 0}
          customerBottles={o.containerSource?.customerBottles ?? 0}
          t={t}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label={t("storeDetail.statStatus")} value={storeStatusLabel(store.status, store.isArchived, t)} />
        <Stat label={t("storeDetail.statAddress")} value={store.address || "—"} />
        <Stat
          label={t("storeDetail.statOpenedAt")}
          value={store.openedAt ? formatDate(store.openedAt) : "—"}
        />
        {!isOwnerDirect ? (
          <Stat label={t("storeDetail.statManager")} value={store.manager?.name || t("storeDetail.statManagerNone")} />
        ) : null}
        {!isOwnerDirect ? (
          <Stat label={t("storeDetail.statSellers")} value={String(o.sellersCount)} />
        ) : null}
        {!isOwnerDirect ? (
          <Stat label={t("storeDetail.statManagers")} value={String(o.managersCount)} />
        ) : null}
        <Stat label={t("storeDetail.statSku")} value={String(o.skuCount)} />
        <Stat label={t("storeDetail.statSalesToday")} value={String(o.todaySalesCount)} />
        <Stat label={t("storeDetail.statProfitMonth")} value={formatMoney(o.monthProfit)} accent />
        <Stat label={t("storeDetail.statAvgCheck")} value={formatMoney(o.avgCheck)} />
        {!isOwnerDirect ? (
          <Stat
            label={t("storeDetail.statLastLogin")}
            value={
              o.lastStaffLoginAt
                ? `${formatDateTime(o.lastStaffLoginAt)}${o.lastStaffLoginName ? ` · ${o.lastStaffLoginName}` : ""}`
                : "—"
            }
          />
        ) : null}
        {!isOwnerDirect ? (
          <Stat
            label={t("storeDetail.statLastRevision")}
            value={o.lastRevisionAt ? formatDateTime(o.lastRevisionAt) : "—"}
          />
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

function StockTab({
  storeId,
  isOwner,
  isOwnerDirect,
  t,
  formatMoney,
}: {
  storeId: string;
  isOwner: boolean;
  isOwnerDirect: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [initialOpen, setInitialOpen] = useState(false);
  const [data, setData] = useState<{
    items: StockItem[];
    total: number;
    pages: number;
    page: number;
  } | null>(null);

  useEffect(() => {
    const tmr = setTimeout(async () => {
      const sp = new URLSearchParams({
        q,
        status,
        sort,
        page: String(page),
        pageSize: "20",
      });
      const res = await fetch(`/api/stores/${storeId}/stock?${sp}`);
      const json = await res.json();
      if (res.ok) {
        setData({
          items: Array.isArray(json.items) ? json.items : [],
          total: typeof json.total === "number" ? json.total : 0,
          pages: typeof json.pages === "number" ? json.pages : 1,
          page: typeof json.page === "number" ? json.page : page,
        });
      }
    }, 200);
    return () => clearTimeout(tmr);
  }, [storeId, q, status, sort, page, reloadKey]);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          className="min-w-[200px] flex-1"
          placeholder={t("common.search")}
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
          <option value="ALL">{t("storeDetail.allStatuses")}</option>
          <option value="OK">{t("storeDetail.stockOk")}</option>
          <option value="LOW">{t("storeDetail.stockLow")}</option>
          <option value="OUT">{t("storeDetail.stockOut")}</option>
        </select>
        <select
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">{t("storeDetail.sortByName")}</option>
          <option value="qty">{t("storeDetail.sortByQty")}</option>
          <option value="price">{t("storeDetail.sortByPrice")}</option>
          <option value="status">{t("storeDetail.sortByStatus")}</option>
        </select>
        {isOwner && !isOwnerDirect ? (
          <Button
            type="button"
            fullWidth={false}
            onClick={() => setInitialOpen(true)}
          >
            {t("storeDetail.initialStockAdd")}
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden p-0">
        {!data ? (
          <div className="py-8 text-center text-muted">{t("storeDetail.loading")}</div>
        ) : data.items.length === 0 ? (
          <div className="py-8 text-center text-muted">{t("storeDetail.noStockItems")}</div>
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
                <ProductThumb
                  src={s.product.imageUrl}
                  name={s.product.name}
                  size="sm"
                  className="h-11 w-11"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{s.product.name}</div>
                  <div className="text-xs text-muted">
                    {s.product.brand?.name ?? "—"} · {s.product.category?.name ?? "—"} ·{" "}
                    {t("storeDetail.minStock")} {s.minStock}
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
                    {stockStatusLabel(s.status, t)}
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
            {t("common.recordsPage", {
              total: data.total,
              page: data.page,
              pages: data.pages,
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t("common.back")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("common.next")}
            </Button>
          </div>
        </div>
      ) : null}

      {isOwner && !isOwnerDirect ? (
        <InitialStoreStockModal
          storeId={storeId}
          open={initialOpen}
          onClose={() => setInitialOpen(false)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}

function StaffTab({
  storeId,
  isOwner,
  onChanged,
  setError,
  setMsg,
  t,
  formatMoney,
  formatDateTime,
}: {
  storeId: string;
  isOwner: boolean;
  onChanged: () => void;
  setError: (v: string) => void;
  setMsg: (v: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
  const fmtDate = (v: string | null | undefined) => (v ? formatDateTime(v) : "—");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [candidates, setCandidates] = useState<
    Array<{
      id: string;
      name: string;
      email: string;
      role: string;
      store?: { id: string; name: string } | null;
    }>
  >([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [staffLoading, setStaffLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(isOwner);
  const [canAssign, setCanAssign] = useState(isOwner);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");

  useEffect(() => {
    if (isOwner) {
      setCanCreate(true);
      setCanAssign(true);
      return;
    }
    let cancelled = false;
    fetch("/api/me/permissions")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const perms = (data?.permissions ?? {}) as Record<string, boolean>;
        setCanCreate(Boolean(perms["sellers.create"]));
        setCanAssign(Boolean(perms["sellers.assign"]));
      })
      .catch(() => {
        if (!cancelled) {
          setCanCreate(false);
          setCanAssign(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  async function load() {
    setStaffLoading(true);
    const staffRes = await fetch(`/api/stores/${storeId}/staff`);
    const staffData = await staffRes.json();
    if (staffRes.ok) setStaff(staffData);
    else setError(apiErrorMessage(staffData.error, t, "common.error"));

    if (canAssign || isOwner) {
      const candRes = await fetch(`/api/stores/${storeId}/staff?candidates=1`);
      const candData = await candRes.json();
      if (candRes.ok) setCandidates(Array.isArray(candData) ? candData : []);
      else setCandidates([]);
    } else {
      setCandidates([]);
    }
    setStaffLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, canAssign, isOwner]);

  async function assignStaff(e: FormEvent) {
    e.preventDefault();
    if (!selectedUserId || !canAssign) return;
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch(`/api/stores/${storeId}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("storeDetail.staffAssigned"));
    setSelectedUserId("");
    load();
    onChanged();
  }

  async function unassignStaff(userId: string) {
    if (!canAssign) return;
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch(
      `/api/stores/${storeId}/staff?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" }
    );
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("storeDetail.staffUnassigned"));
    load();
    onChanged();
  }

  async function createSeller(e: FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    setBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: createName,
        email: createEmail,
        password: createPassword,
        role: "SELLER",
        storeId,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("usersPage.created"));
    setShowCreate(false);
    setCreateName("");
    setCreateEmail("");
    setCreatePassword("");
    load();
    onChanged();
  }

  return (
    <div>
      <SectionTitle>{t("storeDetail.branchSellers")}</SectionTitle>
      <p className="mb-3 text-xs text-muted">{t("storeDetail.staffAssignHint")}</p>
      <Card className="mb-4 overflow-hidden p-0">
        {staffLoading ? (
          <div className="p-4">
            <LoadingBlock rows={3} />
          </div>
        ) : staff.length === 0 ? (
          <div className="py-6 text-center text-muted">{t("storeDetail.noStaff")}</div>
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
                      {u.isActive ? t("storeDetail.active") : t("storeDetail.blocked")}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {u.email} · {labelRole(u.role, t)} · {t("storeDetail.createdAt")}{" "}
                    {fmtDate(u.createdAt)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {t("storeDetail.staffLogin")}: {fmtDate(u.lastLoginAt)} ·{" "}
                    {t("storeDetail.staffSales")} {u.salesCount} · {formatMoney(u.salesSum)} ·{" "}
                    {t("storeDetail.staffAvgCheck")} {formatMoney(u.avgCheck)} ·{" "}
                    {t("storeDetail.staffDiscounts")} {u.discountRequests} ·{" "}
                    {t("storeDetail.staffReturns")} {u.returnRequests}
                  </div>
                </div>
                {canAssign && (isOwner || u.role === "SELLER") ? (
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    disabled={busy}
                    onClick={() => unassignStaff(u.id)}
                  >
                    {t("storeDetail.unassignStaff")}
                  </Button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </Card>

      {canCreate ? (
        <Card className="mb-4 max-w-lg p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">
              {t("storeDetail.createSeller")}
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? t("common.cancel") : t("usersPage.create")}
            </Button>
          </div>
          {showCreate ? (
            <form onSubmit={createSeller} className="space-y-3">
              <div>
                <FieldLabel>{t("usersPage.name")}</FieldLabel>
                <input
                  className="w-full"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>{t("usersPage.loginEmail")}</FieldLabel>
                <input
                  className="w-full"
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>{t("usersPage.tempPassword")}</FieldLabel>
                <input
                  className="w-full"
                  type="password"
                  required
                  minLength={8}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy} fullWidth={false}>
                {t("common.save")}
              </Button>
            </form>
          ) : null}
        </Card>
      ) : null}

      {canAssign ? (
        <Card className="max-w-lg p-4">
          <div className="mb-2 text-sm font-semibold text-ink">
            {t("storeDetail.assignExisting")}
          </div>
          <form onSubmit={assignStaff} className="space-y-3">
            <div>
              <FieldLabel>{t("storeDetail.selectEmployee")}</FieldLabel>
              <select
                className="w-full"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
              >
                <option value="">—</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email}) · {labelRole(c.role, t)}
                    {c.store ? ` · ${c.store.name}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {candidates.length === 0 ? (
              <p className="text-xs text-muted">{t("storeDetail.noCandidates")}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy || !selectedUserId} fullWidth={false}>
                {t("storeDetail.assignStaff")}
              </Button>
              {isOwner ? (
                <Link href="/users">
                  <Button type="button" variant="secondary" fullWidth={false}>
                    {t("storeDetail.goCreateUser")}
                  </Button>
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

function SalesTab({
  storeId,
  t,
  formatMoney,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
  const paymentLabel = (m: string) => {
    if (m === "CARD") return t("storeDetail.paymentCard");
    if (m === "TRANSFER") return t("storeDetail.paymentTransfer");
    return t("storeDetail.paymentCash");
  };

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
      items: Array<{
        productName: string;
        quantity: number;
        isGift: boolean;
        containerSource?: string | null;
      }>;
    }>
  >([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/sales?page=${page}`);
      const data = await res.json();
      if (res.ok) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setPages(typeof data.pages === "number" ? data.pages : 1);
      }
    })();
  }, [storeId, page]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("storeDetail.salesImmutable")}</p>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">{t("storeDetail.noSales")}</div>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">№ {s.number}</div>
                  <div className="text-xs text-muted">
                    {formatDateTime(s.createdAt)} · {s.seller.name} · {paymentLabel(s.paymentMethod)} ·{" "}
                    {labelSaleStatus(s.status, t)}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {(Array.isArray(s.items) ? s.items : [])
                      .map((it) => {
                        const bottle =
                          it.containerSource === "CUSTOMER_BOTTLE"
                            ? ` (${t("pos.containerCustomerShort")})`
                            : it.containerSource === "STORE_BOTTLE"
                              ? ` (${t("pos.containerStoreShort")})`
                              : "";
                        return `${it.productName} ×${it.quantity}${
                          it.isGift ? ` (${t("storeDetail.gift")})` : ""
                        }${bottle}`;
                      })
                      .join(", ")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{formatMoney(s.total)}</div>
                  {s.discountAmount > 0 ? (
                    <div className="text-xs text-warning">
                      {t("storeDetail.discountAmount")} {formatMoney(s.discountAmount)}
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
            {t("common.back")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("common.next")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DiscountsTab({
  storeId,
  t,
  formatMoney,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
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
      if (res.ok) setItems(Array.isArray(data) ? data : []);
    })();
  }, [storeId]);

  return (
    <Card className="overflow-hidden p-0">
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted">{t("storeDetail.noDiscounts")}</div>
      ) : (
        items.map((r) => (
          <div key={r.id} className="border-b border-border px-4 py-3 last:border-0">
            <div className="font-semibold text-ink">
              {formatMoney(r.amount)} · {labelDecisionStatus(r.status, t)}
            </div>
            <div className="text-xs text-muted">
              {formatDateTime(r.createdAt)} · {r.requester.name} · {r.reason ?? "—"}
            </div>
            {r.reviewedAt ? (
              <div className="mt-1 text-xs text-muted">
                {t("storeDetail.decision")}: {formatDateTime(r.reviewedAt)} · {r.reviewNote ?? "—"}
              </div>
            ) : null}
          </div>
        ))
      )}
    </Card>
  );
}

function ReturnsTab({
  storeId,
  t,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
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
      if (res.ok) setItems(Array.isArray(data) ? data : []);
    })();
  }, [storeId]);

  return (
    <Card className="overflow-hidden p-0">
      {items.length === 0 ? (
        <div className="py-8 text-center text-muted">{t("storeDetail.noReturns")}</div>
      ) : (
        items.map((r) => (
          <div key={r.id} className="border-b border-border px-4 py-3 last:border-0">
            <div className="font-semibold text-ink">{labelDecisionStatus(r.status, t)}</div>
            <div className="text-xs text-muted">
              {formatDateTime(r.createdAt)} · {r.requester.name}
              {r.reviewer ? ` · ${t("storeDetail.confirmedBy")}: ${r.reviewer.name}` : ""}
            </div>
            <div className="mt-1 text-xs text-muted">
              {r.reason ?? "—"} ·{" "}
              {(Array.isArray(r.products) ? r.products : [])
                .map((p) => `${p.name} ×${p.quantity}`)
                .join(", ")}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function RevisionsTab({
  storeId,
  t,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
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
      if (res.ok) setItems(Array.isArray(data) ? data : []);
    })();
  }, [storeId]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("storeDetail.revisionsHint")}</p>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">{t("storeDetail.noRevisions")}</div>
        ) : (
          items.map((s) => (
            <div key={s.id} className="border-b border-border px-4 py-3 last:border-0">
              <div className="font-semibold text-ink">
                {formatDateTime(s.createdAt)} · {labelRevisionStatus(s.status, t)}
              </div>
              <div className="text-xs text-muted">
                {t("storeDetail.conductedBy")}: {s.createdBy.name}
              </div>
              {s.blind ? (
                <div className="mt-1 text-xs text-muted">
                  {t("storeDetail.blindOnly")}
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted">
                  {t("storeDetail.shortageSurplus", {
                    shortage: s.shortageQty ?? 0,
                    surplus: s.surplusQty ?? 0,
                    n: Array.isArray(s.items) ? s.items.length : 0,
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function StoreExpensesPanel({
  storeId,
  t,
  formatMoney,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatMoney: (value: number | string, opts?: { short?: boolean }) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      incurredAt: string;
      type: string;
      typeId: string;
      amount: number;
      description: string | null;
      actor: string;
    }>
  >([]);
  const [expenseTypes, setExpenseTypes] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [showForm, setShowForm] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const [expRes, typesRes] = await Promise.all([
      fetch(`/api/expenses?storeId=${storeId}`),
      fetch("/api/expense-types"),
    ]);
    const exp = await expRes.json();
    const types = await typesRes.json();
    if (expRes.ok && Array.isArray(exp)) {
      setRows(
        exp.map(
          (e: {
            id: string;
            incurredAt: string;
            amount: number;
            description: string | null;
            expenseType: { id: string; name: string };
            createdBy: string;
          }) => ({
            id: e.id,
            incurredAt: e.incurredAt,
            type: e.expenseType.name,
            typeId: e.expenseType.id,
            amount: e.amount,
            description: e.description,
            actor: e.createdBy,
          })
        )
      );
    }
    if (typesRes.ok && Array.isArray(types)) {
      setExpenseTypes(types.map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = rows.filter((r) => {
    const matchQ =
      !q.trim() ||
      `${r.type} ${formatExpenseDescription(r.description, t)} ${r.actor}`
        .toLowerCase()
        .includes(q.toLowerCase());
    const matchT = typeFilter === "ALL" || r.typeId === typeFilter;
    return matchQ && matchT;
  });
  const total = filtered.reduce((s, r) => s + r.amount, 0);

  async function onAddType(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const name = newTypeName.trim();
    if (!name) return;
    const res = await fetch("/api/expense-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setNewTypeName("");
    setMsg(t("storeDetail.expenseTypeAdded"));
    await reload();
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError("");
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        expenseTypeId: String(fd.get("type")),
        amount: Number(fd.get("amount")),
        description: String(fd.get("description") || "") || undefined,
        periodicity: String(fd.get("periodicity") || "ONCE"),
        startsAt: String(fd.get("startsAt") || "")
          ? new Date(String(fd.get("startsAt"))).toISOString()
          : undefined,
        endsAt: String(fd.get("endsAt") || "")
          ? new Date(String(fd.get("endsAt"))).toISOString()
          : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setShowForm(false);
    setMsg(t("storeDetail.expenseAdded"));
    e.currentTarget.reset();
    await reload();
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <div className="text-xs font-semibold uppercase text-muted">
            {t("storeDetail.filterTotal")}
          </div>
          <div className="mt-1 text-xl font-bold text-ink">
            {formatMoney(total)}
          </div>
          <p className="mt-1 text-xs text-muted">{t("storeDetail.expensesHint")}</p>
          <p className="mt-1 text-xs text-muted">{t("storeDetail.expensesOwnerOnly")}</p>
        </div>
        <Button
          type="button"
          fullWidth={false}
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? t("common.cancel") : t("storeDetail.addExpense")}
        </Button>
      </Card>

      <Card className="max-w-lg space-y-3 p-4">
        <SectionTitle>{t("storeDetail.expenseTypesTitle")}</SectionTitle>
        <p className="text-xs text-muted">{t("storeDetail.expenseTypesHint")}</p>
        {expenseTypes.length === 0 ? (
          <p className="text-sm text-muted">{t("common.noData")}</p>
        ) : (
          <ul className="space-y-1 text-sm text-ink">
            {expenseTypes.map((typeItem) => (
              <li key={typeItem.id} className="border-b border-border py-1.5 last:border-0">
                {typeItem.name}
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={onAddType} className="flex flex-wrap gap-2">
          <input
            value={newTypeName}
            onChange={(e) => setNewTypeName(e.target.value)}
            placeholder={t("storeDetail.expenseTypePlaceholder")}
            className="min-w-[160px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
            required
          />
          <Button type="submit" variant="secondary" fullWidth={false}>
            {t("storeDetail.addExpenseType")}
          </Button>
        </form>
      </Card>

      {msg ? <p className="text-sm text-success">{msg}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {showForm ? (
        <Card className="max-w-lg p-4">
          <form onSubmit={onAdd} className="space-y-3">
            <div>
              <FieldLabel>{t("storeDetail.type")}</FieldLabel>
              <select
                name="type"
                required
                className="w-full"
                defaultValue={expenseTypes[0]?.id}
              >
                {expenseTypes.map((typeItem) => (
                  <option key={typeItem.id} value={typeItem.id}>
                    {typeItem.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("storeDetail.amount")}</FieldLabel>
              <input
                name="amount"
                type="number"
                min="1"
                step="0.01"
                required
                className="w-full"
              />
            </div>
            <div>
              <FieldLabel>{t("storeDetail.periodicity")}</FieldLabel>
              <select name="periodicity" className="w-full" defaultValue="MONTHLY">
                <option value="ONCE">{t("storeDetail.periodOnce")}</option>
                <option value="DAILY">{t("storeDetail.periodDaily")}</option>
                <option value="WEEKLY">{t("storeDetail.periodWeekly")}</option>
                <option value="MONTHLY">{t("storeDetail.periodMonthly")}</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <FieldLabel>{t("storeDetail.startsAt")}</FieldLabel>
                <input
                  name="startsAt"
                  type="date"
                  className="w-full"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <FieldLabel>{t("storeDetail.endsAt")}</FieldLabel>
                <input name="endsAt" type="date" className="w-full" />
              </div>
            </div>
            <div>
              <FieldLabel>{t("storeDetail.description")}</FieldLabel>
              <input
                name="description"
                className="w-full"
                placeholder={t("storeDetail.forWhat")}
              />
            </div>
            <Button type="submit">{t("storeDetail.save")}</Button>
          </form>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.search")}
          className="min-w-[180px] flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="ALL">{t("storeDetail.allTypes")}</option>
          {expenseTypes.map((typeItem) => (
            <option key={typeItem.id} value={typeItem.id}>
              {typeItem.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-page/80 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">
                  {t("storeDetail.date")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("storeDetail.type")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("storeDetail.amount")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("storeDetail.description")}
                </th>
                <th className="px-4 py-3 font-semibold">
                  {t("storeDetail.who")}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted">
                    {formatDateTime(r.incurredAt)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{r.type}</td>
                  <td className="px-4 py-3 tabular-nums text-ink">
                    {formatMoney(r.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {formatExpenseDescription(r.description, t) || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            {t("storeDetail.noExpenses")}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function RequestsTab({
  storeId,
  t,
  formatDateTime,
}: {
  storeId: string;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDateTime: (date: Date | string | number) => string;
}) {
  const [status, setStatus] = useState("ALL");
  const [items, setItems] = useState<
    Array<{
      id: string;
      type: "DISCOUNT" | "RETURN";
      status: string;
      createdAt: string;
      requester: { name: string };
      summary: string;
    }>
  >([]);
  const [note, setNote] = useState("");

  const requestTypeLabel = (type: "DISCOUNT" | "RETURN") =>
    type === "DISCOUNT" ? t("storeDetail.discount") : t("storeDetail.return");

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/stores/${storeId}/requests?status=${status}`);
      const data = await res.json();
      if (res.ok) {
        setItems(Array.isArray(data.items) ? data.items : []);
        setNote(data.writeOffsNoteKey ? t(data.writeOffsNoteKey) : "");
      }
    })();
  }, [storeId, status]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ["ALL", "storeDetail.filterAll"],
            ["PENDING", "storeDetail.filterNew"],
            ["APPROVED", "storeDetail.filterApproved"],
            ["REJECTED", "storeDetail.filterRejected"],
          ] as const
        ).map(([v, labelKey]) => (
          <button
            key={v}
            type="button"
            onClick={() => setStatus(v)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              status === v ? "bg-brand text-white" : "bg-card ring-1 ring-border text-muted"
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <Card className="overflow-hidden p-0">
        {items.length === 0 ? (
          <div className="py-8 text-center text-muted">{t("storeDetail.noRequests")}</div>
        ) : (
          items.map((r) => (
            <div key={`${r.type}-${r.id}`} className="border-b border-border px-4 py-3 last:border-0">
              <div className="font-semibold text-ink">
                {requestTypeLabel(r.type)} · {labelDecisionStatus(r.status, t)}
              </div>
              <div className="text-xs text-muted">
                {formatDateTime(r.createdAt)} · {r.requester.name} · {r.summary}
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
  t,
}: {
  store: StoreDetail;
  isOwnerDirect: boolean;
  onSaved: () => void;
  setError: (v: string) => void;
  setMsg: (v: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
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
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("storeDetail.settingsSaved"));
    onSaved();
  }

  return (
    <form onSubmit={save} className="max-w-lg space-y-3">
      <div>
        <FieldLabel>{t("storeDetail.name")}</FieldLabel>
        <input
          className="w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isOwnerDirect}
          required
        />
      </div>
      <div>
        <FieldLabel>{t("storeDetail.address")}</FieldLabel>
        <input className="w-full" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      <div>
        <FieldLabel>{t("storeDetail.phone")}</FieldLabel>
        <input className="w-full" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div>
        <FieldLabel>{t("storeDetail.workingHours")}</FieldLabel>
        <input
          className="w-full"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          placeholder="09:00–21:00"
        />
      </div>
      <div>
        <FieldLabel>{t("storeDetail.statStatus")}</FieldLabel>
        <select
          className="w-full rounded-lg border border-border bg-card px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value as StoreDetail["status"])}
        >
          <option value="ACTIVE">{t("storeDetail.working")}</option>
          <option value="CLOSED">{t("storeDetail.closed")}</option>
          <option value="INVENTORY">{t("storeDetail.inventory")}</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notifyLow} onChange={(e) => setNotifyLow(e.target.checked)} />
        {t("storeDetail.notifyLowStock")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notifyReq} onChange={(e) => setNotifyReq(e.target.checked)} />
        {t("storeDetail.notifyRequests")}
      </label>
      {!isOwnerDirect ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />
          {t("storeDetail.archivedLabel")}
        </label>
      ) : (
        <p className="text-xs text-muted">{t("storeDetail.ownerChannelNoArchive")}</p>
      )}
      <Button type="submit">{t("storeDetail.save")}</Button>
    </form>
  );
}
