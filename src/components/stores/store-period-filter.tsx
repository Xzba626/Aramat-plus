"use client";

import { useI18n } from "@/components/i18n/i18n-provider";
import type { StorePeriod } from "@/lib/services/store-period.service";
import { cn } from "@/lib/utils";

const PERIODS: StorePeriod[] = [
  "today",
  "yesterday",
  "week",
  "month",
  "year",
  "all",
];

const LABEL_KEYS: Record<StorePeriod, string> = {
  today: "storeDetail.periodToday",
  yesterday: "storeDetail.periodYesterday",
  week: "storeDetail.periodWeek",
  month: "storeDetail.periodMonth",
  year: "storeDetail.periodYear",
  all: "storeDetail.periodAll",
};

type Props = {
  period: StorePeriod;
  onChange: (p: StorePeriod) => void;
  className?: string;
};

export function StorePeriodFilter({ period, onChange, className }: Props) {
  const { t } = useI18n();

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
            period === p
              ? "border-brand bg-brand text-white"
              : "border-border bg-card text-muted hover:border-brand/40"
          )}
        >
          {t(LABEL_KEYS[p])}
        </button>
      ))}
    </div>
  );
}

export type { StorePeriod };
