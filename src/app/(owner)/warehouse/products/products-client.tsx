"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingBlock } from "@/components/ui/empty-state";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { ProductCard } from "@/components/products/product-card";
import { apiErrorMessage } from "@/lib/i18n/labels";

type StatusKey = "active" | "empty" | "low" | "archived";

type Row = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  salePrice: string | number;
  warehouseQty: number;
  statusKey: StatusKey;
  isActive: boolean;
  accountingType: string;
  imageUrl?: string | null;
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

type Props = {
  initialRows: Row[];
  initialCategories: Ref[];
  initialBrands: Ref[];
};

export default function WarehouseCatalogClient({
  initialRows,
  initialCategories,
  initialBrands,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const isOwner = session?.user?.role === Role.OWNER;
  const { t } = useI18n();
  const [filters, setFilters, filtersReady] = usePersistedState<Filters>(
    "warehouse-catalog",
    {
      q: "",
      categoryId: "",
      brandId: "",
      status: "active",
    }
  );
  const { q, categoryId, brandId, status } = filters;
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [categories, setCategories] = useState<Ref[]>(initialCategories);
  const [brands, setBrands] = useState<Ref[]>(initialBrands);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [hydratedFilters, setHydratedFilters] = useState(false);

  async function softDeleteProduct(id: string) {
    if (!isOwner) return;
    if (!window.confirm(t("wh.productDeleteConfirm"))) return;
    setActionError("");
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  async function restoreProduct(id: string) {
    if (!isOwner) return;
    setActionError("");
    const res = await fetch(`/api/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  async function purgeProduct(id: string) {
    if (!isOwner) return;
    if (!window.confirm(t("wh.productDeleteForeverConfirm"))) return;
    setActionError("");
    const res = await fetch(`/api/products/${id}?force=1`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setActionError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  useEffect(() => {
    const fromUrl = searchParams.get("q");
    if (fromUrl != null && fromUrl !== q) {
      setFilters((f) => ({ ...f, q: fromUrl }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    setLoadError("");
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (brandId) params.set("brandId", brandId);
    if (status) params.set("status", status);
    const res = await fetch(`/api/products?${params}`);
    const data = await res.json();
    if (!res.ok) {
      setRows([]);
      setLoadError(
        typeof data?.error === "string" ? data.error : "LOAD_FAILED"
      );
      setLoading(false);
      return;
    }
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, categoryId, brandId, status, filtersReady]);

  useEffect(() => {
    // Prefer server-provided refs; only refetch if empty (edge)
    if (initialCategories.length || initialBrands.length) {
      setCategories(initialCategories);
      setBrands(initialBrands);
      setFilters((f) => {
        const catOk =
          !f.categoryId ||
          initialCategories.some((c) => c.id === f.categoryId);
        const brandOk =
          !f.brandId || initialBrands.some((b) => b.id === f.brandId);
        if (catOk && brandOk) return f;
        return {
          ...f,
          categoryId: catOk ? f.categoryId : "",
          brandId: brandOk ? f.brandId : "",
        };
      });
      return;
    }
    let cancelled = false;
    Promise.all([
      fetch("/api/categories").then(async (r) => ({
        ok: r.ok,
        data: await r.json(),
      })),
      fetch("/api/brands").then(async (r) => ({
        ok: r.ok,
        data: await r.json(),
      })),
    ]).then(([cats, brs]) => {
      if (cancelled) return;
      const catList = cats.ok && Array.isArray(cats.data) ? cats.data : [];
      const brandList = brs.ok && Array.isArray(brs.data) ? brs.data : [];
      setCategories(catList);
      setBrands(brandList);
    });
    return () => {
      cancelled = true;
    };
  }, [initialCategories, initialBrands, setFilters]);

  useEffect(() => {
    if (!filtersReady) return;
    // First paint: use RSC initialData when filters still match defaults
    if (
      !hydratedFilters &&
      !q.trim() &&
      !categoryId &&
      !brandId &&
      (status === "active" || !status)
    ) {
      setHydratedFilters(true);
      setRows(initialRows);
      return;
    }
    setHydratedFilters(true);
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [
    load,
    filtersReady,
    hydratedFilters,
    q,
    categoryId,
    brandId,
    status,
    initialRows,
  ]);

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
          isOwner ? (
            <Link href="/warehouse/new">
              <Button fullWidth={false}>{t("wh.createProduct")}</Button>
            </Link>
          ) : null
        }
      />

      {actionError ? <p className="text-sm text-danger">{actionError}</p> : null}

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
          <option value="">
            {t("wh.filterAll")} · {t("wh.categoriesTitle")}
          </option>
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
          <option value="">
            {t("wh.filterAll")} · {t("wh.colBrand")}
          </option>
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

      {loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : null}

      {loading ? (
        <LoadingBlock rows={6} label={t("wh.loadingCatalog")} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t("wh.emptyCatalog")}
          description={t("warehouse.productNoBatches")}
          actionHref={isOwner ? "/warehouse/new" : undefined}
          actionLabel={isOwner ? t("warehouse.productCreateBtn") : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const key = p.statusKey ?? "active";
            return (
              <ProductCard
                key={p.id}
                mode="warehouse"
                href={`/warehouse/${p.id}`}
                quantity={p.warehouseQty}
                statusLabel={statusLabel(p)}
                statusTone={STATUS_TONE[key]}
                product={{
                  id: p.id,
                  name: p.name,
                  imageUrl: p.imageUrl,
                  brand: p.brand,
                  category: p.category,
                  productType: p.productType,
                  unit: p.unit,
                  accountingType: p.accountingType,
                  salePrice: p.salePrice,
                }}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      fullWidth={false}
                      onClick={() => router.push(`/warehouse/${p.id}`)}
                    >
                      {t("wh.open")}
                    </Button>
                    {isOwner ? (
                      p.isActive ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          fullWidth={false}
                          onClick={() => softDeleteProduct(p.id)}
                        >
                          {t("wh.delete")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            fullWidth={false}
                            onClick={() => restoreProduct(p.id)}
                          >
                            {t("wh.restore")}
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            fullWidth={false}
                            onClick={() => purgeProduct(p.id)}
                          >
                            {t("wh.deleteForever")}
                          </Button>
                        </>
                      )
                    ) : null}
                  </div>
                }
                className="h-full"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
