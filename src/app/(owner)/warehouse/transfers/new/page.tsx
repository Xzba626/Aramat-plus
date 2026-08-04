"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { QtyInput } from "@/components/ui/qty-input";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { ProductCard } from "@/components/products/product-card";
import { ProductThumb } from "@/components/products/product-thumb";
import { resolveProductImageUrl } from "@/lib/product-image";

type StockItem = {
  productId: string;
  quantity: string;
  product: {
    id: string;
    name: string;
    imageUrl?: string | null;
    accountingType: string;
    brand?: { name?: string | null; imageUrl?: string | null } | null;
    category?: { name?: string | null } | null;
    productType?: { name?: string | null } | null;
    unit?: { symbol: string } | null;
    salePrice?: number | string | null;
  };
};

type Store = { id: string; name: string };
type Warehouse = { id: string; name: string };

type CartLine = {
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  max: number;
  accountingType: string;
};

export default function NewTransferPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [stock, setStock] = useState<StockItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/warehouse/stock").then((r) => r.json()),
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/warehouses").then((r) => r.json()),
    ]).then(([stockData, storesData, whData]) => {
      if (stockData.items) setStock(stockData.items);
      if (Array.isArray(storesData)) {
        setStores(
          storesData.filter(
            (s: Store & { isActive?: boolean; kind?: string }) =>
              s.isActive !== false && s.kind !== "OWNER_DIRECT"
          )
        );
        const branches = storesData.filter(
          (s: Store & { kind?: string }) => s.kind !== "OWNER_DIRECT"
        );
        if (branches[0]) setStoreId(branches[0].id);
      }
      if (Array.isArray(whData)) {
        setWarehouses(whData);
        if (whData[0]) setWarehouseId(whData[0].id);
      }
    });
  }, []);

  const cartMap = useMemo(() => new Map(cart.map((c) => [c.productId, c])), [cart]);

  function addToCart(item: StockItem) {
    const max = Number(item.quantity);
    const existing = cartMap.get(item.productId);
    const imageUrl = resolveProductImageUrl(item.product);
    const accountingType = item.product.accountingType || "PIECE";
    if (existing) {
      if (existing.quantity >= max) return;
      setCart((prev) =>
        prev.map((c) =>
          c.productId === item.productId
            ? { ...c, quantity: Math.min(c.quantity + 1, max) }
            : c
        )
      );
    } else {
      setCart((prev) => [
        ...prev,
        {
          productId: item.productId,
          name: item.product.name,
          imageUrl,
          quantity: 1,
          max,
          accountingType,
        },
      ]);
    }
  }

  /** Update qty — never removes the line (use removeFromCart). */
  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev.map((c) =>
        c.productId === productId
          ? { ...c, quantity: Math.max(0, Math.min(quantity, c.max)) }
          : c
      )
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const items = cart.filter((c) => c.quantity > 0);
    if (items.length === 0) {
      setError(t("errors.VALIDATION_ERROR"));
      setLoading(false);
      return;
    }
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromWarehouseId: warehouseId,
        toStoreId: storeId,
        items: items.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
        })),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    router.push("/warehouse/transfers");
    router.refresh();
  }

  return (
    <>
      <PageHeader
        title={t("wh.transferNew")}
        subtitle={`${t("wh.centralWarehouse")} → ${t("common.store")}`}
      />
      <form onSubmit={submit} className="space-y-4">
        <SectionTitle>{t("dashboard.stockOnHand")}</SectionTitle>
        {stock.length === 0 ? (
          <Card>
            <div className="py-4 text-center text-text-dim">
              {t("wh.warehouseEmpty")}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stock.map((s) => (
              <ProductCard
                key={s.productId}
                mode="transfer"
                quantity={Number(s.quantity)}
                product={{
                  id: s.product.id,
                  name: s.product.name,
                  imageUrl: s.product.imageUrl,
                  brand: s.product.brand,
                  category: s.product.category,
                  productType: s.product.productType,
                  unit: s.product.unit,
                  accountingType: s.product.accountingType,
                  salePrice: s.product.salePrice,
                }}
                actions={
                  <Button
                    type="button"
                    size="sm"
                    fullWidth={false}
                    onClick={() => addToCart(s)}
                  >
                    +
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <SectionTitle>{t("pos.cart")}</SectionTitle>
        <Card>
          {cart.length === 0 ? (
            <div className="py-4 text-center text-text-dim">{t("pos.cartEmpty")}</div>
          ) : (
            cart.map((c) => {
              const isPiece = c.accountingType !== "WEIGHT";
              return (
                <div
                  key={c.productId}
                  className="relative mb-3 flex items-start gap-3 border-b border-line pb-3 last:mb-0 last:border-0 last:pb-0"
                >
                  <button
                    type="button"
                    className="absolute right-0 top-0 z-10 flex h-8 w-8 items-center justify-center rounded-full text-base leading-none text-muted hover:bg-danger/10 hover:text-danger"
                    onClick={() => removeFromCart(c.productId)}
                    aria-label={t("pos.remove")}
                    title={t("pos.remove")}
                  >
                    ✕
                  </button>
                  <ProductThumb src={c.imageUrl} name={c.name} size="sm" />
                  <div className="min-w-0 flex-1 pr-8">
                    <div className="mb-1 font-semibold">{c.name}</div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <QtyInput
                        value={c.quantity}
                        max={c.max}
                        min={isPiece ? 1 : 0.001}
                        integer={isPiece}
                        onChange={(n) => setQty(c.productId, n)}
                        aria-label={t("wh.colQty")}
                      />
                      <span className="text-xs text-text-dim">
                        {t("wh.colQty")} {c.max}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </Card>

        <div className="mb-3 max-w-2xl">
          <FieldLabel>{t("wh.centralWarehouse")}</FieldLabel>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            required
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 max-w-2xl">
          <FieldLabel>{t("common.store")}</FieldLabel>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)} required>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        <div className="max-w-2xl">
          <Button type="submit" disabled={loading || cart.length === 0}>
            {loading ? t("common.loading") : t("wh.transferNew")}
          </Button>
        </div>
      </form>
    </>
  );
}
