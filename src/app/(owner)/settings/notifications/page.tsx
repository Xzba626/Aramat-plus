"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { useT } from "@/components/i18n/i18n-provider";

export default function NotificationsSettingsPage() {
  const t = useT();

  return (
    <>
      <PageHeader
        title={t("settingsCenter.notifications")}
        subtitle={t("settingsCenter.notificationsPageSubtitle")}
      />
      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <p className="text-sm text-muted">
            {t("settingsCenter.notificationsBody")}
          </p>
          <Link
            href="/notifications"
            className="inline-flex text-sm font-semibold text-brand hover:underline"
          >
            {t("settingsCenter.openInbox")} →
          </Link>
        </Card>
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-bold text-ink">
            {t("settingsCenter.securityEventsTitle")}
          </h2>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted">
            <li>{t("settingsCenter.securityEventLogin")}</li>
            <li>{t("settingsCenter.securityEventPassword")}</li>
            <li>{t("settingsCenter.securityEventReset")}</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
