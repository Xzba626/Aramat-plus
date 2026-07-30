"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Store = { id: string; name: string };
type Product = { id: string; name: string };

export default function WarehouseReturnInPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => r.json()),
      fetch("/api/products?status=active").then((r) => r.json()),
    ]).then(([s, p]) => {
      const branches = (Array.isArray(s) ? s : []).filter(
        (x: { kind: string }) => x.kind === "BRANCH"
      );
      setStores(branches);
      setProducts(Array.isArray(p) ? p : []);
    });
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/warehouse/return-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId: String(fd.get("storeId")),
        reason: String(fd.get("reason") || "") || null,
        items: [
          {
            productId: String(fd.get("productId")),
            quantity: Number(fd.get("quantity")),
          },
        ],
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("wh.returnInOk"));
    router.refresh();
    (e.target as HTMLFormElement).reset();
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title={t("wh.returnInTitle")}
        subtitle={`${t("common.store")} → ${t("wh.centralWarehouse")}`}
      />
      <Card className="p-4">
        <form onSubmit={onSubmit} className="space-y-3">
          <SectionTitle>{t("wh.actionReturn")}</SectionTitle>
          <div>
            <FieldLabel>{t("common.store")}</FieldLabel>
            <select name="storeId" required className="w-full" defaultValue="">
              <option value="" disabled>
                {t("common.store")}
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>{t("wh.colName")}</FieldLabel>
            <select name="productId" required className="w-full" defaultValue="">
              <option value="" disabled>
                {t("wh.colName")}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>{t("warehouse.productBatchQty")}</FieldLabel>
            <input name="quantity" type="number" step="any" min="0.001" required className="w-full" />
          </div>
          <div>
            <FieldLabel>{t("warehouse.productBatchNotes")}</FieldLabel>
            <input name="reason" className="w-full" placeholder={t("warehouse.productBatchNotes")} />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {msg ? <p className="text-sm text-success">{msg}</p> : null}
          <Button type="submit" disabled={loading}>
            {loading ? t("common.loading") : t("wh.actionReturn")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
