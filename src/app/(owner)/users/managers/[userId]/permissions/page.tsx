"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ManagerPermissionsForm } from "@/components/settings/manager-permissions-form";
import { useT } from "@/components/i18n/i18n-provider";

export default function ManagerPermissionsPage() {
  const t = useT();
  const params = useParams();
  const userId = String(params.userId ?? "");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!userId) return;
    fetch("/api/users")
      .then((r) => r.json())
      .then((rows) => {
        if (!Array.isArray(rows)) return;
        const u = rows.find((x: { id: string }) => x.id === userId);
        if (u?.name) setName(u.name);
      })
      .catch(() => undefined);
  }, [userId]);

  return (
    <div>
      <PageHeader
        title={t("managerPerms.title")}
        subtitle={t("managerPerms.subtitle")}
        actions={
          <Link
            href="/users"
            className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
          >
            {t("common.back")}
          </Link>
        }
      />
      {userId ? (
        <ManagerPermissionsForm managerId={userId} managerName={name} />
      ) : null}
    </div>
  );
}
