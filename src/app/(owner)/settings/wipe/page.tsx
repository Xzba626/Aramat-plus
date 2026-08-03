"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";
import { apiErrorMessage } from "@/lib/i18n/labels";
import { CRM_WIPE_PHRASE } from "@/lib/services/crm-wipe.service";

export default function SettingsWipePage() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [password, setPassword] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [ack, setAck] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [masterConfigured, setMasterConfigured] = useState(false);
  const [masterHint, setMasterHint] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/wipe")
      .then((r) => r.json())
      .then((d) => {
        if (d?.masterConfigured != null) {
          setMasterConfigured(Boolean(d.masterConfigured));
          setMasterHint(d.masterHint ?? null);
        }
      })
      .catch(() => {});
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!ack) {
      setError(t("wipe.needAck"));
      return;
    }
    if (phrase.trim() !== CRM_WIPE_PHRASE) {
      setError(t("wipe.phraseMismatch"));
      return;
    }
    if (masterConfigured && !masterPassword) {
      setError(t("wipe.needMasterPassword"));
      return;
    }
    setLoading(true);
    const res = await fetch("/api/settings/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        masterPassword: masterConfigured ? masterPassword : undefined,
        confirmPhrase: phrase.trim(),
        acknowledge: true,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(data.error, t));
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <ModuleWorkspace
      title={t("wipe.title")}
      subtitle={t("wipe.subtitle")}
      tabs={[
        { id: "hub", label: t("common.settings"), href: "/settings" },
        { id: "wipe", label: t("wipe.title"), href: "/settings/wipe" },
      ]}
    >
      <ModuleSection title={t("wipe.dangerZone")}>
        {done ? (
          <Card className="border-success/30 bg-success/5 p-5">
            <p className="font-semibold text-success">{t("wipe.done")}</p>
            <p className="mt-2 text-sm text-muted">{t("wipe.doneHint")}</p>
            <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-brand">
              {t("common.home")}
            </Link>
          </Card>
        ) : (
          <Card className="space-y-4 border-danger/30 p-5">
            <p className="text-sm text-muted">{t("wipe.keepHint")}</p>
            <ul className="list-inside list-disc text-sm text-muted">
              <li>{t("wipe.keepOwner")}</li>
              <li>{t("wipe.keepSettings")}</li>
              <li>{t("wipe.keepStructure")}</li>
            </ul>
            <p className="text-sm font-semibold text-danger">{t("wipe.wipeHint")}</p>

            {!masterConfigured ? (
              <p className="rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-ink">
                {t("wipe.setMasterCta")}{" "}
                <Link href="/settings/company" className="font-semibold text-brand">
                  {t("wipe.setMasterLink")}
                </Link>
              </p>
            ) : masterHint ? (
              <p className="text-xs text-muted">
                {t("wipe.masterHintLabel")}: {masterHint}
              </p>
            ) : null}

            {step === 1 ? (
              <Button type="button" variant="secondary" fullWidth={false} onClick={() => setStep(2)}>
                {t("wipe.start")}
              </Button>
            ) : null}

            {step >= 2 ? (
              <form onSubmit={onSubmit} className="max-w-md space-y-3">
                <div>
                  <FieldLabel>{t("wipe.password")}</FieldLabel>
                  <input
                    type="password"
                    className="w-full"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
                {masterConfigured ? (
                  <div>
                    <FieldLabel>{t("wipe.masterPassword")}</FieldLabel>
                    <input
                      type="password"
                      className="w-full"
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </div>
                ) : null}
                {step === 2 ? (
                  <Button
                    type="button"
                    fullWidth={false}
                    onClick={() => {
                      if (!password) {
                        setError(t("wipe.needPassword"));
                        return;
                      }
                      if (masterConfigured && !masterPassword) {
                        setError(t("wipe.needMasterPassword"));
                        return;
                      }
                      setError("");
                      setStep(3);
                    }}
                  >
                    {t("wipe.nextConfirm")}
                  </Button>
                ) : null}

                {step === 3 ? (
                  <>
                    <div>
                      <FieldLabel>
                        {t("wipe.typePhrase", { phrase: CRM_WIPE_PHRASE })}
                      </FieldLabel>
                      <input
                        className="w-full"
                        value={phrase}
                        onChange={(e) => setPhrase(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      <span>{t("wipe.ack")}</span>
                    </label>
                    {error ? <p className="text-sm text-danger">{error}</p> : null}
                    <Button type="submit" disabled={loading} variant="danger">
                      {loading ? t("wipe.working") : t("wipe.submit")}
                    </Button>
                  </>
                ) : null}
                {error && step < 3 ? <p className="text-sm text-danger">{error}</p> : null}
              </form>
            ) : null}
          </Card>
        )}
      </ModuleSection>
    </ModuleWorkspace>
  );
}
