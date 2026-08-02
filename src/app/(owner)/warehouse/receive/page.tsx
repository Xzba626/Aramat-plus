"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Product = { id: string; name: string; salePrice?: number };

export default function ReceivePurchasePage() {
  const router = useRouter();
  const search = useSearchParams();
  const { t, formatMoney } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [mode, setMode] = useState<"existing" | "new">(
    search.get("mode") === "new" ? "new" : "existing"
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");

  useEffect(() => {
    fetch("/api/products?status=active")
      .then((r) => r.json())
      .then((pData) => setProducts(Array.isArray(pData) ? pData : []));
  }, []);

  const total =
    Number(qty) > 0 && Number(cost) > 0 ? Number(qty) * Number(cost) : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      const productId = String(fd.get("productId") || "");
      if (!productId) {
        setError(t("errors.PRODUCT_NOT_FOUND"));
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/products/${productId}/batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: Number(fd.get("quantity")),
          costPerUnit: Number(fd.get("costPerUnit")),
          notes: String(fd.get("notes") || "") || null,
          receivedAt: fd.get("receivedAt")
            ? new Date(String(fd.get("receivedAt"))).toISOString()
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data.error, t));
        setLoading(false);
        return;
      }

      router.push("/warehouse/purchases");
      router.refresh();
    } catch (err) {
      setError(
        apiErrorMessage(
          err instanceof Error ? err.message : "INTERNAL_ERROR",
          t
        )
      );
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader
        title={t("wh.receiveTitle")}
        subtitle={t("wh.receiveSubtitle")}
        actions={
          <Link href="/warehouse/purchases">
            <Button variant="secondary" fullWidth={false}>
              {t("warehouse.actionPurchaseHistory")}
            </Button>
          </Link>
        }
      />

      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <SectionTitle>{t("wh.receiveStepProduct")}</SectionTitle>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === "existing"
                  ? "bg-brand text-white"
                  : "bg-card text-muted ring-1 ring-border"
              }`}
            >
              {t("wh.receiveExistingProduct")}
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                mode === "new"
                  ? "bg-brand text-white"
                  : "bg-card text-muted ring-1 ring-border"
              }`}
            >
              {t("wh.receiveNewProduct")}
            </button>
          </div>

          {mode === "new" ? (
            <div className="rounded-xl bg-surface p-4 text-sm text-muted">
              <p className="mb-3">{t("wh.receiveNewProductHint")}</p>
              <Link href="/warehouse/new?next=/warehouse/receive">
                <Button type="button" fullWidth={false}>
                  {t("wh.receiveNewProduct")}
                </Button>
              </Link>
            </div>
          ) : (
            <div>
              <FieldLabel>{t("purchases.product")}</FieldLabel>
              <select name="productId" required className="w-full" defaultValue="">
                <option value="" disabled>
                  {t("purchases.selectProduct")}
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "existing" ? (
            <>
              <SectionTitle>{t("wh.receiveStepDetails")}</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>{t("purchases.quantity")}</FieldLabel>
                  <input
                    name="quantity"
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    className="w-full"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>{t("purchases.costPerUnit")}</FieldLabel>
                  <input
                    name="costPerUnit"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="w-full"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              </div>
              {total > 0 ? (
                <p className="text-sm font-semibold text-ink">
                  {t("purchases.lineTotal", {
                    amount: formatMoney(total),
                  })}
                </p>
              ) : null}
              <div>
                <FieldLabel>{t("purchases.date")}</FieldLabel>
                <input
                  name="receivedAt"
                  type="date"
                  className="w-full"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </div>
              <div>
                <FieldLabel>{t("purchases.comment")}</FieldLabel>
                <input
                  name="notes"
                  className="w-full"
                  placeholder={t("purchases.commentPlaceholder")}
                />
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" disabled={loading}>
                {loading ? t("common.loading") : t("wh.receiveConfirm")}
              </Button>
            </>
          ) : null}
        </form>
      </Card>
    </div>
  );
}
