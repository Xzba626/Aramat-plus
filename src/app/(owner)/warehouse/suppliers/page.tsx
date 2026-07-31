"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  comment: string | null;
  isActive: boolean;
};

export default function SuppliersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Supplier[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");

  async function load() {
    const res = await fetch("/api/suppliers");
    const data = await res.json();
    const list: Supplier[] = Array.isArray(data) ? data : [];
    setItems(list.filter((s) => (showInactive ? !s.isActive : s.isActive)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone: phone || null, comment: comment || null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setName("");
    setPhone("");
    setComment("");
    load();
  }

  async function setActive(id: string, isActive: boolean) {
    await fetch("/api/suppliers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wh.suppliersTitle")}
        subtitle={t("wh.suppliersSubtitle")}
        actions={
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            onClick={() => setShowInactive((v) => !v)}
          >
            {showInactive ? t("wh.filterActive") : t("wh.filterInactive")}
          </Button>
        }
      />

      {!showInactive ? (
        <Card className="max-w-xl p-4">
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>{t("wh.name")}</FieldLabel>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div>
              <FieldLabel>{t("wh.supplierPhone")}</FieldLabel>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <FieldLabel>{t("wh.supplierComment")}</FieldLabel>
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" fullWidth={false}>
                {t("wh.add")}
              </Button>
            </div>
          </form>
          {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
        </Card>
      ) : null}

      <div className="space-y-2">
        {items.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="font-semibold text-ink">{s.name}</div>
              <div className="text-xs text-muted">
                {[s.phone, s.comment].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              onClick={() => setActive(s.id, !s.isActive)}
            >
              {s.isActive ? t("wh.deactivate") : t("wh.restore")}
            </Button>
          </Card>
        ))}
        {items.length === 0 ? (
          <Card className="p-8 text-center text-muted">{t("common.noData")}</Card>
        ) : null}
      </div>
    </div>
  );
}
