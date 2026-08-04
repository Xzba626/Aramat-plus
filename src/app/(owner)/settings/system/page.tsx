"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Role } from "@prisma/client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/i18n-provider";

/**
 * Owner-only system / ops settings (wipe, references, deploy notes).
 */
export default function SystemSettingsPage() {
  const t = useT();
  const router = useRouter();
  const { data, status } = useSession();
  const role = data?.user?.role;

  useEffect(() => {
    if (status === "authenticated" && role && role !== Role.OWNER) {
      router.replace("/settings");
    }
  }, [status, role, router]);

  if (status === "loading") {
    return <p className="text-sm text-muted">{t("common.loading")}</p>;
  }

  if (role && role !== Role.OWNER) {
    return null;
  }

  const links = [
    {
      href: "/settings/references",
      titleKey: "settingsPage.references",
      descKey: "settingsPage.referencesDesc",
    },
    {
      href: "/settings/wipe",
      titleKey: "settingsPage.wipe",
      descKey: "settingsPage.wipeDesc",
      danger: true,
    },
  ];

  return (
    <>
      <PageHeader
        title={t("settingsCenter.system")}
        subtitle={t("settingsCenter.systemPageSubtitle")}
      />
      <div className="space-y-4">
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-bold text-ink">
            {t("settingsCenter.systemOps")}
          </h2>
          <div className="space-y-3">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-xl border border-border px-4 py-3 transition hover:border-brand/30"
              >
                <div
                  className={`text-sm font-bold ${
                    item.danger ? "text-danger" : "text-ink"
                  }`}
                >
                  {t(item.titleKey)}
                </div>
                <p className="mt-1 text-sm text-muted">{t(item.descKey)}</p>
              </Link>
            ))}
          </div>
        </Card>
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-bold text-ink">
            {t("settingsCenter.systemEnvTitle")}
          </h2>
          <p className="text-sm text-muted">
            {t("settingsCenter.systemEnvBody")}
          </p>
        </Card>
      </div>
    </>
  );
}
