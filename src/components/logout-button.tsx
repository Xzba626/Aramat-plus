"use client";

import { signOut } from "next-auth/react";
import { useT } from "@/components/i18n/i18n-provider";

export function LogoutButton() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm font-semibold text-brand"
    >
      {t("common.logout")}
    </button>
  );
}
