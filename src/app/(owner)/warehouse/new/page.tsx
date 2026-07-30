"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { ImagePlus } from "lucide-react";

type RefItem = { id: string; name: string };

export default function NewProductPage() {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const [brands, setBrands] = useState<RefItem[]>([]);
  const [types, setTypes] = useState<RefItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [accountingType, setAccountingType] = useState<"PIECE" | "WEIGHT">(
    "WEIGHT"
  );
  const [salePrice, setSalePrice] = useState("");
  const [cost, setCost] = useState("");
  const [newBrand, setNewBrand] = useState(false);
  const [brandName, setBrandName] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/product-types").then((r) => r.json()),
    ]).then(([b, pt]) => {
      setBrands(Array.isArray(b) ? b : []);
      setTypes(Array.isArray(pt) ? pt : []);
    });
  }, []);

  const unitLabel = accountingType === "WEIGHT" ? "мл" : "шт";
  const profit = useMemo(() => {
    const s = Number(salePrice);
    const c = Number(cost);
    if (!s || !c || s <= 0 || c <= 0) return null;
    return s - c;
  }, [salePrice, cost]);

  async function ensureBrandId(fd: FormData): Promise<string | null> {
    if (!newBrand) {
      const id = String(fd.get("brandId") || "");
      return id || null;
    }
    const name = brandName.trim();
    if (!name) return null;
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Brand error");
    return data.id as string;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const brandId = await ensureBrandId(fd);
      const payload = {
        name: String(fd.get("name") || ""),
        description: String(fd.get("description") || "") || null,
        brandId,
        productTypeId: String(fd.get("productTypeId") || "") || null,
        accountingType,
        salePrice: Number(salePrice),
        defaultCostPerUnit: cost ? Number(cost) : null,
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || t("common.error"));
        return;
      }
      router.push(`/warehouse/${data.id}`);
      router.refresh();
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : t("common.error"));
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
              placeholder={t("warehouse.productSkuAuto")}
            />
            <p className="mt-1 text-xs text-muted">{t("warehouse.productSkuAuto")}</p>
          </div>

          <div>
            <FieldLabel>{t("warehouse.productPhoto")}</FieldLabel>
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-page px-4 py-6 text-sm text-muted">
              <ImagePlus className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              {t("warehouse.productPhotoSoon")}
            </div>
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
                <select name="brandId" defaultValue="" className="w-full">
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
              <div className="flex gap-2">
                <input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  className="w-full"
                  placeholder="Dior"
                  required
                />
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
            <FieldLabel>{t("warehouse.productType")}</FieldLabel>
            <select name="productTypeId" defaultValue="" className="w-full" required>
              <option value="">—</option>
              {types.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{t("warehouse.productTypeHint")}</p>
          </div>

          <div>
            <FieldLabel>{t("warehouse.productSellHow")}</FieldLabel>
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
                  onChange={() => setAccountingType("PIECE")}
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
                  onChange={() => setAccountingType("WEIGHT")}
                />
                {t("warehouse.productSellVolume")}
              </label>
            </div>
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
              <p className="mt-1 text-xs text-muted">{t("warehouse.productCostHint")}</p>
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
              <p className="mt-1 text-xs text-muted">{t("warehouse.productSaleHint")}</p>
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
          <Button type="submit" disabled={loading}>
            {loading ? t("warehouse.productSaving") : t("warehouse.productCreateBtn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
