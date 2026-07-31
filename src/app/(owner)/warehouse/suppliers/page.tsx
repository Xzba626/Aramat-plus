"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel, SectionTitle } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/empty-state";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
};

export default function SuppliersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(
      `/api/suppliers?archived=${showInactive ? "1" : "0"}`
    );
    const data = await res.json();
    if (res.ok) setItems(Array.isArray(data) ? data : []);
    else setError(apiErrorMessage(data.error, t));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(fd.get("name") || ""),
        phone: String(fd.get("phone") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("suppliers.created"));
    setShowForm(false);
    (e.target as HTMLFormElement).reset();
    load();
  }

  async function setActive(id: string, isActive: boolean) {
    setError("");
    const res = await fetch("/api/suppliers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    load();
  }

  return (
    <div>
      <PageHeader
        title={t("suppliers.title")}
        subtitle={t("suppliers.subtitle")}
        count={loading ? null : items.length}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              onClick={() => setShowInactive((v) => !v)}
            >
              {showInactive ? t("suppliers.showActive") : t("suppliers.showInactive")}
            </Button>
            <Button
              type="button"
              fullWidth={false}
              onClick={() => setShowForm((v) => !v)}
            >
              {showForm ? t("common.cancel") : t("suppliers.create")}
            </Button>
          </div>
        }
      />

      {showForm ? (
        <Card className="mb-4 max-w-lg p-4">
          <form onSubmit={onCreate} className="space-y-3">
            <SectionTitle>{t("suppliers.create")}</SectionTitle>
            <div>
              <FieldLabel>{t("suppliers.name")}</FieldLabel>
              <input name="name" required className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("suppliers.phone")}</FieldLabel>
              <input name="phone" className="w-full" />
            </div>
            <div>
              <FieldLabel>{t("suppliers.notes")}</FieldLabel>
              <input name="notes" className="w-full" />
            </div>
            <Button type="submit">{t("common.save")}</Button>
          </form>
        </Card>
      ) : null}

      {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
      {msg ? <p className="mb-3 text-sm text-success">{msg}</p> : null}

      {loading ? (
        <LoadingBlock rows={4} />
      ) : (
        <div className="space-y-2">
          {items.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-ink">
                    {s.name}{" "}
                    {!s.isActive ? (
                      <span className="text-xs font-semibold text-muted">
                        ({t("suppliers.inactive")})
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {s.phone || t("suppliers.noPhone")}
                    {s.notes ? ` · ${s.notes}` : ""}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth={false}
                  onClick={() => setActive(s.id, !s.isActive)}
                >
                  {s.isActive ? t("suppliers.deactivate") : t("suppliers.activate")}
                </Button>
              </div>
            </Card>
          ))}
          {items.length === 0 ? (
            <Card className="p-8 text-center text-muted">{t("suppliers.empty")}</Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
