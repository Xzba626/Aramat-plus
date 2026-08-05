"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, FieldLabel } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ModuleSection,
  ModuleWorkspace,
} from "@/components/ui/module-workspace";
import { useI18n } from "@/components/i18n/i18n-provider";

type ExportPeriod = "today" | "week" | "month" | "year" | "custom";

type StoreOpt = { id: string; name: string };

type BlockFilters = {
  storeId: string;
  period: ExportPeriod;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: BlockFilters = {
  storeId: "",
  period: "month",
  from: "",
  to: "",
};

function downloadExport(params: {
  type: string;
  period?: ExportPeriod;
  storeId?: string;
  from?: string;
  to?: string;
  lang?: string;
}) {
  const qs = new URLSearchParams({ type: params.type });
  if (params.period && params.period !== "custom") {
    qs.set("period", params.period);
  }
  if (params.period === "custom" && params.from) qs.set("from", params.from);
  if (params.period === "custom" && params.to) qs.set("to", params.to);
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.lang) qs.set("lang", params.lang);
  window.location.href = `/api/export?${qs.toString()}`;
}

function ReportScopeControls({
  stores,
  value,
  onChange,
  showPeriod,
}: {
  stores: StoreOpt[];
  value: BlockFilters;
  onChange: (next: BlockFilters) => void;
  /** Catalog products export has no date range */
  showPeriod?: boolean;
}) {
  const { t } = useI18n();
  const withPeriod = showPeriod !== false;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <FieldLabel>{t("reportsPage.storeFilter")}</FieldLabel>
        <select
          className="w-full"
          value={value.storeId}
          onChange={(e) => onChange({ ...value, storeId: e.target.value })}
        >
          <option value="">{t("reportsPage.allStores")}</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {withPeriod ? (
        <>
          <div>
            <FieldLabel>{t("reportsPage.periodLabel")}</FieldLabel>
            <select
              className="w-full"
              value={value.period}
              onChange={(e) =>
                onChange({
                  ...value,
                  period: e.target.value as ExportPeriod,
                })
              }
            >
              <option value="today">{t("reportsPage.periodToday")}</option>
              <option value="week">{t("reportsPage.periodWeek")}</option>
              <option value="month">{t("reportsPage.periodMonth")}</option>
              <option value="year">{t("reportsPage.periodYear")}</option>
              <option value="custom">{t("reportsPage.periodCustom")}</option>
            </select>
          </div>
          {value.period === "custom" ? (
            <>
              <div>
                <FieldLabel>{t("reportsPage.from")}</FieldLabel>
                <input
                  type="date"
                  className="w-full"
                  value={value.from}
                  onChange={(e) =>
                    onChange({ ...value, from: e.target.value })
                  }
                />
              </div>
              <div>
                <FieldLabel>{t("reportsPage.to")}</FieldLabel>
                <input
                  type="date"
                  className="w-full"
                  value={value.to}
                  onChange={(e) => onChange({ ...value, to: e.target.value })}
                />
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [salesFilters, setSalesFilters] = useState<BlockFilters>(DEFAULT_FILTERS);
  const [expensesFilters, setExpensesFilters] =
    useState<BlockFilters>(DEFAULT_FILTERS);
  const [analyticsFilters, setAnalyticsFilters] =
    useState<BlockFilters>(DEFAULT_FILTERS);
  const [productsStoreId, setProductsStoreId] = useState("");

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

  function scopeFrom(filters: BlockFilters) {
    return {
      storeId: filters.storeId || undefined,
      period: filters.period,
      from: filters.period === "custom" ? filters.from : undefined,
      to: filters.period === "custom" ? filters.to : undefined,
      lang: locale,
    };
  }

  return (
    <ModuleWorkspace
      title={t("reportsPage.title")}
      subtitle={t("reportsPage.subtitle")}
    >
      <ModuleSection title={t("reportsPage.salesExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.salesHint")}</p>
          <ReportScopeControls
            stores={stores}
            value={salesFilters}
            onChange={setSalesFilters}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "sales"}
            onClick={() =>
              run("sales", () =>
                downloadExport({ type: "sales", ...scopeFrom(salesFilters) })
              )
            }
          >
            {t("reportsPage.exportSalesCsv")}
          </Button>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.productsExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.productsHint")}</p>
          <ReportScopeControls
            stores={stores}
            value={{
              ...DEFAULT_FILTERS,
              storeId: productsStoreId,
            }}
            onChange={(next) => setProductsStoreId(next.storeId)}
            showPeriod={false}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "products"}
            onClick={() =>
              run("products", () =>
                downloadExport({
                  type: "products",
                  storeId: productsStoreId || undefined,
                  lang: locale,
                })
              )
            }
          >
            {t("reportsPage.exportProducts")}
          </Button>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.expensesExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.expensesHint")}</p>
          <ReportScopeControls
            stores={stores}
            value={expensesFilters}
            onChange={setExpensesFilters}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "expenses"}
            onClick={() =>
              run("expenses", () =>
                downloadExport({
                  type: "expenses",
                  ...scopeFrom(expensesFilters),
                })
              )
            }
          >
            {t("reportsPage.exportExpenses")}
          </Button>
        </Card>
      </ModuleSection>

      <ModuleSection title={t("reportsPage.analyticsExport")}>
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted">{t("reportsPage.analyticsHint")}</p>
          <ReportScopeControls
            stores={stores}
            value={analyticsFilters}
            onChange={setAnalyticsFilters}
          />
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={busy === "analytics"}
            onClick={() =>
              run("analytics", () =>
                downloadExport({
                  type: "analytics",
                  ...scopeFrom(analyticsFilters),
                })
              )
            }
          >
            {t("reportsPage.exportAnalyticsCsv")}
          </Button>
        </Card>
      </ModuleSection>
    </ModuleWorkspace>
  );
}
