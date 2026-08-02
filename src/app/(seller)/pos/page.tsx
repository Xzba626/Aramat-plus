"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePosCart } from "@/lib/stores/pos-cart";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";

type CatalogItem = {
  productId: string;
  quantity: number;
  stockStatus: "OK" | "LOW" | "OUT";
  salePrice: number;
  product: {
    name: string;
    kind?: string;
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

export default function PosPage() {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const add = usePosCart((s) => s.add);
  const purgePackagingLines = usePosCart((s) => s.purgePackagingLines);
  const cartCount = usePosCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);

  const [weightPick, setWeightPick] = useState<CatalogItem | null>(null);
  const [weightQty, setWeightQty] = useState("10");
  const [bottleId, setBottleId] = useState("");
  const [bottles, setBottles] = useState<BottleOption[]>([]);
  const [bottlesLoading, setBottlesLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (categoryId) sp.set("categoryId", categoryId);
    const res = await fetch(`/api/pos/catalog?${sp}`);
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "pos.catalogError"));
      return;
    }
    setError("");
    const raw = (data.items ?? []) as CatalogItem[];
    // Never show packaging bottles in the sellable grid
    const sellable = raw.filter(
      (i) =>
        i.product.kind !== "PACKAGING" &&
        !(i.salePrice === 0 && /^флакон\b/i.test(i.product.name))
    );
    setItems(sellable);
    setCategories(data.categories ?? []);
    setStoreName(data.store?.name ?? "");
  }, [q, categoryId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    // Purge legacy cart rows that treated bottles as products
    fetch("/api/pos/packaging-bottles")
      .then((r) => r.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        purgePackagingLines(
          data.map((b: BottleOption) => b.packagingProductId).filter(Boolean)
        );
      })
      .catch(() => undefined);
  }, [purgePackagingLines]);

  async function openWeightModal(item: CatalogItem) {
    setWeightPick(item);
    setWeightQty("10");
    setBottleId("");
    setBottlesLoading(true);
    const res = await fetch("/api/pos/packaging-bottles");
    const data = await res.json();
    setBottlesLoading(false);
    if (res.ok && Array.isArray(data)) {
      setBottles(data);
      if (data.length === 1) setBottleId(data[0].packagingProductId);
    } else {
      setBottles([]);
    }
  }

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
      unitSymbol: weightPick.product.unit?.symbol ?? "мл",
      salePrice: weightPick.salePrice,
      max: weightPick.quantity,
      quantity: qty,
      accountingType: "WEIGHT",
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
    if (items.length >= 1 && q.trim()) {
      const exact = items[0];
      if (exact.quantity > 0) {
        onCardClick(exact);
        setQ("");
      }
    }
  }

  return (
    <div className="space-y-4 pb-16">
      {storeName ? (
        <p className="text-center text-xs font-medium text-muted">
          {t("pos.stockOnly", { store: storeName })}
        </p>
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

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">{t("pos.loading")}</p>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted">
          {t("pos.emptyCatalog")}
          <br />
          {t("pos.ownerMustTransfer")}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {items.map((item) => (
            <button
              key={item.productId}
              type="button"
              disabled={item.quantity <= 0}
              onClick={() => onCardClick(item)}
              className={cn(
                "rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:scale-[0.98]",
                item.stockStatus === "LOW" && "ring-1 ring-warning/40",
                item.stockStatus === "OUT" && "opacity-50"
              )}
            >
              <div className="mb-2 flex h-14 items-center justify-center rounded-xl bg-brand-soft text-lg font-bold text-brand">
                {(item.product.brand?.name ?? item.product.name).slice(0, 1)}
              </div>
              <div className="line-clamp-2 text-sm font-semibold text-ink">
                {item.product.name}
              </div>
              <div className="mt-1 text-xs text-muted">
                {item.product.brand?.name ?? "—"}
              </div>
              <div className="mt-2 flex items-end justify-between gap-1">
                <span className="text-sm font-bold text-ink">
                  {formatMoney(item.salePrice)}
                </span>
                {/* Seller must NOT see exact stock — only status */}
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    item.stockStatus === "OK" && "text-success",
                    item.stockStatus === "LOW" && "text-warning",
                    item.stockStatus === "OUT" && "text-danger"
                  )}
                >
                  {item.stockStatus === "OUT"
                    ? t("pos.outOfStock")
                    : item.stockStatus === "LOW"
                      ? t("pos.lowStock")
                      : t("pos.inStock")}
                </span>
              </div>
            </button>
          ))}
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
                      {b.volumeMl != null ? ` · ${b.volumeMl} мл` : ""}
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
