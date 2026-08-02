"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage, labelProductType } from "@/lib/i18n/labels";

type ProductTypeRow = { id: string; name: string };

export default function WarehouseProductTypesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ProductTypeRow[]>([]);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/product-types");
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/product-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setName("");
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("wh.productTypesDeleteConfirm"))) return;
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/product-types?id=${id}`, { method: "DELETE" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wh.productTypesTitle")}
        subtitle={t("wh.productTypesSubtitle")}
      />

      <Card className="max-w-md p-4">
        <form onSubmit={onCreate} className="flex gap-2">
          <div className="flex-1">
            <FieldLabel>{t("settingsSub.name")}</FieldLabel>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full"
              placeholder={t("wh.productTypesPlaceholder")}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" fullWidth={false}>
              {t("wh.add")}
            </Button>
          </div>
        </form>
        {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
      </Card>

      <div className="space-y-2">
        {items.map((pt) => (
          <Card key={pt.id} className="flex items-center justify-between gap-3 p-4">
            <div className="font-semibold text-ink">{labelProductType(pt.name, t)}</div>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              size="sm"
              disabled={busyId === pt.id}
              onClick={() => remove(pt.id)}
            >
              {t("wh.delete")}
            </Button>
          </Card>
        ))}
        {items.length === 0 ? (
          <p className="py-8 text-center text-muted">{t("common.noData")}</p>
        ) : null}
      </div>

      <p className="text-sm text-muted">
        {t("wh.productTypesHint")}{" "}
        <Link href="/warehouse/new" className="font-semibold text-brand">
          {t("nav.newProduct")} →
        </Link>
      </p>
    </div>
  );
}
