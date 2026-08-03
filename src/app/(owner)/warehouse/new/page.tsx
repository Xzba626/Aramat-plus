"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { resolveAccountingTypeFromCategoryName } from "@/lib/product-category";
import { ImagePlus } from "lucide-react";

type RefItem = { id: string; name: string };

export default function NewProductPage() {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const [brands, setBrands] = useState<RefItem[]>([]);
  const [categories, setCategories] = useState<RefItem[]>([]);
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);
  const [accountingType, setAccountingType] = useState<"PIECE" | "WEIGHT">(
    "PIECE"
  );
  const [saleMethodTouched, setSaleMethodTouched] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [cost, setCost] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [newBrand, setNewBrand] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function loadBrands() {
    const res = await fetch("/api/brands");
    const b = await res.json();
    if (Array.isArray(b)) setBrands(b);
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/categories?seedDefaults=1").then((r) => r.json()),
    ]).then(([b, cats]) => {
      setBrands(Array.isArray(b) ? b : []);
      setCategories(Array.isArray(cats) ? cats : []);
    });
  }, []);

  function onCategoryChange(id: string) {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    const suggested = resolveAccountingTypeFromCategoryName(cat?.name);
    if (suggested && !saleMethodTouched) {
      setAccountingType(suggested);
    }
  }

  const unitLabel =
    accountingType === "WEIGHT" ? t("warehouse.unitMl") : t("warehouse.unitPcs");

  const profit = useMemo(() => {
    const s = Number(salePrice);
    const c = Number(cost);
    if (!s || !c || s <= 0 || c <= 0) return null;
    return s - c;
  }, [salePrice, cost]);

  async function createBrand() {
    const name = brandName.trim();
    if (!name) {
      setError(t("errors.BRAND_NAME_REQUIRED"));
      return;
    }
    setBrandBusy(true);
    setError("");
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t));
        setBrandBusy(false);
        return;
      }
      await loadBrands();
      setBrandId(data.id);
      setNewBrand(false);
      setBrandName("");
    } catch {
      setError(t("common.error"));
    }
    setBrandBusy(false);
  }

  async function onPhotoChange(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const { compressImageFile } = await import(
        "@/lib/client-image-compress"
      );
      let prepared: File;
      try {
        prepared = await compressImageFile(file);
      } catch {
        setError(t("errors.IMAGE_COMPRESS_FAILED"));
        setUploading(false);
        return;
      }
      const fd = new FormData();
      fd.append("file", prepared);
      const res = await fetch("/api/products/upload", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t));
      } else {
        setImageUrl(data.imageUrl);
      }
    } catch {
      setError(t("common.error"));
    }
    setUploading(false);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    if (!categoryId) {
      setError(t("errors.VALIDATION_ERROR"));
      setLoading(false);
      return;
    }

    let resolvedBrandId = brandId || null;
    if (newBrand) {
      const name = brandName.trim();
      if (!name) {
        setError(t("errors.BRAND_NAME_REQUIRED"));
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(apiErrorMessage(data.error, t));
          setLoading(false);
          return;
        }
        resolvedBrandId = data.id;
        setBrandId(data.id);
        setNewBrand(false);
        await loadBrands();
      } catch {
        setLoading(false);
        setError(t("common.error"));
        return;
      }
    }

    const qty = Number(initialQty);
    const payload = {
      name: String(fd.get("name") || ""),
      description: String(fd.get("description") || "") || null,
      brandId: resolvedBrandId,
      categoryId,
      accountingType,
      imageUrl,
      salePrice: Number(salePrice),
      defaultCostPerUnit: cost ? Number(cost) : null,
      ...(qty > 0 ? { initialQuantity: qty } : {}),
    };

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t));
        return;
      }
      router.push(`/warehouse/${data.id}`);
      router.refresh();
    } catch {
      setLoading(false);
      setError(t("common.error"));
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={t("warehouse.productCreateTitle")}
        subtitle={t("warehouse.productCreateSubtitle")}
      />
      <Card className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <FieldLabel>{t("warehouse.productName")}</FieldLabel>
            <input
              name="name"
              required
              className="w-full"
              placeholder="Dior Sauvage"
            />
          </div>

          <div>
            <FieldLabel>{t("warehouse.productSku")}</FieldLabel>
            <input
              disabled
              className="w-full opacity-70"
              value=""
              placeholder={t("warehouse.productSkuAuto")}
              readOnly
            />
          </div>

          <div>
            <FieldLabel>{t("warehouse.productPhoto")}</FieldLabel>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border bg-page px-4 py-4 text-sm text-muted hover:border-brand/40">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt=""
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <ImagePlus className="h-8 w-8 shrink-0" strokeWidth={1.75} />
              )}
              <span>
                {uploading
                  ? t("warehouse.productPhotoUploading")
                  : imageUrl
                    ? t("warehouse.productPhotoUploaded")
                    : t("warehouse.productPhotoUpload")}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg,.jpg,.jpeg,.png,.webp"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => onPhotoChange(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div>
            <FieldLabel>{t("warehouse.productDesc")}</FieldLabel>
            <textarea
              name="description"
              rows={2}
              className="w-full rounded-xl border border-border px-3 py-2"
            />
          </div>

          <div>
            <FieldLabel>{t("warehouse.productBrand")}</FieldLabel>
            {!newBrand ? (
              <div className="flex gap-2">
                <select
                  name="brandId"
                  value={brandId}
                  onChange={(e) => setBrandId(e.target.value)}
                  className="w-full"
                >
                  <option value="">—</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setNewBrand(true)}
                >
                  {t("warehouse.productBrandNew")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="min-w-[140px] flex-1"
                  placeholder="Dior"
                />
                <Button
                  type="button"
                  fullWidth={false}
                  disabled={brandBusy}
                  onClick={createBrand}
                >
                  {t("warehouse.productBrandAdd")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => {
                    setNewBrand(false);
                    setBrandName("");
                  }}
                >
                  ←
                </Button>
              </div>
            )}
          </div>

          <div>
            <FieldLabel>{t("warehouse.productCategory")}</FieldLabel>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-full"
              required
            >
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              {t("warehouse.productCategoryHint")}
            </p>
          </div>

          <div>
            <FieldLabel>{t("warehouse.productSellHow")}</FieldLabel>
            <p className="mb-2 text-xs text-muted">
              {t("warehouse.productSellManualHint")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-xl border px-3 py-3 text-sm ${
                  accountingType === "PIECE"
                    ? "border-brand bg-brand-soft font-semibold text-brand"
                    : "border-border bg-card"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={accountingType === "PIECE"}
                  onChange={() => {
                    setSaleMethodTouched(true);
                    setAccountingType("PIECE");
                  }}
                />
                {t("warehouse.productSellPiece")}
              </label>
              <label
                className={`cursor-pointer rounded-xl border px-3 py-3 text-sm ${
                  accountingType === "WEIGHT"
                    ? "border-brand bg-brand-soft font-semibold text-brand"
                    : "border-border bg-card"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  checked={accountingType === "WEIGHT"}
                  onChange={() => {
                    setSaleMethodTouched(true);
                    setAccountingType("WEIGHT");
                  }}
                />
                {t("warehouse.productSellVolume")}
              </label>
            </div>
          </div>

          <div>
            <FieldLabel>
              {t("warehouse.productInitialQty", { unit: unitLabel })}
            </FieldLabel>
            <input
              type="number"
              step={accountingType === "WEIGHT" ? "0.001" : "1"}
              min="0"
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
              className="w-full"
            />
            <p className="mt-1 text-xs text-muted">
              {t("warehouse.productInitialQtyHint")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>
                {t("warehouse.productCost")} ({unitLabel})
              </FieldLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted">
                {t("warehouse.productCostHint")}
              </p>
            </div>
            <div>
              <FieldLabel>
                {t("warehouse.productSalePrice")} ({unitLabel})
              </FieldLabel>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted">
                {t("warehouse.productSaleHint")}
              </p>
            </div>
          </div>

          {profit != null && profit >= 0 ? (
            <p className="rounded-xl bg-zone-money-soft px-3 py-2 text-sm font-semibold text-zone-money-deep">
              {t("warehouse.productProfitHint", {
                amount: formatMoney(profit, { short: true }),
              })}{" "}
              / {unitLabel}
            </p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={loading || brandBusy || uploading}>
            {loading
              ? t("warehouse.productSaving")
              : t("warehouse.productCreateBtn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
