"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { Card } from "@/components/ui/card";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useT } from "@/components/i18n/i18n-provider";
import { settingsSectionsForRole } from "@/lib/settings-center";
import { cn } from "@/lib/utils";

export default function SettingsCenterPage() {
  const t = useT();
  const { data } = useSession();
  const role = (data?.user?.role as Role | undefined) ?? Role.OWNER;
  const sections = settingsSectionsForRole(role);

  return (
    <ModuleWorkspace
      title={t("settingsCenter.title")}
      subtitle={t("settingsCenter.subtitle")}
    >
      <ModuleSection title={t("settingsCenter.sections")}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Link key={section.id} href={section.href} className="block">
              <Card
                className={cn(
                  "h-full p-5 transition hover:border-brand/30",
                  section.danger && "border-danger/25"
                )}
              >
                <div className="text-sm font-bold text-ink">
                  {t(section.titleKey)}
                </div>
                <p className="mt-2 text-sm text-muted">
                  {t(section.descKey)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </ModuleSection>
      <p className="mt-4 text-sm text-muted">{t("settingsCenter.hubHint")}</p>
    </ModuleWorkspace>
  );
}
