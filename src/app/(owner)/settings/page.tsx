"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useT } from "@/components/i18n/i18n-provider";

export default function SettingsPage() {
  const t = useT();

  const cards = [
    {
      href: "/settings/password",
      titleKey: "settingsPage.password",
      descKey: "settingsPage.passwordDesc",
    },
    {
      href: "/settings/references",
      titleKey: "settingsPage.references",
      descKey: "settingsPage.referencesDesc",
    },
    {
      href: "/users",
      titleKey: "settingsPage.users",
      descKey: "settingsPage.usersDesc",
    },
    {
      href: "/notifications",
      titleKey: "settingsPage.notifications",
      descKey: "settingsPage.notificationsDesc",
    },
    {
      href: "/settings/company",
      titleKey: "settingsPage.company",
      descKey: "settingsPage.companyDesc",
    },
    {
      href: "/settings/wipe",
      titleKey: "settingsPage.wipe",
      descKey: "settingsPage.wipeDesc",
      danger: true,
    },
  ];

  return (
    <ModuleWorkspace
      title={t("settingsPage.title")}
      subtitle={t("settingsPage.subtitle")}
    >
      <ModuleSection title={t("settingsPage.sections")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link key={card.href} href={card.href}>
              <Card
                className={`h-full p-5 transition hover:border-brand/30 ${
                  "danger" in card && card.danger ? "border-danger/20" : ""
                }`}
              >
                <div className="text-sm font-bold text-ink">{t(card.titleKey)}</div>
                <p className="mt-2 text-sm text-muted">{t(card.descKey)}</p>
              </Card>
            </Link>
          ))}
        </div>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
