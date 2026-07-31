"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Product = { id: string; name: string; defaultCostPerUnit?: number | string | null };
type Supplier = { id: string; name: string; phone?: string | null };

export default function ReceiveBatchPage() {
  const router = useRouter();
  const { t, formatMoney } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productId, setProductId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/products?status=active").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
    ]).then(([p, s]) => {
      setProducts(Array.isArray(p) ? p : []);
      setSuppliers(Array.isArray(s) ? s : []);
    });
  }, []);

  const filteredProducts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products;
    return products.filter((p) => p.name.toLowerCase().includes(needle));
  }, [products, q]);

  const lineTotal = useMemo(() => {
    const qn = Number(qty);
    const cn = Number(cost);
    if (!qn || !cn || qn <= 0 || cn <= 0) return null;
    return qn * cn;
  }, [qty, cost]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!productId) {
      setError(t("purchases.selectProduct"));
      return;
    }
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch(`/api/products/${productId}/batches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quantity: Number(qty),
        costPerUnit: Number(cost),
        notes: String(fd.get("notes") || "") || null,
        supplierId: supplierId || null,
        receivedAt: fd.get("receivedAt")
          ? new Date(String(fd.get("receivedAt"))).toISOString()
          : undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    router.push("/warehouse/batches");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title={t("purchases.receiveTitle")}
        subtitle={t("purchases.receiveSubtitle")}
        actions={
          <Link href="/warehouse/new">
            <Button fullWidth={false} variant="secondary">
              {t("purchases.newProduct")}
            </Button>
          </Link>
        }
      />

      <Card className="p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <SectionTitle>{t("purchases.receiveTitle")}</SectionTitle>

          <div>
            <FieldLabel>{t("purchases.supplier")}</FieldLabel>
            <select
              className="w-full"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">{t("purchases.supplierOptional")}</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.phone ? ` · ${s.phone}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">
              <Link href="/warehouse/suppliers" className="font-semibold text-brand">
                {t("purchases.manageSuppliers")}
              </Link>
            </p>
          </div>

          <div>
            <FieldLabel>{t("purchases.product")}</FieldLabel>
            <input
              className="mb-2 w-full"
              placeholder={t("purchases.searchProduct")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="w-full"
              required
              value={productId}
              onChange={(e) => {
                const id = e.target.value;
                setProductId(id);
                const p = products.find((x) => x.id === id);
                const dc = p?.defaultCostPerUnit != null ? Number(p.defaultCostPerUnit) : 0;
                if (dc > 0 && !cost) setCost(String(dc));
              }}
            >
              <option value="" disabled>
                {t("purchases.selectProduct")}
              </option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>{t("purchases.quantity")}</FieldLabel>
              <input
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
                type="number"
                step="any"
                min="0.01"
                required
                className="w-full"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>

          {lineTotal != null ? (
            <p className="rounded-xl bg-zone-money-soft px-3 py-2 text-sm font-semibold text-zone-money-deep">
              {t("purchases.lineTotal", { amount: formatMoney(lineTotal) })}
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
            <input name="notes" className="w-full" placeholder={t("purchases.commentPlaceholder")} />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button type="submit" disabled={loading || !productId}>
            {loading ? t("common.loading") : t("purchases.confirm")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
