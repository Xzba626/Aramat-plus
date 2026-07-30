"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useI18n } from "@/components/i18n/i18n-provider";

export default function WarehouseStub({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  const { t } = useI18n();

  return (
    <div>
      <PageHeader title={title} subtitle={t("wh.centralWarehouse")} />
      <Card className="max-w-xl p-6">
        <p className="text-sm text-muted">{description}</p>
        {href ? (
          <Link
            href={href}
            className="mt-4 inline-flex text-sm font-semibold text-brand hover:underline"
          >
            {linkLabel ?? t("wh.open")}
          </Link>
        ) : null}
      </Card>
    </div>
  );
}
