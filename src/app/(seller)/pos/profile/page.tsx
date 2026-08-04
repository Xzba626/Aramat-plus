"use client";

import { FormEvent, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PreferenceControls } from "@/components/preferences/preference-controls";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";

export default function PosProfilePage() {
  const { data: session, update } = useSession();
  const { t } = useI18n();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [nameMsg, setNameMsg] = useState("");

  async function onPasswordSubmit(e: FormEvent<HTMLFormElement>) {
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
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setMsg(t("pos.passwordChanged"));
    (e.target as HTMLFormElement).reset();
  }

  async function onNameSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNameMsg("");
    setError("");
    const res = await fetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t, "common.error"));
      return;
    }
    setName(data.name ?? name);
    setNameMsg(t("settingsSub.nameSaved"));
    void update({ name: data.name });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink">{t("pos.profile")}</h1>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-bold text-ink">
          {t("settingsSub.preferences")}
        </h2>
        <PreferenceControls layout="stack" showLabels />
      </Card>

      <Card className="p-4">
        <form onSubmit={onNameSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted">
              {t("pos.nameLabel")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-ink"
            />
          </div>
          <div>
            <p className="text-sm text-muted">{t("pos.loginLabel")}</p>
            <p className="font-semibold text-ink">{session?.user?.email}</p>
            <p className="mt-1 text-xs text-muted">{t("pos.loginHint")}</p>
          </div>
          {nameMsg ? <p className="text-sm text-success">{nameMsg}</p> : null}
          <Button type="submit" className="w-full">
            {t("common.save")}
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-ink">{t("common.changePassword")}</h2>
        <form onSubmit={onPasswordSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-muted">
              {t("pos.currentPassword")}
            </label>
            <input
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">
              {t("pos.newPassword")}
            </label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={4}
              className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-ink"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {msg ? <p className="text-sm text-success">{msg}</p> : null}
          <Button type="submit" className="w-full">
            {t("pos.savePassword")}
          </Button>
        </form>
      </Card>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-full rounded-xl border border-border px-4 py-3 text-sm font-semibold text-ink"
      >
        {t("pos.logout")}
      </button>
    </div>
  );
}
