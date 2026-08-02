"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";

type ExportPeriod = "today" | "week" | "month" | "custom";

type StoreOpt = { id: string; name: string };

function downloadExport(params: {
  type: string;
  period?: ExportPeriod;
  storeId?: string;
  from?: string;
  to?: string;
}) {
  const qs = new URLSearchParams({ type: params.type });
  if (params.period && params.period !== "custom") qs.set("period", params.period);
  if (params.period === "custom" && params.from) qs.set("from", params.from);
  if (params.period === "custom" && params.to) qs.set("to", params.to);
  if (params.storeId) qs.set("storeId", params.storeId);
  window.location.href = `/api/export?${qs.toString()}`;
}

export default function ReportsPage() {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [storeId, setStoreId] = useState("");
  const [period, setPeriod] = useState<ExportPeriod>("week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setStores(
          list.map((s: { id: string; name: string }) => ({
            id: s.id,
            name: s.name,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const run = useCallback((key: string, fn: () => void) => {
    setBusy(key);
    fn();
    window.setTimeout(() => setBusy(null), 1200);
  }, []);

  const common = {
    storeId: storeId || undefined,
    period,
    from: period === "custom" ? from : undefined,
    to: period === "custom" ? to : undefined,
  };

  return (
    <ModuleWorkspace
      title={t("reportsPage.title")}
      subtitle={t("reportsPage.subtitle")}
    >
      <ModuleSection title={t("reportsPage.filtersTitle")}>
        <Card className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <FieldLabel>{t("reportsPage.storeFilter")}</FieldLabel>
              <select
                className="w-full"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              >
                <option value="">{t("reportsPage.allStores")}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{t("reportsPage.periodLabel")}</FieldLabel>
              <select
                className="w-full"
                value={period}
                onChange={(e) => setPeriod(e.target.value as ExportPeriod)}
              >
                <option value="today">{t("reportsPage.periodToday")}</option>
                <option value="week">{t("reportsPage.periodWeek")}</option>
                <option value="month">{t("reportsPage.periodMonth")}</option>
                <option value="custom">{t("reportsPage.periodCustom")}</option>
              </select>
            </div>
            {period === "custom" ? (
              <>
                <div>
                  <FieldLabel>{t("reportsPage.from")}</FieldLabel>
                  <input
                    type="date"
                    className="w-full"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>{t("reportsPage.to")}</FieldLabel>
                  <input
                    type="date"
                    className="w-full"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <p className="text-sm text-muted">{t("reportsPage.formatHint")}</p>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.salesExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.salesHint")}</p>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "sales"}
            onClick={() =>
              run("sales", () => downloadExport({ type: "sales", ...common }))
            }
          >
            {t("reportsPage.exportSalesCsv")}
          </Button>
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
              onClick={() => run("products", () => downloadExport({ type: "products" }))}
            >
              {t("reportsPage.exportProducts")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              disabled={busy === "expenses"}
              onClick={() =>
                run("expenses", () =>
                  downloadExport({ type: "expenses", ...common })
                )
              }
            >
              {t("reportsPage.exportExpenses")}
            </Button>
          </div>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.analyticsExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.analyticsHint")}</p>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "analytics"}
            onClick={() =>
              run("analytics", () =>
                downloadExport({ type: "analytics", ...common })
              )
            }
          >
            {t("reportsPage.exportAnalyticsCsv")}
          </Button>
          <p className="text-xs text-muted">{t("reportsPage.dailyDeferred")}</p>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
