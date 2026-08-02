"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";

type Batch = {
  id: string;
  quantity: string | number;
  costPerUnit: string | number;
  receivedAt: string;
  locationType: string;
  notes?: string | null;
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  salePrice: string | number;
  defaultCostPerUnit?: string | number | null;
  accountingType: string;
  brand?: { name: string } | null;
  unit?: { symbol: string } | null;
  category?: { name: string } | null;
  productType?: { name: string } | null;
  batches: Batch[];
  stockBalances?: Array<{ quantity: string | number; locationType: string }>;
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const { data: session } = useSession();
  const { t, formatMoney, formatDateTime } = useI18n();
  const showCost =
    session?.user?.role === Role.OWNER || session?.user?.role === Role.MANAGER;
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showBatch, setShowBatch] = useState(
    search.get("action") === "stock" || search.get("action") === "batch"
  );
  const [keepPrice, setKeepPrice] = useState(true);
  const [newSalePrice, setNewSalePrice] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  async function onPhotoChange(file: File | null) {
    if (!file || !product) return;
    setPhotoBusy(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const up = await fetch("/api/products/upload", { method: "POST", body: fd });
      const upData = await up.json();
      if (!up.ok) {
        setError(apiErrorMessage(upData.error, t));
        setPhotoBusy(false);
        return;
      }
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: upData.imageUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t));
      } else {
        setProduct((p) => (p ? { ...p, imageUrl: upData.imageUrl } : p));
        setMsg(t("warehouse.productPhotoUploaded"));
      }
    } catch {
      setError(t("common.error"));
    }
    setPhotoBusy(false);
  }

  async function load() {
    const res = await fetch(`/api/products/${id}`);
    const data = await res.json();
    if (res.ok) {
      setProduct(data);
      setNewSalePrice(String(data.salePrice));
    } else {
      setError(apiErrorMessage(data.error, t));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const unit =
    product?.unit?.symbol ??
    (product?.accountingType === "WEIGHT" ? t("units.ml") : t("units.pcs"));

  const warehouseQty = useMemo(() => {
    if (!product) return 0;
    if (product.stockBalances?.length) {
      return product.stockBalances
        .filter((b) => b.locationType === "WAREHOUSE")
        .reduce((s, b) => s + Number(b.quantity), 0);
    }
    return product.batches
      .filter((b) => b.locationType === "WAREHOUSE")
      .reduce((s, b) => s + Number(b.quantity), 0);
  }, [product]);

  const displayCost = useMemo(() => {
    if (!product) return null;
    if (product.defaultCostPerUnit != null && product.defaultCostPerUnit !== "") {
      return Number(product.defaultCostPerUnit);
    }
    const last = [...product.batches]
      .filter((b) => b.locationType === "WAREHOUSE")
      .sort(
        (a, b) =>
          new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
      )[0];
    return last ? Number(last.costPerUnit) : null;
  }, [product]);

  async function addBatch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const costPerUnit = Number(fd.get("costPerUnit"));
    const res = await fetch(`/api/products/${id}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: Number(fd.get("quantity")),
        costPerUnit,
        notes: String(fd.get("notes") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }

    if (!keepPrice && newSalePrice) {
      await fetch(`/api/products/${id}/price`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salePrice: Number(newSalePrice),
          reason: "batch_receive_price_update",
        }),
      });
    }

    setMsg(t("warehouse.productBatchSubmit"));
    e.currentTarget.reset();
    setShowBatch(false);
    load();
    router.refresh();
  }

  if (!product) {
    return (
      <>
        <PageHeader title={t("nav.warehouseCatalog")} />
        <div className="p-6 text-muted">{error || t("common.loading")}</div>
      </>
    );
  }

  const warehouseBatches = product.batches.filter(
    (b) => b.locationType === "WAREHOUSE" && Number(b.quantity) > 0
  );

  const defaultCostPrefill =
    displayCost != null ? String(displayCost) : "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title={product.name} />

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-4">
          <label className="relative block h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border bg-page">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-xs text-muted">
                {t("warehouse.productPhoto")}
              </span>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={photoBusy}
              onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-xs text-muted">
            {photoBusy ? t("warehouse.productPhotoUploading") : t("warehouse.productPhotoUpload")}
          </p>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardSku")}
            </dt>
            <dd className="mt-0.5 font-semibold text-ink">{product.sku || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardBrand")}
            </dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {product.brand?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardType")}
            </dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {product.category?.name ?? product.productType?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardSaleMethod")}
            </dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {product.accountingType === "WEIGHT"
                ? t("warehouse.productSellVolume")
                : t("warehouse.productSellPiece")}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardStock")}
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-lg font-bold tabular-nums",
                warehouseQty <= 0 ? "text-muted" : "text-ink"
              )}
            >
              {warehouseQty <= 0
                ? t("warehouse.productStockZero")
                : `${warehouseQty} ${unit}`}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted">
              {t("warehouse.productCardSale")}
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-zone-money-deep">
              {formatMoney(Number(product.salePrice), { short: true })}
              <span className="ml-1 text-xs font-medium text-muted">
                / {unit}
              </span>
            </dd>
          </div>
          {showCost ? (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted">
                {t("warehouse.productCardCost")}
              </dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {displayCost != null
                  ? `${formatMoney(displayCost, { short: true })} / ${unit}`
                  : "—"}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            type="button"
            fullWidth={false}
            onClick={() => {
              setShowBatch(true);
              setKeepPrice(true);
            }}
          >
            {warehouseQty <= 0
              ? t("warehouse.productAddStock")
              : t("warehouse.productNewBatch")}
          </Button>
          <Link
            href="/warehouse/receive?tab=batch"
            className="inline-flex items-center rounded-xl border border-border bg-page px-4 py-2.5 text-sm font-bold text-ink hover:border-brand/30"
          >
            {t("warehouse.productNewBatch")}
          </Link>
        </div>
      </Card>

      {showBatch ? (
        <Card className="border-brand/20 p-5">
          <SectionTitle>
            {warehouseQty <= 0
              ? t("warehouse.productAddStock")
              : t("warehouse.productNewBatch")}
          </SectionTitle>
          <form onSubmit={addBatch} className="mt-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>
                  {t("warehouse.productBatchQty")} ({unit})
                </FieldLabel>
                <input name="quantity" type="number" step="0.001" required />
              </div>
              {showCost ? (
                <div>
                  <FieldLabel>{t("warehouse.productBatchCost")}</FieldLabel>
                  <input
                    name="costPerUnit"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={defaultCostPrefill}
                  />
                </div>
              ) : (
                <input type="hidden" name="costPerUnit" value={defaultCostPrefill || "1"} />
              )}
            </div>
            <div>
              <FieldLabel>{t("warehouse.productBatchNotes")}</FieldLabel>
              <input name="notes" placeholder="—" />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={keepPrice}
                onChange={(e) => setKeepPrice(e.target.checked)}
              />
              {t("warehouse.productBatchKeepPrice")}
            </label>
            {!keepPrice ? (
              <div>
                <FieldLabel>{t("warehouse.productSalePrice")}</FieldLabel>
                <input
                  type="number"
                  step="0.01"
                  value={newSalePrice}
                  onChange={(e) => setNewSalePrice(e.target.value)}
                  required
                />
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit">{t("warehouse.productBatchSubmit")}</Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth={false}
                onClick={() => setShowBatch(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section>
        <SectionTitle>{t("warehouse.productBatchesTitle")}</SectionTitle>
        <Card className="mt-2">
          {warehouseBatches.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted">
              {t("warehouse.productNoBatches")}
            </div>
          ) : (
            warehouseBatches.map((b, i) => (
              <div
                key={b.id}
                className="border-b border-border px-4 py-3 last:border-0"
              >
                <div className="font-semibold text-ink">
                  #{i + 1} · {Number(b.quantity)} {unit}
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {showCost
                    ? `${formatMoney(Number(b.costPerUnit))} · `
                    : ""}
                  {formatDateTime(b.receivedAt)}
                  {b.notes ? ` · ${b.notes}` : ""}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      {msg ? <p className="text-sm text-success">{msg}</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
