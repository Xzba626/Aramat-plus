"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

type CompanyForm = {
  id: string;
  name: string;
  currency: string;
};

export default function CompanySettingsPage() {
  const { t } = useI18n();
  const [form, setForm] = useState<CompanyForm | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/company")
      .then((r) => r.json())
      .then((d) => {
        if (d?.id) setForm({ id: d.id, name: d.name, currency: d.currency });
        else setError(apiErrorMessage(d.error, t, "common.error"));
        setLoading(false);
      })
      .catch(() => {
        setError(t("common.error"));
        setLoading(false);
      });
  }, [t]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, currency: form.currency }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setForm({ id: data.id, name: data.name, currency: data.currency });
    setMsg(t("settingsSub.save"));
  }

  return (
    <ModuleWorkspace
      title={t("settingsSub.company")}
      subtitle={t("settingsSub.companySubtitle")}
      tabs={[
        {
          id: "company",
          label: t("settingsSub.company"),
          href: "/settings/company",
        },
        { id: "hub", label: t("common.settings"), href: "/settings" },
        {
          id: "refs",
          label: t("settingsSub.references"),
          href: "/settings/references",
        },
        {
          id: "password",
          label: t("settingsSub.password"),
          href: "/settings/password",
        },
      ]}
      activeTab="company"
    >
      <ModuleSection
        title={t("settingsSub.company")}
        action={
          <Link href="/settings" className="text-sm font-semibold text-brand">
            ← {t("common.settings")}
          </Link>
        }
      >
        <Card className="max-w-xl p-5">
          {loading ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : form ? (
            <form onSubmit={onSave} className="space-y-3">
              <div>
                <FieldLabel>{t("settingsSub.name")}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev
                    )
                  }
                  required
                />
              </div>
              <div>
                <FieldLabel>{t("settingsSub.currency")}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form.currency}
                  onChange={(e) =>
                    setForm((prev) =>
                      prev ? { ...prev, currency: e.target.value } : prev
                    )
                  }
                  required
                />
              </div>
              {msg ? <p className="text-sm text-success">{msg}</p> : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <Button type="submit" fullWidth={false} disabled={saving}>
                {saving ? t("common.loading") : t("settingsSub.save")}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-danger">{error || t("common.error")}</p>
          )}
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
