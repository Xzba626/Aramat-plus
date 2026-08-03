"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Cat = {
  id: string;
  name: string;
  lowStockThreshold: string | number;
  isArchived: boolean;
  productCount?: number;
  canDelete?: boolean;
};

export default function WarehouseCategoriesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Cat[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");

  async function load() {
    const res = await fetch(
      `/api/categories?seedDefaults=1&archived=${showArchived ? "1" : "0"}`
    );
    const data = await res.json();
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    const res = await fetch("/api/categories", {
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

  /** Active → archive (unified Delete pattern). */
  async function softDelete(id: string) {
    setError("");
    setMsg("");
    const res = await fetch(`/api/categories?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("actions.categoryArchive"));
    load();
  }

  async function restore(id: string) {
    setError("");
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isArchived: false }),
    });
    load();
  }

  async function purge(id: string) {
    setError("");
    setMsg("");
    if (!window.confirm(t("wh.categoryDeleteForeverHint"))) return;
    const res = await fetch(
      `/api/categories?id=${encodeURIComponent(id)}&force=1`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("actions.categoryDelete"));
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wh.categoriesTitle")}
        subtitle={t("wh.categoriesSubtitle")}
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

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {msg ? <p className="text-sm text-success">{msg}</p> : null}

      {!showArchived ? (
        <Card className="max-w-md p-4">
          <form onSubmit={onCreate} className="flex gap-2">
            <div className="flex-1">
              <FieldLabel>{t("wh.categoryNew")}</FieldLabel>
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
        </Card>
      ) : null}

      <div className="space-y-2">
        {items.map((c) => (
          <Card
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <div className="font-semibold text-ink">{c.name}</div>
              <div className="text-xs text-muted">
                {t("wh.filterLow")}: {Number(c.lowStockThreshold)}
                {typeof c.productCount === "number"
                  ? ` · ${c.productCount} ${t("nav.products").toLowerCase()}`
                  : ""}
              </div>
              {c.isArchived && !c.canDelete ? (
                <p className="mt-1 text-[11px] text-muted">
                  {t("wh.categoryInUse")}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {c.isArchived ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth={false}
                    size="sm"
                    onClick={() => restore(c.id)}
                  >
                    {t("wh.restore")}
                  </Button>
                  {c.canDelete ? (
                    <Button
                      type="button"
                      variant="danger"
                      fullWidth={false}
                      size="sm"
                      onClick={() => purge(c.id)}
                    >
                      {t("wh.deleteForever")}
                    </Button>
                  ) : null}
                </>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  size="sm"
                  onClick={() => softDelete(c.id)}
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
