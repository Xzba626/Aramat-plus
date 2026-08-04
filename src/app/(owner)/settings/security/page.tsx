"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

/**
 * Security settings: password + links to login journal / security notifications.
 */
export default function SecuritySettingsPage() {
  const { t } = useI18n();
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("currentPassword")),
        newPassword: String(fd.get("newPassword")),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setMsg(t("settingsSub.passwordOk"));
    (e.target as HTMLFormElement).reset();
  }

  return (
    <>
      <PageHeader
        title={t("settingsCenter.security")}
        subtitle={t("settingsCenter.securityPageSubtitle")}
      />

      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-bold text-ink">
            {t("settingsCenter.securityLinks")}
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/journal?category=logins"
                className="font-semibold text-brand hover:underline"
              >
                {t("settingsCenter.linkLoginHistory")} →
              </Link>
              <p className="mt-0.5 text-muted">
                {t("settingsCenter.linkLoginHistoryDesc")}
              </p>
            </li>
            <li>
              <Link
                href="/notifications"
                className="font-semibold text-brand hover:underline"
              >
                {t("settingsCenter.linkSecurityNotifs")} →
              </Link>
              <p className="mt-0.5 text-muted">
                {t("settingsCenter.linkSecurityNotifsDesc")}
              </p>
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-bold text-ink">
            {t("common.changePassword")}
          </h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <FieldLabel>{t("settingsSub.currentPassword")}</FieldLabel>
              <input name="currentPassword" type="password" required />
            </div>
            <div>
              <FieldLabel>{t("settingsSub.newPassword")}</FieldLabel>
              <input
                name="newPassword"
                type="password"
                required
                minLength={4}
              />
            </div>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            {msg ? <p className="text-sm text-success">{msg}</p> : null}
            <Button type="submit">{t("settingsSub.save")}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
