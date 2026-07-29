"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useT } from "@/components/i18n/i18n-provider";

/** @deprecated Prefer ModuleWorkspace — kept for any legacy imports */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const t = useT();
  return (
    <div>
      <PageHeader title={title} subtitle={t("common.erpSection")} />
      <Card className="max-w-xl p-6">
        <p className="text-sm text-muted">{description}</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
        >
          {t("common.home")}
        </Link>
      </Card>
    </div>
  );
}
