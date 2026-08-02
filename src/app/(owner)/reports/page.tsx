"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";

type ExportPeriod = "today" | "week" | "month";

function downloadExport(type: string, period?: ExportPeriod) {
  const qs = new URLSearchParams({ type });
  if (period) qs.set("period", period);
  window.location.href = `/api/export?${qs.toString()}`;
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback((key: string, fn: () => void) => {
    setBusy(key);
    fn();
    window.setTimeout(() => setBusy(null), 1200);
  }, []);

  return (
    <ModuleWorkspace
      title={t("reportsPage.title")}
      subtitle={t("reportsPage.subtitle")}
    >
      <ModuleSection title={t("reportsPage.salesExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.salesHint")}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "reportsPage.periodToday"],
                ["week", "reportsPage.periodWeek"],
                ["month", "reportsPage.periodMonth"],
              ] as const
            ).map(([period, labelKey]) => (
              <Button
                key={period}
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={busy === `sales-${period}`}
                onClick={() =>
                  run(`sales-${period}`, () =>
                    downloadExport("sales", period)
                  )
                }
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.catalogExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.catalogHint")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={busy === "products"}
              onClick={() => run("products", () => downloadExport("products"))}
            >
              {t("reportsPage.exportProducts")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={busy === "expenses"}
              onClick={() => run("expenses", () => downloadExport("expenses"))}
            >
              {t("reportsPage.exportExpenses")}
            </Button>
          </div>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.analyticsExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.analyticsHint")}</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["today", "reportsPage.periodToday"],
                ["week", "reportsPage.periodWeek"],
                ["month", "reportsPage.periodMonth"],
              ] as const
            ).map(([period, labelKey]) => (
              <Button
                key={`analytics-${period}`}
                type="button"
                variant="secondary"
                fullWidth={false}
                disabled={busy === `analytics-${period}`}
                onClick={() =>
                  run(`analytics-${period}`, () =>
                    downloadExport("analytics", period)
                  )
                }
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
