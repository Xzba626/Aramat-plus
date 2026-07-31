"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, decimalToNumber } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { useToast } from "@/components/ui/toast";

type CatalogItem = {
  productId: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  salePrice: number;
  quantity: number;
};

type Line = {
  productId: string;
  name: string;
  unit: string;
  salePrice: number;
  quantity: number;
  max: number;
};

type StockApi = {
  warehouse: { id: string; name: string } | null;
  items: Array<{
    productId: string;
    quantity: unknown;
    product: {
      id: string;
      name: string;
      salePrice: unknown;
      brand?: { name: string } | null;
      category?: { name: string } | null;
      unit?: { symbol: string } | null;
    };
  }>;
};

export function OwnerDirectPosClient({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const { t, formatMoney, formatDateTime } = useI18n();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cart, setCart] = useState<Line[]>([]);
  const [payment, setPayment] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    Array<{ id: string; time: string; total: number; items: string }>
  >([]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/warehouse/stock");
    const data = (await res.json()) as StockApi & { error?: string };
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      setLoading(false);
      return;
    }
    const items: CatalogItem[] = (data.items ?? []).map((b) => ({
      productId: b.productId,
      name: b.product.name,
      brand: b.product.brand?.name ?? "—",
      category: b.product.category?.name ?? "—",
      unit: b.product.unit?.symbol ?? "",
      salePrice: decimalToNumber(b.product.salePrice as never),
      quantity: decimalToNumber(b.quantity as never),
    }));
    setCatalog(items);
    setError("");
    setLoading(false);
  }, [t]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    fetch(`/api/sales?storeId=${storeId}&limit=20`)
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d)) return;
        setHistory(
          d.map(
            (s: {
              id: string;
              createdAt: string;
              total: unknown;
              items: Array<{ quantity: unknown; product: { name: string } }>;
            }) => ({
              id: s.id,
              time: formatDateTime(s.createdAt),
              total: decimalToNumber(s.total as never),
              items: s.items
                .map(
                  (i) =>
                    `${i.product.name} × ${decimalToNumber(i.quantity as never)}`
                )
                .join(", "),
            })
          )
        );
      })
      .catch(() => undefined);
  }, [storeId, formatDateTime]);

  const categories = useMemo(() => {
    const set = new Set(catalog.map((p) => p.category));
    return ["", ...Array.from(set)];
  }, [catalog]);

  const items = useMemo(() => {
    return catalog.filter((p) => {
      const matchCat = !category || p.category === category;
      const matchQ =
        !q.trim() ||
        `${p.name} ${p.brand} ${p.category}`
          .toLowerCase()
          .includes(q.toLowerCase());
      return matchCat && matchQ && p.quantity > 0;
    });
  }, [q, category, catalog]);

  const total = cart.reduce((s, l) => s + l.salePrice * l.quantity, 0);

  function add(p: CatalogItem) {
    if (p.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.productId
            ? { ...l, quantity: Math.min(l.max, l.quantity + 1) }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: p.productId,
          name: p.name,
          unit: p.unit,
          salePrice: p.salePrice,
          quantity: 1,
          max: p.quantity,
        },
      ];
    });
  }

  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: Math.max(0, Math.min(l.max, quantity)) }
            : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  async function checkout() {
    if (cart.length === 0 || checkoutBusy) return;
    setCheckoutBusy(true);
    setError("");
    setMsg("");
    const res = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        paymentMethod: payment,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
      }),
    });
    const data = await res.json();
    setCheckoutBusy(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "pos.saleError"));
      return;
    }
    const saleTotal = decimalToNumber(data.total as never);
    setHistory((prev) => [
      {
        id: data.id,
        time: formatDateTime(new Date().toISOString()),
        total: saleTotal,
        items: cart.map((l) => `${l.name} × ${l.quantity}`).join(", "),
      },
      ...prev,
    ]);
    setCart([]);
    setMsg(t("pos.saleDone"));
    toast(t("pos.saleDone"));
    await loadCatalog();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("pos.ownerDirectTitle")}
        subtitle={t("pos.ownerDirectSubtitle", {
          store: t("nav.storesOwnerDirect"),
        })}
        actions={
          <Link
            href={`/stores/${storeId}`}
            className="text-sm font-semibold text-brand hover:underline"
          >
            {t("pos.backToChannel")}
          </Link>
        }
      />

      {msg ? (
        <Card className="border-success/20 bg-success/5 p-3 text-sm text-success">
          {msg}
        </Card>
      ) : null}
      {error ? (
        <Card className="border-danger/20 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("pos.searchPlaceholder")}
            className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none ring-brand focus:ring-2"
          />
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c || "__all__"}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium",
                  category === c
                    ? "bg-brand text-white"
                    : "bg-card text-muted ring-1 ring-border"
                )}
              >
                {c ? c : t("pos.allCategories")}
              </button>
            ))}
          </div>
          {loading ? (
            <Card className="p-6 text-sm text-muted">{t("common.loading")}</Card>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  onClick={() => add(p)}
                  className="rounded-[18px] border border-border bg-card p-4 text-left transition hover:border-brand/40"
                >
                  <div className="text-xs text-muted">
                    {p.brand} · {p.category}
                  </div>
                  <div className="mt-1 font-semibold text-ink">{p.name}</div>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="text-sm text-muted">
                      {t("pos.warehouseStock", {
                        qty: p.quantity,
                        unit: p.unit,
                      })}
                    </span>
                    <span className="font-bold text-ink">
                      {formatMoney(p.salePrice)}/{p.unit}
                    </span>
                  </div>
                </button>
              ))}
              {items.length === 0 ? (
                <Card className="col-span-full p-6 text-center text-sm text-muted">
                  {t("pos.cartEmpty")}
                </Card>
              ) : null}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Card className="p-4">
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              {t("pos.cart")}
            </div>
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                {t("pos.cartEmpty")}
              </p>
            ) : (
              <div className="space-y-3">
                {cart.map((l) => (
                  <div
                    key={l.productId}
                    className="flex items-center justify-between gap-2 border-b border-border pb-3 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink">
                        {l.name}
                      </div>
                      <div className="text-xs text-muted">
                        {formatMoney(l.salePrice)} / {l.unit}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg border border-border"
                        onClick={() => setQty(l.productId, l.quantity - 1)}
                      >
                        −
                      </button>
                      <span className="w-8 text-center tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        className="h-8 w-8 rounded-lg border border-border"
                        onClick={() => setQty(l.productId, l.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  {(["CASH", "CARD", "TRANSFER"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPayment(m)}
                      className={cn(
                        "flex-1 rounded-xl py-2 text-xs font-semibold",
                        payment === m
                          ? "bg-brand text-white"
                          : "bg-page text-muted ring-1 ring-border"
                      )}
                    >
                      {m === "CASH"
                        ? t("pos.cash")
                        : m === "CARD"
                          ? t("pos.card")
                          : t("pos.transfer")}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-muted">{t("pos.total")}</span>
                  <span className="text-xl font-bold text-ink">
                    {formatMoney(total)}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={checkout}
                  disabled={checkoutBusy}
                >
                  {checkoutBusy ? t("common.loading") : t("pos.checkout")}
                </Button>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
              {t("pos.sessionHistory")}
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted">{t("pos.sessionEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="rounded-xl bg-page px-3 py-2 text-sm">
                    <div className="font-semibold text-ink">
                      {formatMoney(h.total)}
                    </div>
                    <div className="text-xs text-muted">
                      {h.time} · {h.items}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
