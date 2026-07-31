"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { useI18n } from "@/components/i18n/i18n-provider";

export type WarehouseOverviewData = {
  warehouse: { id: string; name: string } | null;
  skuCount: number;
  productCount?: number;
  unitsTotal: number;
  batchCount: number;
  lowStockCount: number;
  totalCost: number;
  totalSaleValue: number;
  recentReceipts: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
  }>;
  recentTransfers: Array<{
    id: string;
    createdAt: string | Date;
    storeName: string;
    userName: string;
    itemCount: number;
  }>;
  recentReturns: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
  }>;
};

export function WarehouseOverviewClient({
  data,
  showFinance,
}: {
  data: WarehouseOverviewData;
  showFinance: boolean;
}) {
  const { t, formatMoney, formatDateTime } = useI18n();

  const kpi: Array<{
    key: string;
    labelKey: string;
    hintKey?: string;
    value: string;
    tone?: "warning";
  }> = [
    ...(showFinance
      ? [
          {
            key: "sale",
            labelKey: "warehouse.kpiSaleValue",
            hintKey: "warehouseSaleValue",
            value: formatMoney(data.totalSaleValue),
          },
          {
            key: "cost",
            labelKey: "warehouse.kpiCostValue",
            hintKey: "warehouseCostValue",
            value: formatMoney(data.totalCost),
          },
        ]
      : []),
    {
      key: "sku",
      labelKey: "warehouse.kpiSku",
      hintKey: "warehouseSku",
      value: String(data.skuCount),
    },
    {
      key: "units",
      labelKey: "warehouse.kpiUnits",
      hintKey: "warehouseUnits",
      value: String(data.unitsTotal),
    },
    {
      key: "batches",
      labelKey: "warehouse.kpiBatches",
      hintKey: "warehouseBatches",
      value: String(data.batchCount),
    },
    {
      key: "products",
      labelKey: "warehouse.kpiProducts",
      hintKey: "warehouseProducts",
      value: String(data.productCount ?? 0),
    },
    {
      key: "low",
      labelKey: "warehouse.kpiLowStock",
      hintKey: "warehouseLowStock",
      value: String(data.lowStockCount),
      tone: "warning" as const,
    },
  ];

  const actions = [
    { href: "/warehouse/receive?tab=batch", labelKey: "warehouse.actionReceive" },
    { href: "/warehouse/transfers/new", labelKey: "warehouse.actionTransfer" },
    { href: "/warehouse/return-in", labelKey: "warehouse.actionReturn" },
    { href: "/warehouse/products", labelKey: "warehouse.actionCatalog" },
    { href: "/warehouse/stock", labelKey: "warehouse.actionStock" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("warehouse.overviewTitle")}
        subtitle={data.warehouse?.name ?? t("warehouse.noWarehouse")}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpi.map((c) => (
          <Card key={c.key} className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {c.hintKey ? (
                <HelpTip hintKey={c.hintKey}>{t(c.labelKey)}</HelpTip>
              ) : (
                t(c.labelKey)
              )}
            </div>
            {c.hintKey === "warehouseSaleValue" ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t("warehouse.kpiSaleValueHint")}
              </p>
            ) : null}
            {c.hintKey === "warehouseCostValue" ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t("warehouse.kpiCostValueHint")}
              </p>
            ) : null}
            {c.key === "sku" ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t("warehouse.kpiSkuHint")}
              </p>
            ) : null}
            {c.key === "units" ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t("warehouse.kpiUnitsHint")}
              </p>
            ) : null}
            {c.key === "low" ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t("warehouse.kpiLowStockHint")}
              </p>
            ) : null}
            <div
              className={`mt-2 text-2xl font-bold ${
                c.tone === "warning" ? "text-warning" : "text-ink"
              }`}
            >
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand ring-1 ring-brand/10 hover:bg-brand hover:text-white"
          >
            {t(a.labelKey)}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Feed
          title={t("warehouse.feedReceipts")}
          empty={t("warehouse.emptyReceipts")}
          items={data.recentReceipts.map((r) => ({
            id: r.id,
            line1: r.comment ?? t("warehouse.newBatch"),
            line2: `${r.userName || t("common.system")} · ${formatDateTime(r.createdAt)}`,
          }))}
        />
        <Feed
          title={t("warehouse.feedTransfers")}
          empty={t("warehouse.emptyTransfers")}
          items={data.recentTransfers.map((tr) => ({
            id: tr.id,
            line1: t("warehouse.transferLine", {
              store: tr.storeName || t("common.storeFallback"),
              count: tr.itemCount,
            }),
            line2: `${tr.userName || t("common.system")} · ${formatDateTime(tr.createdAt)}`,
          }))}
        />
        <Feed
          title={t("warehouse.feedReturns")}
          empty={t("warehouse.emptyReturns")}
          items={data.recentReturns.map((r) => ({
            id: r.id,
            line1: r.comment ?? t("warehouse.returnToWh"),
            line2: `${r.userName || t("common.system")} · ${formatDateTime(r.createdAt)}`,
          }))}
        />
      </div>
    </div>
  );
}

function Feed({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: { id: string; line1: string; line2: string }[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
        {title}
      </h2>
      <Card className="divide-y divide-border p-0">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted">{empty}</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <div className="text-sm font-semibold text-ink">{item.line1}</div>
              <div className="text-xs text-muted">{item.line2}</div>
            </div>
          ))
        )}
      </Card>
    </section>
  );
}
