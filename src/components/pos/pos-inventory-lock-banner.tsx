"use client";

import { useI18n } from "@/components/i18n/i18n-provider";

export function PosInventoryLockBanner() {
  const { t } = useI18n();
  return (
    <div
      className="mx-4 mt-3 rounded-xl border border-warning/40 bg-warning/15 px-4 py-3 text-sm font-medium text-ink"
      role="alert"
    >
      {t("errors.STORE_INVENTORY_IN_PROGRESS")}
    </div>
  );
}
