"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingBlock } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { labelProductType } from "@/lib/i18n/labels";

type StatusKey = "active" | "empty" | "low" | "archived";

type Row = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  salePrice: string | number;
  warehouseQty: number;
  statusKey: StatusKey;
  statusLabel?: string;
  isActive: boolean;
  accountingType: string;
  brand?: { name: string; imageUrl?: string | null } | null;
  category?: { name: string } | null;
  unit?: { symbol: string } | null;
  productType?: { name: string } | null;
};

type Ref = { id: string; name: string };

type Filters = {
  q: string;
  categoryId: string;
  brandId: string;
  status: string;
};

const STATUS_LABEL_KEYS: Record<StatusKey, string> = {
  active: "wh.statusActive",
  empty: "wh.statusEmpty",
  low: "wh.statusLow",
  archived: "wh.statusArchive",
};

const STATUS_TONE: Record<StatusKey, string> = {
  active: "bg-success/10 text-success",
  low: "bg-warning/10 text-warning",
  empty: "bg-danger/10 text-danger",
  archived: "bg-muted/20 text-muted",
};

export default function WarehouseCatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, formatMoney } = useI18n();
  const [filters, setFilters] = usePersistedState<Filters>("warehouse-catalog", {
    q: "",
    categoryId: "",
    brandId: "",
    status: "active",
  });
  const { q, categoryId, brandId, status } = filters;
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [brands, setBrands] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fromUrl = searchParams.get("q");
    if (fromUrl != null && fromUrl !== q) {
      setFilters((f) => ({ ...f, q: fromUrl }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (brandId) params.set("brandId", brandId);
    if (status) params.set("status", status);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, categoryId, brandId, status]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []));
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => setBrands(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);

  function openProduct(id: string) {
    router.push(`/warehouse/${id}`);
  }

  function statusLabel(row: Row): string {
    const key = row.statusKey ?? "active";
    return t(STATUS_LABEL_KEYS[key] ?? STATUS_LABEL_KEYS.active);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wh.catalogTitle")}
        count={loading ? null : rows.length}
        subtitle={t("wh.catalogSubtitle")}
        actions={
          <Link href="/warehouse/new">
            <Button fullWidth={false}>{t("wh.createProduct")}</Button>
          </Link>
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          value={q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          placeholder={t("wh.searchSku")}
          className="w-full flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-ink"
        />
        <select
          value={categoryId}
          onChange={(e) =>
            setFilters((f) => ({ ...f, categoryId: e.target.value }))
          }
          className="rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <option value="">{t("wh.filterAll")} · {t("wh.categoriesTitle")}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={brandId}
          onChange={(e) => setFilters((f) => ({ ...f, brandId: e.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <option value="">{t("wh.filterAll")} · {t("wh.colBrand")}</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <option value="active">{t("wh.filterActive")}</option>
          <option value="archived">{t("wh.filterArchived")}</option>
          <option value="low">{t("wh.filterLow")}</option>
          <option value="empty">{t("wh.filterEmpty")}</option>
          <option value="all">{t("wh.filterAll")}</option>
        </select>
      </div>

      <Card className="hidden overflow-hidden p-0 lg:block">
        {loading ? (
          <div className="p-4">
            <LoadingBlock label={t("wh.loadingCatalog")} rows={6} />
          </div>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-page text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("warehouse.productPhoto")}</th>
                  <th className="px-4 py-3">{t("wh.colName")}</th>
                  <th className="px-4 py-3">{t("wh.colSku")}</th>
                  <th className="px-4 py-3">{t("wh.categoriesTitle")}</th>
                  <th className="px-4 py-3">{t("wh.colBrand")}</th>
                  <th className="px-4 py-3">{t("wh.colType")}</th>
                  <th className="px-4 py-3">{t("warehouse.unitPcs")}</th>
                  <th className="px-4 py-3">{t("wh.colPrice")}</th>
                  <th className="px-4 py-3">{t("wh.colQty")}</th>
                  <th className="px-4 py-3">{t("wh.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const key = p.statusKey ?? "active";
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-page"
                      onDoubleClick={() => openProduct(p.id)}
                      title={t("wh.open")}
                    >
                      <td className="px-4 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-lg">
                          {p.accountingType === "WEIGHT" ? "🧴" : "📦"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/warehouse/${p.id}`}
                          className="font-semibold text-ink hover:text-brand"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{p.sku || "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {p.category?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.brand?.name || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.productType?.name
                          ? labelProductType(p.productType.name, t)
                          : p.accountingType === "WEIGHT"
                            ? t("warehouse.unitMl")
                            : t("warehouse.unitPcs")}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {p.unit?.symbol || "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {formatMoney(Number(p.salePrice))}
                      </td>
                      <td className="px-4 py-3 font-semibold">{p.warehouseQty}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            STATUS_TONE[key]
                          )}
                        >
                          {statusLabel(p)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title={t("wh.emptyCatalog")}
              description={t("warehouse.productNoBatches")}
              actionHref="/warehouse/new"
              actionLabel={t("warehouse.productCreateBtn")}
            />
          </div>
        ) : null}
      </Card>

      <div className="space-y-2 lg:hidden">
        {loading ? <LoadingBlock rows={4} /> : null}
        {rows.map((p) => (
          <Link key={p.id} href={`/warehouse/${p.id}`}>
            <Card className="mb-2 p-4">
              <div className="font-semibold text-ink">{p.name}</div>
              <div className="mt-1 text-xs text-muted">
                {p.brand?.name || "—"} · {p.category?.name || "—"} · {t("wh.colQty")}{" "}
                {p.warehouseQty}
                {p.unit?.symbol || ""}
              </div>
              <div className="mt-1 text-sm font-medium">
                {formatMoney(Number(p.salePrice))} · {statusLabel(p)}
              </div>
            </Card>
          </Link>
        ))}
        {!loading && rows.length === 0 ? (
          <EmptyState
            title={t("wh.emptyCatalog")}
            description={t("warehouse.productNoBatches")}
            actionHref="/warehouse/new"
            actionLabel={t("warehouse.productCreateBtn")}
          />
        ) : null}
      </div>
    </div>
  );
}
