"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Brand = {
  id: string;
  name: string;
  imageUrl?: string | null;
  isArchived: boolean;
};

export default function WarehouseBrandsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Brand[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");

  async function load() {
    try {
      setError("");
      const res = await fetch(
        `/api/brands?archived=${showArchived ? "1" : "0"}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setItems([]);
        setError(apiErrorMessage(data?.error, t));
        return;
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[brands] load failed", err);
      setItems([]);
      setError(t("common.error"));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setName("");
    load();
  }

  async function softDelete(id: string) {
    setError("");
    const res = await fetch(`/api/brands?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  async function restore(id: string) {
    setError("");
    await fetch("/api/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isArchived: false }),
    });
    load();
  }

  async function purge(id: string) {
    setError("");
    if (!window.confirm(t("wh.brandDeleteForeverHint"))) return;
    const res = await fetch(
      `/api/brands?id=${encodeURIComponent(id)}&force=1`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wh.brandsTitle")}
        subtitle={t("warehouse.productBrand")}
        actions={
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            onClick={() => setShowArchived((v) => !v)}
          >
            {showArchived ? t("wh.filterActive") : t("wh.filterArchived")}
          </Button>
        }
      />

      {!showArchived ? (
        <Card className="max-w-md p-4">
          <form onSubmit={onCreate} className="flex gap-2">
            <div className="flex-1">
              <FieldLabel>{t("warehouse.productBrandNew")}</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full"
                placeholder={t("wh.name")}
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
      ) : null}

      {error && showArchived ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}

      <div className="space-y-2">
        {items.map((b) => (
          <Card
            key={b.id}
            className="flex items-center justify-between gap-3 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft text-lg">
                🏷
              </div>
              <div className="font-semibold text-ink">{b.name}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {b.isArchived ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    size="sm"
                    onClick={() => restore(b.id)}
                  >
                    {t("wh.restore")}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    fullWidth={false}
                    size="sm"
                    onClick={() => purge(b.id)}
                  >
                    {t("wh.deleteForever")}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  size="sm"
                  onClick={() => softDelete(b.id)}
                >
                  {t("wh.delete")}
                </Button>
              )}
            </div>
          </Card>
        ))}
        {items.length === 0 ? (
          <p className="py-8 text-center text-muted">{t("common.noData")}</p>
        ) : null}
      </div>
    </div>
  );
}
