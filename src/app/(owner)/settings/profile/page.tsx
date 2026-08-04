"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { PreferenceControls } from "@/components/preferences/preference-controls";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

export default function ProfileSettingsPage() {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/me/preferences");
        const data = await res.json();
        if (res.ok) {
          setName(data.name ?? "");
          setEmail(data.email ?? "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setError("");
    const res = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setName(data.name ?? name);
    setMsg(t("settingsSub.nameSaved"));
  }

  return (
    <>
      <PageHeader
        title={t("settingsSub.profileTitle")}
        subtitle={t("settingsCenter.profileDesc")}
      />

      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold text-ink">
            {t("settingsSub.preferences")}
          </h2>
          <PreferenceControls layout="stack" showLabels />
        </Card>

        <Card className="p-5">
          {loading ? (
            <p className="text-sm text-muted">{t("common.loading")}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <FieldLabel>{t("settingsSub.name")}</FieldLabel>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div>
                <FieldLabel>{t("settingsSub.login")}</FieldLabel>
                <input value={email} readOnly disabled className="opacity-80" />
              </div>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              {msg ? <p className="text-sm text-success">{msg}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{t("common.save")}</Button>
                <Link
                  href="/settings/security"
                  className="mt-2 inline-block text-sm font-semibold text-brand"
                >
                  {t("common.changePassword")} →
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </>
  );
}
