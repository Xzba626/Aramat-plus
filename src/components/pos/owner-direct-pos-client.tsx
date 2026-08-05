"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { cn, decimalToNumber } from "@/lib/utils";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { useToast } from "@/components/ui/toast";
import { ProductCard } from "@/components/products/product-card";
import { QtyInput } from "@/components/ui/qty-input";
import { resolveProductImageUrl } from "@/lib/product-image";

type CatalogItem = {
  productId: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  salePrice: number;
  quantity: number;
  accountingType: "PIECE" | "WEIGHT";
  imageUrl?: string | null;
  stockStatus?: "OK" | "LOW" | "OUT";
};

type BottleOption = {
  packagingSkuId: string | null;
  packagingProductId: string;
  name: string;
  volumeMl: number | null;
};

type Line = {
  productId: string;
  name: string;
  unit: string;
  salePrice: number;
  quantity: number;
  max: number;
  accountingType: "PIECE" | "WEIGHT";
  containerSource?: "STORE_BOTTLE" | "CUSTOMER_BOTTLE" | null;
  packagingProductId?: string | null;
  packagingSkuId?: string | null;
  packagingName?: string | null;
};

type StockApi = {
  warehouse: { id: string; name: string } | null;
  items: Array<{
    productId: string;
    quantity: unknown;
    product: {
      id: string;
      name: string;
      imageUrl?: string | null;
      salePrice: unknown;
      accountingType?: "PIECE" | "WEIGHT";
      brand?: { name: string; imageUrl?: string | null } | null;
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

  const [weightPick, setWeightPick] = useState<CatalogItem | null>(null);
  const [weightQty, setWeightQty] = useState("10");
  const [containerSource, setContainerSource] = useState<
    "STORE_BOTTLE" | "CUSTOMER_BOTTLE"
  >("STORE_BOTTLE");
  const [bottleId, setBottleId] = useState("");
  const [bottles, setBottles] = useState<BottleOption[]>([]);
  const [bottlesLoading, setBottlesLoading] = useState(false);
  const [bottlesFetched, setBottlesFetched] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/warehouse/stock?forPos=1");
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
      accountingType: b.product.accountingType === "WEIGHT" ? "WEIGHT" : "PIECE",
      imageUrl: resolveProductImageUrl(b.product),
      stockStatus:
        (b as { stockStatus?: "OK" | "LOW" | "OUT" }).stockStatus ??
        (decimalToNumber(b.quantity as never) <= 0 ? "OUT" : "OK"),
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
      return matchCat && matchQ;
    });
  }, [q, category, catalog]);

  const total = cart.reduce(
    (s, l) => s + (l.quantity > 0 ? l.salePrice * l.quantity : 0),
    0
  );
  const missingBottle = cart.some(
    (l) =>
      l.quantity > 0 &&
      l.accountingType === "WEIGHT" &&
      (!l.containerSource ||
        (l.containerSource === "STORE_BOTTLE" && !l.packagingProductId))
  );

  async function openWeightModal(p: CatalogItem) {
    setWeightPick(p);
    setWeightQty("10");
    setContainerSource("STORE_BOTTLE");
    setBottleId("");
    setError("");
    setBottlesLoading(true);
    const res = await fetch(
      `/api/pos/packaging-bottles?storeId=${encodeURIComponent(storeId)}`
    );
    const data = await res.json();
    setBottlesLoading(false);
    setBottlesFetched(true);
    if (res.ok && Array.isArray(data)) {
      setBottles(data);
      if (data.length === 1) setBottleId(data[0].packagingProductId);
    } else {
      setBottles([]);
    }
  }

  function addPiece(p: CatalogItem) {
    if (p.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.productId === p.productId && l.accountingType === "PIECE"
      );
      if (existing) {
        return prev.map((l) =>
          l.productId === p.productId && l.accountingType === "PIECE"
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
          accountingType: "PIECE" as const,
        },
      ];
    });
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
    if (containerSource === "STORE_BOTTLE") {
      const bottle = bottles.find((b) => b.packagingProductId === bottleId);
      if (!bottle) {
        setError(t("pos.bottleRequired"));
        return;
      }
      setCart((prev) => [
        ...prev,
        {
          productId: weightPick.productId,
          name: weightPick.name,
          unit: weightPick.unit || t("units.ml"),
          salePrice: weightPick.salePrice,
          quantity: qty,
          max: weightPick.quantity,
          accountingType: "WEIGHT",
          containerSource: "STORE_BOTTLE",
          packagingProductId: bottle.packagingProductId,
          packagingSkuId: bottle.packagingSkuId,
          packagingName: bottle.name,
        },
      ]);
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: weightPick.productId,
          name: weightPick.name,
          unit: weightPick.unit || t("units.ml"),
          salePrice: weightPick.salePrice,
          quantity: qty,
          max: weightPick.quantity,
          accountingType: "WEIGHT",
          containerSource: "CUSTOMER_BOTTLE",
          packagingProductId: null,
          packagingSkuId: null,
          packagingName: t("pos.containerCustomer"),
        },
      ]);
    }
    setWeightPick(null);
    setError("");
  }

  function onCardClick(p: CatalogItem) {
    if (p.quantity <= 0) return;
    if (p.accountingType === "WEIGHT") {
      void openWeightModal(p);
      return;
    }
    addPiece(p);
  }

  /** Update qty — never removes the line (use removeFromCart). */
  function setQty(index: number, quantity: number) {
    setCart((prev) =>
      prev.map((l, i) =>
        i === index
          ? { ...l, quantity: Math.max(0, Math.min(l.max, quantity)) }
          : l
      )
    );
  }

  function removeFromCart(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function setLinePackaging(
    index: number,
    packaging: {
      packagingProductId: string;
      packagingSkuId: string | null;
      packagingName: string;
    }
  ) {
    setCart((prev) =>
      prev.map((l, i) =>
        i === index
          ? { ...l, containerSource: "STORE_BOTTLE" as const, ...packaging }
          : l
      )
    );
  }

  function setLineContainerSource(
    index: number,
    source: "STORE_BOTTLE" | "CUSTOMER_BOTTLE"
  ) {
    setCart((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        if (source === "CUSTOMER_BOTTLE") {
          return {
            ...l,
            containerSource: source,
            packagingProductId: null,
            packagingSkuId: null,
            packagingName: t("pos.containerCustomer"),
          };
        }
        return { ...l, containerSource: source };
      })
    );
  }

  /** Keep bottle options available for in-cart edits (WEIGHT lines). */
  useEffect(() => {
    const hasWeight = cart.some((l) => l.accountingType === "WEIGHT");
    if (!hasWeight || bottlesFetched || bottlesLoading) return;
    let cancelled = false;
    setBottlesLoading(true);
    fetch(`/api/pos/packaging-bottles?storeId=${encodeURIComponent(storeId)}`)
      .then(async (res) => {
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && Array.isArray(data)) setBottles(data);
        setBottlesFetched(true);
      })
      .catch(() => {
        if (!cancelled) setBottlesFetched(true);
      })
      .finally(() => {
        if (!cancelled) setBottlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cart, bottlesFetched, bottlesLoading, storeId]);

  async function checkout() {
    const items = cart.filter((l) => l.quantity > 0);
    if (items.length === 0 || checkoutBusy) return;
    if (
      items.some(
        (l) =>
          l.accountingType === "WEIGHT" &&
          (!l.containerSource ||
            (l.containerSource === "STORE_BOTTLE" && !l.packagingProductId))
      )
    ) {
      setError(t("pos.bottleRequired"));
      return;
    }
    setCheckoutBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          paymentMethod: payment,
          items: items.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            ...(l.accountingType === "WEIGHT"
              ? {
                  containerSource: l.containerSource ?? "STORE_BOTTLE",
                  ...(l.containerSource !== "CUSTOMER_BOTTLE" &&
                  l.packagingProductId
                    ? {
                        packagingProductId: l.packagingProductId,
                        ...(l.packagingSkuId
                          ? { packagingSkuId: l.packagingSkuId }
                          : {}),
                      }
                    : {}),
                }
              : {}),
          })),
        }),
      });
      const data = await res.json();
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
          items: items
            .map(
              (l) =>
                `${l.name} × ${l.quantity}${
                  l.packagingName ? ` (${l.packagingName})` : ""
                }`
            )
            .join(", "),
        },
        ...prev,
      ]);
      setCart([]);
      setMsg(t("pos.saleDone"));
      toast(t("pos.saleDone"));
      await loadCatalog();
    } catch {
      setError(t("pos.saleError"));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function reserveCart() {
    const items = cart.filter((l) => l.quantity > 0);
    if (items.length === 0 || checkoutBusy) return;
    setCheckoutBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          ttlMinutes: 30,
          items: items.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t, "pos.reserveError"));
        return;
      }
      setCart([]);
      setMsg(t("pos.reserveDone"));
      toast(t("pos.reserveDone"));
      await loadCatalog();
    } catch {
      setError(t("pos.reserveError"));
    } finally {
      setCheckoutBusy(false);
    }
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
      {error && !weightPick ? (
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
                <ProductCard
                  key={p.productId}
                  mode="pos"
                  asButton
                  disabled={p.quantity <= 0}
                  quantity={p.quantity}
                  showExactStock
                  stockStatus={p.stockStatus}
                  onClick={() => onCardClick(p)}
                  product={{
                    id: p.productId,
                    name: p.name,
                    imageUrl: p.imageUrl,
                    brand: { name: p.brand },
                    category: { name: p.category },
                    unit: { symbol: p.unit },
                    accountingType: p.accountingType,
                    salePrice: p.salePrice,
                  }}
                />
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
                {cart.map((l, idx) => {
                  const isPiece = l.accountingType !== "WEIGHT";
                  return (
                  <div
                    key={`${l.productId}-${idx}`}
                    className="relative space-y-2 border-b border-border pb-3 last:border-0"
                  >
                    <button
                      type="button"
                      className="absolute right-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-muted hover:bg-danger/10 hover:text-danger"
                      onClick={() => removeFromCart(idx)}
                      aria-label={t("pos.remove")}
                      title={t("pos.remove")}
                    >
                      ✕
                    </button>
                    <div className="pr-8">
                      <div className="text-sm font-semibold text-ink">
                        {l.name}
                      </div>
                      <div className="text-xs text-muted">
                        {formatMoney(l.salePrice)} / {l.unit}
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-ink">
                        {t("pos.stockAvailable", {
                          qty: Math.round(l.max * 1000) / 1000,
                          unit:
                            l.unit ||
                            (l.accountingType === "WEIGHT"
                              ? t("warehouse.unitMl")
                              : t("warehouse.unitPcs")),
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <QtyInput
                        value={l.quantity}
                        max={l.max}
                        min={isPiece ? 1 : 0.001}
                        integer={isPiece}
                        onChange={(n) => setQty(idx, n)}
                        buttonClassName="h-8 w-8 rounded-lg border-border bg-card"
                        inputClassName="w-16 border-border bg-card py-1"
                        aria-label={t("pos.qtyMl")}
                      />
                    </div>
                    {l.accountingType === "WEIGHT" ? (
                      <div className="space-y-2">
                        <div>
                          <FieldLabel>{t("pos.containerSource")}</FieldLabel>
                          <div className="mt-1.5 flex gap-2">
                            {(
                              [
                                ["STORE_BOTTLE", "pos.containerStore"],
                                ["CUSTOMER_BOTTLE", "pos.containerCustomer"],
                              ] as const
                            ).map(([value, labelKey]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() =>
                                  setLineContainerSource(idx, value)
                                }
                                className={cn(
                                  "flex-1 rounded-xl py-2 text-xs font-semibold",
                                  (l.containerSource ?? "STORE_BOTTLE") ===
                                    value
                                    ? "bg-brand text-white"
                                    : "bg-card text-muted ring-1 ring-border"
                                )}
                              >
                                {t(labelKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                        {(l.containerSource ?? "STORE_BOTTLE") ===
                        "STORE_BOTTLE" ? (
                          <div>
                            <FieldLabel>{t("pos.selectBottle")}</FieldLabel>
                            {l.packagingName ? (
                              <div className="mt-1 text-xs leading-relaxed text-muted">
                                {l.packagingName}
                              </div>
                            ) : (
                              <p className="mt-1 text-xs text-danger">
                                {t("pos.bottleRequired")}
                              </p>
                            )}
                            {bottlesLoading ? (
                              <p className="mt-1.5 text-xs text-muted">
                                {t("common.loading")}
                              </p>
                            ) : bottles.length === 0 ? (
                              <p className="mt-1.5 text-xs text-danger">
                                {t("pos.noBottlesInStore")}
                              </p>
                            ) : (
                              <select
                                className="mt-1.5 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                                value={l.packagingProductId ?? ""}
                                onChange={(e) => {
                                  const opt = bottles.find(
                                    (b) =>
                                      b.packagingProductId === e.target.value
                                  );
                                  if (opt) {
                                    setLinePackaging(idx, {
                                      packagingProductId:
                                        opt.packagingProductId,
                                      packagingSkuId: opt.packagingSkuId,
                                      packagingName: opt.name,
                                    });
                                  }
                                }}
                              >
                                <option value="">
                                  {t("pos.bottlePlaceholder")}
                                </option>
                                {bottles.map((b) => (
                                  <option
                                    key={b.packagingProductId}
                                    value={b.packagingProductId}
                                  >
                                    {b.name}
                                    {b.volumeMl != null
                                      ? ` · ${b.volumeMl} ${t("units.ml")}`
                                      : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted">
                            {t("pos.containerCustomerHint")}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                  );
                })}
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
                  disabled={
                    checkoutBusy ||
                    missingBottle ||
                    cart.every((l) => l.quantity <= 0)
                  }
                >
                  {checkoutBusy ? t("common.loading") : t("pos.checkout")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={reserveCart}
                  disabled={checkoutBusy}
                >
                  {t("pos.reserve")}
                </Button>
                <p className="text-xs text-muted">{t("pos.reserveHint")}</p>
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

      {weightPick ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Card className="w-full max-w-md space-y-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-ink">{weightPick.name}</h2>
                <p className="text-sm font-medium text-ink">
                  {t("pos.stockAvailable", {
                    qty: Math.round(weightPick.quantity * 1000) / 1000,
                    unit:
                      weightPick.unit || t("warehouse.unitMl"),
                  })}
                </p>
                <p className="text-sm text-muted">{t("pos.weightAddHint")}</p>
              </div>
              <button
                type="button"
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
              <FieldLabel>{t("pos.containerSource")}</FieldLabel>
              <div className="mt-1.5 flex gap-2">
                {(
                  [
                    ["STORE_BOTTLE", "pos.containerStore"],
                    ["CUSTOMER_BOTTLE", "pos.containerCustomer"],
                  ] as const
                ).map(([value, labelKey]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setContainerSource(value)}
                    className={cn(
                      "flex-1 rounded-xl py-2 text-xs font-semibold",
                      containerSource === value
                        ? "bg-brand text-white"
                        : "bg-card text-muted ring-1 ring-border"
                    )}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            </div>
            {containerSource === "STORE_BOTTLE" ? (
              <div>
                <FieldLabel>{t("pos.selectBottle")}</FieldLabel>
                {bottlesLoading ? (
                  <p className="mt-1 text-xs text-muted">{t("common.loading")}</p>
                ) : bottles.length === 0 ? (
                  <p className="mt-1 text-xs text-danger">
                    {t("pos.noBottlesInStore")}
                  </p>
                ) : (
                  <select
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                    value={bottleId}
                    onChange={(e) => setBottleId(e.target.value)}
                  >
                    <option value="">{t("pos.bottlePlaceholder")}</option>
                    {bottles.map((b) => (
                      <option
                        key={b.packagingProductId}
                        value={b.packagingProductId}
                      >
                        {b.name}
                        {b.volumeMl != null
                          ? ` · ${b.volumeMl} ${t("units.ml")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted">{t("pos.containerCustomerHint")}</p>
            )}
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <Button
              type="button"
              className="w-full"
              onClick={confirmWeightAdd}
              disabled={
                containerSource === "STORE_BOTTLE" &&
                (bottlesLoading || bottles.length === 0)
              }
            >
              {t("pos.addToCart")}
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
