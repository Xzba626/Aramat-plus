"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { cn } from "@/lib/utils";

type Product = {
  id: string;
  name: string;
  defaultCostPerUnit?: number | string | null;
  kind?: string;
};
type Supplier = { id: string; name: string; phone?: string | null };

type Tab = "liquid" | "packaging";

function ReceiveForm({ tab }: { tab: Tab }) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    const kind = tab === "packaging" ? "PACKAGING" : "STANDARD";
    Promise.all([
      fetch(`/api/products?status=active&kind=${kind}`).then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
    ]).then(([p, s]) => {
      setProducts(Array.isArray(p) ? p : []);
      setSuppliers(Array.isArray(s) ? s : []);
      const pre = searchParams.get("productId");
      if (pre && Array.isArray(p) && p.some((x: Product) => x.id === pre)) {
        setProductId(pre);
      } else {
        setProductId("");
      }
      setQty("");
      setCost("");
      setQ("");
    });
  }, [tab, searchParams]);

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
    router.push(
      tab === "packaging" ? "/warehouse/packaging" : "/warehouse/batches"
    );
    router.refresh();
  }

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <SectionTitle>
          {tab === "packaging"
            ? t("packaging.receiveTitle")
            : t("purchases.receiveTitle")}
        </SectionTitle>

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
        </div>

        <div>
          <FieldLabel>
            {tab === "packaging"
              ? t("packaging.bottleProduct")
              : t("purchases.product")}
          </FieldLabel>
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
              const dc =
                p?.defaultCostPerUnit != null
                  ? Number(p.defaultCostPerUnit)
                  : 0;
              if (dc > 0) setCost(String(dc));
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
          {tab === "packaging" && filteredProducts.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              <Link
                href="/warehouse/packaging"
                className="font-semibold text-brand"
              >
                {t("packaging.createSkuFirst")}
              </Link>
            </p>
          ) : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel>
              {tab === "packaging"
                ? t("packaging.quantityPcs")
                : t("purchases.quantity")}
            </FieldLabel>
            <input
              type="number"
              step={tab === "packaging" ? "1" : "any"}
              min={tab === "packaging" ? "1" : "0.001"}
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
          <input
            name="notes"
            className="w-full"
            placeholder={t("purchases.commentPlaceholder")}
          />
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <Button type="submit" disabled={loading || !productId}>
          {loading ? t("common.loading") : t("purchases.confirm")}
        </Button>
      </form>
    </Card>
  );
}

export default function ReceiveBatchClient() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "packaging" ? "packaging" : "liquid";

  function setTab(next: Tab) {
    const q = new URLSearchParams(searchParams.toString());
    if (next === "packaging") q.set("tab", "packaging");
    else q.delete("tab");
    q.delete("productId");
    router.replace(`/warehouse/receive?${q.toString()}`);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title={t("purchases.receiveTitle")}
        subtitle={t("packaging.receiveSubtitle")}
        actions={
          tab === "liquid" ? (
            <Link href="/warehouse/new">
              <Button fullWidth={false} variant="secondary">
                {t("purchases.newProduct")}
              </Button>
            </Link>
          ) : (
            <Link href="/warehouse/packaging">
              <Button fullWidth={false} variant="secondary">
                {t("packaging.catalog")}
              </Button>
            </Link>
          )
        }
      />

      <div className="flex gap-2">
        {(
          [
            ["liquid", "packaging.tabLiquid"],
            ["packaging", "packaging.tabPackaging"],
          ] as const
        ).map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium",
              tab === id
                ? "bg-brand text-white"
                : "bg-card text-muted ring-1 ring-border"
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>

      <ReceiveForm tab={tab} />
    </div>
  );
}
