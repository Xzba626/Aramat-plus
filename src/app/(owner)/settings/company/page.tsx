"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { MOCK_COMPANY } from "@/lib/ui-mocks";
import { useI18n } from "@/components/i18n/i18n-provider";

export default function CompanySettingsPage() {
  const { t } = useI18n();
  const [form, setForm] = useState(MOCK_COMPANY);
  const [msg, setMsg] = useState("");

  function onSave(e: FormEvent) {
    e.preventDefault();
    setMsg(t("settingsSub.save"));
  }

  return (
    <ModuleWorkspace
      title={t("settingsSub.company")}
      subtitle={t("settingsSub.companySubtitle")}
      tabs={[
        { id: "company", label: t("settingsSub.company"), href: "/settings/company" },
        { id: "hub", label: t("common.settings"), href: "/settings" },
        { id: "refs", label: t("settingsSub.references"), href: "/settings/references" },
        { id: "password", label: t("settingsSub.password"), href: "/settings/password" },
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
          <form onSubmit={onSave} className="space-y-3">
            {(
              [
                ["name", "settingsSub.name"],
                ["legalName", "settingsSub.name"],
                ["phone", "settingsSub.phone"],
                ["email", "storeDetail.email"],
                ["address", "settingsSub.address"],
                ["currency", "settingsSub.name"],
                ["timezone", "settingsSub.name"],
              ] as const
            ).map(([key, labelKey]) => (
              <div key={key}>
                <FieldLabel>{t(labelKey)}</FieldLabel>
                <input
                  className="w-full rounded-xl border border-border bg-page px-3 py-2.5 text-sm"
                  value={form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
            {msg ? <p className="text-sm text-success">{msg}</p> : null}
            <Button type="submit" fullWidth={false}>
              {t("settingsSub.save")}
            </Button>
          </form>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
