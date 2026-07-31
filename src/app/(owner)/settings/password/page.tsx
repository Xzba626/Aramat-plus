"use client";

import { FormEvent, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/card";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

export default function ChangePasswordPage() {
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
      <PageHeader title={t("settingsSub.password")} />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <FieldLabel>{t("settingsSub.currentPassword")}</FieldLabel>
          <input name="currentPassword" type="password" required />
        </div>
        <div>
          <FieldLabel>{t("settingsSub.newPassword")}</FieldLabel>
          <input name="newPassword" type="password" required minLength={4} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {msg ? <p className="text-sm text-success">{msg}</p> : null}
        <Button type="submit">{t("settingsSub.save")}</Button>
      </form>
    </>
  );
}
