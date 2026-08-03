"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import { usePosCart } from "@/lib/stores/pos-cart";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { ProductCard } from "@/components/products/product-card";
import { useSyncStatus } from "@/components/pwa/sync-status";

type CatalogItem = {
  productId: string;
  quantity: number;
  stockStatus: "OK" | "LOW" | "OUT";
  salePrice: number;
  product: {
    name: string;
    kind?: string;
    imageUrl?: string | null;
    brand: { name: string; imageUrl: string | null } | null;
    category: { id: string; name: string } | null;
    unit: { symbol: string } | null;
    accountingType?: "PIECE" | "WEIGHT";
  };
};

type Category = { id: string; name: string };

type BottleOption = {
  packagingSkuId: string | null;
  packagingProductId: string;
  name: string;
  volumeMl: number | null;
};

type CatalogPayload = {
  items: CatalogItem[];
  categories: Category[];
  store?: { name?: string };
};

async function fetchCatalog(): Promise<CatalogPayload> {
  const res = await fetch("/api/pos/catalog");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "CATALOG_ERROR");
  const raw = (data.items ?? []) as CatalogItem[];
  const sellable = raw.filter(
    (i) =>
      i.product.kind !== "PACKAGING" &&
      !(i.salePrice === 0 && /^флакон\b/i.test(i.product.name))
  );
  return {
    items: sellable,
    categories: data.categories ?? [],
    store: data.store,
  };
}

