"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type StockItem = {
  productId: string;
  quantity: string;
  product: {
    id: string;
    name: string;
    accountingType: string;
    unit?: { symbol: string } | null;
  };
};

type Store = { id: string; name: string };
type Warehouse = { id: string; name: string };

type CartLine = { productId: string; name: string; quantity: number; max: number };

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
          quantity: 1,
          max,
        },
      ]);
    }
  }

  function setQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((c) =>
          c.productId === productId
            ? { ...c, quantity: Math.max(0, Math.min(quantity, c.max)) }
            : c
        )
        .filter((c) => c.quantity > 0)
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromWarehouseId: warehouseId,
        toStoreId: storeId,
        items: cart.map((c) => ({
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
      <form onSubmit={submit} className="max-w-2xl space-y-1">
        <SectionTitle>{t("dashboard.stockOnHand")}</SectionTitle>
        <Card>
          {stock.length === 0 ? (
            <div className="py-4 text-center text-text-dim">{t("wh.warehouseEmpty")}</div>
          ) : (
            stock.map((s) => (
              <div
                key={s.productId}
                className="flex items-center gap-3 border-b border-line py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{s.product.name}</div>
                  <div className="text-xs text-text-dim">
                    {t("wh.colQty")} {Number(s.quantity)}
                    {s.product.unit?.symbol ?? ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(s)}
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-gold text-lg font-bold text-[#1a1206]"
                >
                  +
                </button>
              </div>
            ))
          )}
        </Card>

        <SectionTitle>{t("pos.cart")}</SectionTitle>
        <Card>
          {cart.length === 0 ? (
            <div className="py-4 text-center text-text-dim">{t("pos.cartEmpty")}</div>
          ) : (
            cart.map((c) => (
              <div key={c.productId} className="mb-3 last:mb-0">
                <div className="mb-1 font-semibold">{c.name}</div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-[9px] border border-line bg-surface2"
                    onClick={() => setQty(c.productId, c.quantity - 1)}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    className="w-24 text-center"
                    value={c.quantity}
                    min={0.001}
                    max={c.max}
                    step="0.001"
                    onChange={(e) => setQty(c.productId, Number(e.target.value))}
                  />
                  <button
                    type="button"
                    className="h-9 w-9 rounded-[9px] border border-line bg-surface2"
                    onClick={() => setQty(c.productId, c.quantity + 1)}
                  >
                    +
                  </button>
                  <span className="text-xs text-text-dim">
                    {t("wh.colQty")} {c.max}
                  </span>
                </div>
              </div>
            ))
          )}
        </Card>

        <div className="mb-3">
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

        <div className="mb-4">
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
        <Button type="submit" disabled={loading || cart.length === 0}>
          {loading ? t("common.loading") : t("wh.transferNew")}
        </Button>
      </form>
    </>
  );
}
