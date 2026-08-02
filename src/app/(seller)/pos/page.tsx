"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePosCart } from "@/lib/stores/pos-cart";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type CatalogItem = {
  productId: string;
  quantity: number;
  stockStatus: "OK" | "LOW" | "OUT";
  salePrice: number;
  product: {
    name: string;
    brand: { name: string; imageUrl: string | null } | null;
    category: { id: string; name: string } | null;
    unit: { symbol: string } | null;
    accountingType?: "PIECE" | "WEIGHT";
  };
};

type Category = { id: string; name: string };

export default function PosPage() {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const add = usePosCart((s) => s.add);
  const cartCount = usePosCart((s) => s.lines.reduce((n, l) => n + l.quantity, 0));
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storeName, setStoreName] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [loading, setLoading] = useState(true);

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
    setItems(data.items ?? []);
    setCategories(data.categories ?? []);
    setStoreName(data.store?.name ?? "");
  }, [q, categoryId, t]);

  useEffect(() => {
    const timer = setTimeout(load, 150);
    return () => clearTimeout(timer);
  }, [load]);

  function addItem(item: CatalogItem) {
    if (item.quantity <= 0) return;
    add({
      productId: item.productId,
      name: item.product.name,
      unitSymbol: item.product.unit?.symbol ?? "",
      salePrice: item.salePrice,
      max: item.quantity,
      quantity: 1,
      accountingType: item.product.accountingType,
    });
    setFlash(t("pos.addedToCart", { name: item.product.name }));
    setTimeout(() => setFlash(""), 1200);
  }

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (items.length >= 1 && q.trim()) {
      const exact = items[0];
      if (exact.quantity > 0) {
        addItem(exact);
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
      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}

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
              onClick={() => addItem(item)}
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
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    item.stockStatus === "OK" && "text-success",
                    item.stockStatus === "LOW" && "text-warning",
                    item.stockStatus === "OUT" && "text-danger"
                  )}
                >
                  {item.quantity}
                  {item.product.unit?.symbol ?? ""}
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
    </div>
  );
}