export default function PosPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { online } = useSyncStatus();
  const add = usePosCart((s) => s.add);
  const purgePackagingLines = usePosCart((s) => s.purgePackagingLines);
  const cartCount = usePosCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const [weightPick, setWeightPick] = useState<CatalogItem | null>(null);
  const [weightQty, setWeightQty] = useState("10");
  const [bottleId, setBottleId] = useState("");
  const [bottles, setBottles] = useState<BottleOption[]>([]);
  const [bottlesLoading, setBottlesLoading] = useState(false);

  const catalogQ = useQuery({
    queryKey: ["cache:pos-catalog"],
    queryFn: fetchCatalog,
    staleTime: 60_000,
    refetchInterval: online ? 5 * 60_000 : false,
  });

  const bottlesQ = useQuery({
    queryKey: ["cache:pos-bottles"],
    queryFn: async () => {
      const res = await fetch("/api/pos/packaging-bottles");
      const data = await res.json();
      return Array.isArray(data) ? (data as BottleOption[]) : [];
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!bottlesQ.data?.length) return;
    purgePackagingLines(
      bottlesQ.data.map((b) => b.packagingProductId).filter(Boolean)
    );
  }, [bottlesQ.data, purgePackagingLines]);

  useEffect(() => {
    if (catalogQ.isError) {
      setError(
        online
          ? apiErrorMessage(
              (catalogQ.error as Error)?.message,
              t,
              "pos.catalogError"
            )
          : t("pwa.offline")
      );
    } else {
      setError("");
    }
  }, [catalogQ.isError, catalogQ.error, online, t]);

  const allItems = catalogQ.data?.items ?? [];
  const categories = catalogQ.data?.categories ?? [];
  const storeName = catalogQ.data?.store?.name ?? "";

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allItems.filter((i) => {
      if (categoryId && i.product.category?.id !== categoryId) return false;
      if (!needle) return true;
      const hay = [
        i.product.name,
        i.product.brand?.name ?? "",
        i.product.category?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [allItems, q, categoryId]);

  const parentRef = useRef<HTMLDivElement>(null);
  const cols = 2;
  const rows = Math.ceil(filtered.length / cols);
  const rowVirtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 220,
    overscan: 4,
  });

  const openWeightModal = useCallback(
    async (item: CatalogItem) => {
      setWeightPick(item);
      setWeightQty("10");
      setBottleId("");
      setBottlesLoading(true);
      let list = bottlesQ.data ?? [];
      if (!list.length) {
        const res = await fetch("/api/pos/packaging-bottles");
        const data = await res.json();
        list = Array.isArray(data) ? data : [];
      }
      setBottlesLoading(false);
      setBottles(list);
      if (list.length === 1) setBottleId(list[0].packagingProductId);
    },
    [bottlesQ.data]
  );

  function addPiece(item: CatalogItem) {
    if (item.quantity <= 0) return;
    add({
      productId: item.productId,
      name: item.product.name,
      unitSymbol: item.product.unit?.symbol ?? "",
      salePrice: item.salePrice,
      max: item.quantity,
      quantity: 1,
      accountingType: "PIECE",
      imageUrl: item.product.imageUrl ?? item.product.brand?.imageUrl ?? null,
    });
    setFlash(t("pos.addedToCart", { name: item.product.name }));
    setTimeout(() => setFlash(""), 1200);
  }

  function confirmWeightAdd() {
    if (!weightPick) return;
    const qty = Number(weightQty);
    if (!(qty > 0)) {
      setError(t("pos.qtyInvalid"));
      return;
    }
    if (qty > weightPick.quantity) {
      setError(t("pos.qtyExceedsStock"));
      return;
    }
    const bottle = bottles.find((b) => b.packagingProductId === bottleId);
    if (!bottle) {
      setError(t("pos.bottleRequired"));
      return;
    }
    add({
      productId: weightPick.productId,
      name: weightPick.product.name,
      unitSymbol: weightPick.product.unit?.symbol ?? t("units.ml"),
      salePrice: weightPick.salePrice,
      max: weightPick.quantity,
      quantity: qty,
      accountingType: "WEIGHT",
      imageUrl:
        weightPick.product.imageUrl ?? weightPick.product.brand?.imageUrl ?? null,
      packagingProductId: bottle.packagingProductId,
      packagingSkuId: bottle.packagingSkuId,
      packagingName: bottle.name,
    });
    setFlash(t("pos.addedToCart", { name: weightPick.product.name }));
    setTimeout(() => setFlash(""), 1200);
    setWeightPick(null);
    setError("");
  }

  function onCardClick(item: CatalogItem) {
    if (item.quantity <= 0) return;
    if (item.product.accountingType === "WEIGHT") {
      void openWeightModal(item);
      return;
    }
    addPiece(item);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (filtered.length >= 1 && q.trim()) {
      const exact = filtered[0];
      if (exact.quantity > 0) {
        onCardClick(exact);
        setQ("");
      }
    }
  }

  const showColdLoading = catalogQ.isLoading && !catalogQ.data;
  const showUpdating = catalogQ.isFetching && !!catalogQ.data;

  return (
    <div className="space-y-4 pb-16">
      {storeName ? (
        <p className="text-center text-xs font-medium text-muted">
          {t("pos.stockOnly", { store: storeName })}
        </p>
      ) : null}

      {showUpdating ? (
        <p className="text-center text-[11px] text-muted">{t("pwa.syncing")}</p>
      ) : null}

      <div>
        <label className="sr-only" htmlFor="pos-search">
          {t("pos.search")}
        </label>
        <input
          id="pos-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onSearchKey}
          placeholder={t("pos.searchPlaceholder")}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-base text-ink shadow-sm outline-none ring-brand focus:ring-2"
          autoComplete="off"
        />
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategoryId("")}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium",
            !categoryId ? "bg-brand text-white" : "bg-card text-muted ring-1 ring-border"
          )}
        >
          {t("pos.allCategories")}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(c.id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-2 text-sm font-medium",
              categoryId === c.id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {flash ? (
        <div className="rounded-xl bg-success/10 px-3 py-2 text-center text-sm font-semibold text-success">
          {flash}
        </div>
      ) : null}
      {error && !weightPick ? (
        <p className="text-center text-sm text-danger">{error}</p>
      ) : null}

      {showColdLoading ? (
        <p className="py-8 text-center text-sm text-muted">{t("pos.loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted">
          {t("pos.emptyCatalog")}
          <br />
          {t("pos.ownerMustTransfer")}
        </div>
      ) : (
        <div
          ref={parentRef}
          className="h-[min(70dvh,720px)] overflow-auto"
        >
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const start = virtualRow.index * cols;
              const slice = filtered.slice(start, start + cols);
              return (
                <div
                  key={virtualRow.key}
                  className="absolute left-0 top-0 grid w-full grid-cols-2 gap-2.5"
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {slice.map((item) => (
                    <ProductCard
                      key={item.productId}
                      mode="pos"
                      asButton
                      disabled={item.quantity <= 0}
                      onClick={() => onCardClick(item)}
                      stockStatus={item.stockStatus}
                      product={{
                        id: item.productId,
                        name: item.product.name,
                        imageUrl: item.product.imageUrl,
                        brand: item.product.brand,
                        category: item.product.category,
                        unit: item.product.unit,
                        accountingType: item.product.accountingType,
                        salePrice: item.salePrice,
                      }}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {cartCount > 0 ? (
        <button
          type="button"
          onClick={() => router.push("/pos/cart")}
          className="fixed bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-lg"
        >
          {t("pos.cart")} · {cartCount}
        </button>
      ) : null}

      {weightPick ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink">{weightPick.product.name}</h2>
                <p className="text-sm text-muted">{t("pos.weightAddHint")}</p>
              </div>
              <button
                type="button"
                data-dismiss-esc
                className="text-sm text-muted"
                onClick={() => {
                  setWeightPick(null);
                  setError("");
                }}
              >
                {t("common.close")}
              </button>
            </div>
            <div>
              <FieldLabel>{t("pos.qtyMl")}</FieldLabel>
              <input
                type="number"
                min={0.1}
                step="0.1"
                value={weightQty}
                onChange={(e) => setWeightQty(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div>
              <FieldLabel>{t("pos.selectBottle")}</FieldLabel>
              <p className="mt-0.5 text-[11px] text-muted">{t("pos.bottleHint")}</p>
              {bottlesLoading ? (
                <p className="mt-1 text-xs text-muted">{t("common.loading")}</p>
              ) : bottles.length === 0 ? (
                <p className="mt-1 text-xs text-danger">{t("pos.noBottlesInStore")}</p>
              ) : (
                <select
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={bottleId}
                  onChange={(e) => setBottleId(e.target.value)}
                >
                  <option value="">{t("pos.bottlePlaceholder")}</option>
                  {bottles.map((b) => (
                    <option key={b.packagingProductId} value={b.packagingProductId}>
                      {b.name}
                      {b.volumeMl != null
                        ? ` · ${b.volumeMl} ${t("units.ml")}`
                        : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button
              type="button"
              className="w-full"
              onClick={confirmWeightAdd}
              disabled={bottlesLoading || bottles.length === 0}
            >
              {t("pos.addToCart")}
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
