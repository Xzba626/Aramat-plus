"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";

type CatalogHit = {
  id: string;
  name: string;
  accountingType: "PIECE" | "WEIGHT" | string;
  salePrice: number | string;
  warehouseQty: number;
  brand?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
  unit?: { symbol: string } | null;
};

type SimilarHit = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  accountingType: string;
  salePrice: number;
};

type BrandOpt = { id: string; name: string };
type CategoryOpt = { id: string; name: string };

type Props = {
  storeId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
};

type Step = "search" | "existing" | "create" | "success";

export function InitialStoreStockModal({
  storeId,
  open,
  onClose,
  onDone,
}: Props) {
  const { t, formatMoney } = useI18n();
  const [step, setStep] = useState<Step>("search");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CatalogHit | null>(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{
    name: string;
    quantity: number;
    unit: string;
  } | null>(null);

  const [brands, setBrands] = useState<BrandOpt[]>([]);
  const [categories, setCategories] = useState<CategoryOpt[]>([]);
  const [newName, setNewName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountingType, setAccountingType] = useState<"PIECE" | "WEIGHT">(
    "PIECE"
  );
  const [salePrice, setSalePrice] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [similar, setSimilar] = useState<SimilarHit[]>([]);
  const [forceCreate, setForceCreate] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("search");
    setQ("");
    setHits([]);
    setSelected(null);
    setQty("");
    setError("");
    setSuccess(null);
    setNewName("");
    setBrandId("");
    setCategoryId("");
    setAccountingType("PIECE");
    setSalePrice("");
    setCostPerUnit("");
    setSimilar([]);
    setForceCreate(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]).then(([b, c]) => {
      if (Array.isArray(b)) setBrands(b.map((x: BrandOpt) => ({ id: x.id, name: x.name })));
      if (Array.isArray(c))
        setCategories(c.map((x: CategoryOpt) => ({ id: x.id, name: x.name })));
    });
  }, [open]);

  useEffect(() => {
    if (!open || step !== "search") return;
    const term = q.trim();
    if (term.length < 1) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(
        `/api/products?q=${encodeURIComponent(term)}&kind=STANDARD&status=active`
      );
      const data = await res.json();
      setSearching(false);
      if (res.ok && Array.isArray(data)) {
        setHits(
          data.slice(0, 12).map((p: CatalogHit) => ({
            ...p,
            warehouseQty: Number(p.warehouseQty ?? 0),
            salePrice: Number(p.salePrice),
          }))
        );
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, open, step]);

  if (!open) return null;

  function unitOf(p: { accountingType?: string; unit?: { symbol: string } | null }) {
    return (
      p.unit?.symbol ||
      (p.accountingType === "WEIGHT" ? t("warehouse.unitMl") : t("warehouse.unitPcs"))
    );
  }

  function accountingLabel(v: string) {
    return v === "WEIGHT" ? t("warehouse.unitMl") : t("warehouse.unitPcs");
  }

  function pickExisting(p: CatalogHit) {
    setSelected(p);
    setQty("");
    setError("");
    setStep("existing");
  }

  function goCreate() {
    setNewName(q.trim());
    setError("");
    setSimilar([]);
    setForceCreate(false);
    setStep("create");
  }

  async function submitExisting(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const quantity = Number(qty);
    if (!(quantity > 0)) {
      setError(t("storeDetail.initialStockQtyInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/stores/${storeId}/initial-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: selected.id, quantity }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(
        data.error === "INSUFFICIENT_STOCK"
          ? t("storeDetail.initialStockInsufficient")
          : apiErrorMessage(data.error, t)
      );
      return;
    }
    setSuccess({
      name: selected.name,
      quantity,
      unit: unitOf(selected),
    });
    setStep("success");
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    const price = Number(salePrice);
    const cost = Number(costPerUnit);
    if (!(quantity > 0) || !(price > 0) || !(cost > 0) || !newName.trim()) {
      setError(t("storeDetail.initialStockCreateInvalid"));
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/stores/${storeId}/initial-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity,
        forceCreate: forceCreate || undefined,
        newProduct: {
          name: newName.trim(),
          brandId: brandId || null,
          categoryId: categoryId || null,
          accountingType,
          salePrice: price,
          costPerUnit: cost,
        },
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      if (data.error === "PRODUCT_SIMILAR" && Array.isArray(data.similar)) {
        setSimilar(data.similar);
        setError(t("storeDetail.initialStockSimilarHint"));
        return;
      }
      setError(
        data.error === "INSUFFICIENT_STOCK"
          ? t("storeDetail.initialStockInsufficient")
          : apiErrorMessage(data.error, t)
      );
      return;
    }
    setSuccess({
      name: newName.trim(),
      quantity,
      unit: accountingType === "WEIGHT" ? t("warehouse.unitMl") : t("warehouse.unitPcs"),
    });
    setStep("success");
  }

  function finish() {
    onDone();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("storeDetail.initialStockTitle")}
    >
      <Card className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl p-0 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-ink">
              {t("storeDetail.initialStockTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {t("storeDetail.initialStockHint")}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy}
            onClick={onClose}
          >
            {t("common.close")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {step === "search" ? (
            <div className="space-y-3">
              <div>
                <FieldLabel>{t("storeDetail.initialStockSearch")}</FieldLabel>
                <input
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("pos.searchPlaceholder")}
                  autoFocus
                />
              </div>
              {searching ? (
                <p className="text-sm text-muted">{t("common.loading")}</p>
              ) : null}
              <ul className="space-y-1.5">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-border px-3 py-2 text-left hover:border-brand/40"
                      onClick={() => pickExisting(p)}
                    >
                      <div className="text-sm font-semibold text-ink">
                        {p.name} ·{" "}
                        {p.accountingType === "WEIGHT"
                          ? t("warehouse.unitMl")
                          : t("warehouse.unitPcs")}
                      </div>
                      <div className="text-xs text-muted">
                        {p.brand?.name ?? "—"} ·{" "}
                        {t("storeDetail.initialStockWhQty")}: {p.warehouseQty}{" "}
                        {unitOf(p)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {q.trim() && !searching && hits.length === 0 ? (
                <p className="text-sm text-muted">
                  {t("storeDetail.initialStockNotFound")}
                </p>
              ) : null}
              <Button type="button" variant="secondary" onClick={goCreate}>
                {t("storeDetail.initialStockCreateNew")}
              </Button>
            </div>
          ) : null}

          {step === "existing" && selected ? (
            <form onSubmit={submitExisting} className="space-y-3">
              <div className="rounded-xl bg-page px-3 py-2 text-sm">
                <div className="text-xs text-muted">
                  {t("storeDetail.initialStockProduct")}
                </div>
                <div className="font-semibold text-ink">{selected.name}</div>
                <div className="mt-1 space-y-0.5 text-xs text-muted">
                  <div>
                    {t("storeDetail.initialStockBrand")}:{" "}
                    {selected.brand?.name ?? "—"}
                  </div>
                  <div>
                    {t("storeDetail.initialStockAccounting")}:{" "}
                    {accountingLabel(selected.accountingType)}
                  </div>
                  <div>
                    {t("storeDetail.initialStockWhQty")}: {selected.warehouseQty}{" "}
                    {unitOf(selected)}
                  </div>
                  <div>
                    {t("storeDetail.initialStockSalePrice")}:{" "}
                    {formatMoney(Number(selected.salePrice))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted">
                {t("storeDetail.initialStockPricesLocked")}
              </p>
              <div>
                <FieldLabel>
                  {t("storeDetail.initialStockQty")} ({unitOf(selected)})
                </FieldLabel>
                <input
                  type="number"
                  min={selected.accountingType === "WEIGHT" ? 0.001 : 1}
                  step={selected.accountingType === "WEIGHT" ? "0.001" : "1"}
                  required
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} fullWidth={false}>
                  {busy ? t("common.loading") : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => setStep("search")}
                >
                  {t("common.back")}
                </Button>
              </div>
            </form>
          ) : null}

          {step === "create" ? (
            <form onSubmit={submitCreate} className="space-y-3">
              <p className="text-xs text-muted">
                {t("storeDetail.initialStockCreateHint")}
              </p>
              {similar.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
                  <p className="text-sm font-semibold text-ink">
                    {t("storeDetail.initialStockSimilarHint")}
                  </p>
                  <ul className="space-y-1">
                    {similar.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted">
                          {s.name}
                          {s.brand ? ` · ${s.brand}` : ""}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth={false}
                          onClick={async () => {
                            const res = await fetch(
                              `/api/products?q=${encodeURIComponent(s.name)}&kind=STANDARD&status=active`
                            );
                            const data = await res.json();
                            const hit = Array.isArray(data)
                              ? data.find((p: CatalogHit) => p.id === s.id) ??
                                data[0]
                              : null;
                            if (hit) {
                              pickExisting({
                                ...hit,
                                warehouseQty: Number(hit.warehouseQty ?? 0),
                                salePrice: Number(hit.salePrice),
                              });
                            } else {
                              pickExisting({
                                id: s.id,
                                name: s.name,
                                accountingType: s.accountingType,
                                salePrice: s.salePrice,
                                warehouseQty: 0,
                                brand: s.brand
                                  ? { id: "", name: s.brand }
                                  : null,
                                category: s.category
                                  ? { id: "", name: s.category }
                                  : null,
                                unit: null,
                              });
                            }
                          }}
                        >
                          {t("storeDetail.initialStockUseExisting")}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setForceCreate(true);
                      setSimilar([]);
                      setError("");
                    }}
                  >
                    {t("storeDetail.initialStockForceCreate")}
                  </Button>
                </div>
              ) : null}
              <div>
                <FieldLabel>{t("storeDetail.initialStockProduct")}</FieldLabel>
                <input
                  required
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setForceCreate(false);
                    setSimilar([]);
                  }}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t("storeDetail.initialStockBrand")}</FieldLabel>
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>{t("wh.categoriesTitle")}</FieldLabel>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>{t("storeDetail.initialStockAccounting")}</FieldLabel>
                <div className="mt-1.5 flex gap-2">
                  {(["PIECE", "WEIGHT"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAccountingType(v)}
                      className={cn(
                        "flex-1 rounded-xl py-2 text-xs font-semibold",
                        accountingType === v
                          ? "bg-brand text-white"
                          : "bg-card text-muted ring-1 ring-border"
                      )}
                    >
                      {accountingLabel(v)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t("storeDetail.initialStockSalePrice")}</FieldLabel>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <FieldLabel>{t("storeDetail.initialStockCost")}</FieldLabel>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    required
                    value={costPerUnit}
                    onChange={(e) => setCostPerUnit(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>
                  {t("storeDetail.initialStockQty")} (
                  {accountingType === "WEIGHT"
                    ? t("warehouse.unitMl")
                    : t("warehouse.unitPcs")}
                  )
                </FieldLabel>
                <input
                  type="number"
                  min={accountingType === "WEIGHT" ? 0.001 : 1}
                  step={accountingType === "WEIGHT" ? "0.001" : "1"}
                  required
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} fullWidth={false}>
                  {busy ? t("common.loading") : t("common.save")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  disabled={busy}
                  onClick={() => setStep("search")}
                >
                  {t("common.back")}
                </Button>
              </div>
            </form>
          ) : null}

          {step === "success" && success ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-success/10 px-3 py-3 text-sm">
                <div className="text-xs text-muted">
                  {t("storeDetail.initialStockProduct")}
                </div>
                <div className="font-semibold text-ink">{success.name}</div>
                <div className="mt-2 text-ink">
                  {t("storeDetail.initialStockAdded")}: {success.quantity}{" "}
                  {success.unit}
                </div>
                <div className="mt-1 text-xs text-muted">
                  {t("storeDetail.initialStockSource")}:{" "}
                  {t("warehouse.notesInitialStoreStock")}
                </div>
              </div>
              <Button type="button" onClick={finish}>
                {t("common.close")}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
