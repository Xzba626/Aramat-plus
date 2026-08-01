"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export type WarehouseOverviewData = {
  warehouse: { id: string; name: string } | null;
  skuCount: number;
  productCount?: number;
  categoryCount?: number;
  unitsTotal: number;
  batchCount: number;
  lowStockCount: number;
  outOfStockCount?: number;
  totalPurchaseCost?: number;
  totalCost: number;
  totalSaleValue: number;
  potentialProfit?: number;
  lowStockItems?: Array<{
    id: string;
    name: string;
    quantity: number;
    minStock: number;
  }>;
  outOfStockItems?: Array<{
    id: string;
    name: string;
    quantity: number;
    minStock: number;
  }>;
  recentReceipts: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
    productName?: string;
    quantity?: number;
    supplierName?: string | null;
  }>;
  recentTransfers: Array<{
    id: string;
    createdAt: string | Date;
    storeName: string;
    userName: string;
    itemCount: number;
  }>;
  recentMovements?: Array<{
    id: string;
    createdAt: string | Date;
    action: string;
    userName: string;
    comment: string | null;
  }>;
  recentWriteOffs?: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
  }>;
};

type KpiTone = "profit" | "stock" | "info" | "warning" | "danger" | "neutral";

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
    hintTextKey?: string;
    value: string;
    tone: KpiTone;
  }> = [
    ...(showFinance
      ? [
          {
            key: "profit",
            labelKey: "warehouse.kpiPotentialProfit",
            hintKey: "warehousePotentialProfit",
            hintTextKey: "warehouse.kpiPotentialProfitHint",
            value: formatMoney(data.potentialProfit ?? 0),
            tone: "profit" as const,
          },
          {
            key: "whCost",
            labelKey: "warehouse.kpiWarehouseCost",
            hintKey: "warehouseCostValue",
            hintTextKey: "warehouse.kpiWarehouseCostHint",
            value: formatMoney(data.totalCost),
            tone: "stock" as const,
          },
          {
            key: "purchase",
            labelKey: "warehouse.kpiPurchaseCost",
            hintKey: "warehousePurchaseCost",
            hintTextKey: "warehouse.kpiPurchaseCostHint",
            value: formatMoney(data.totalPurchaseCost ?? 0),
            tone: "info" as const,
          },
        ]
      : []),
    {
      key: "sku",
      labelKey: "warehouse.kpiSku",
      hintKey: "warehouseSku",
      hintTextKey: "warehouse.kpiSkuHint",
      value: String(data.skuCount),
      tone: "neutral",
    },
    {
      key: "units",
      labelKey: "warehouse.kpiUnits",
      hintKey: "warehouseUnits",
      hintTextKey: "warehouse.kpiUnitsHint",
      value: String(data.unitsTotal),
      tone: "neutral",
    },
    {
      key: "categories",
      labelKey: "warehouse.kpiCategories",
      hintTextKey: "warehouse.kpiCategoriesHint",
      value: String(data.categoryCount ?? 0),
      tone: "neutral",
    },
    {
      key: "products",
      labelKey: "warehouse.kpiProducts",
      hintKey: "warehouseProducts",
      value: String(data.productCount ?? 0),
      tone: "neutral",
    },
    {
      key: "low",
      labelKey: "warehouse.kpiLowStock",
      hintKey: "warehouseLowStock",
      hintTextKey: "warehouse.kpiLowStockHint",
      value: String(data.lowStockCount),
      tone: "warning",
    },
    {
      key: "out",
      labelKey: "warehouse.kpiOutOfStock",
      hintKey: "warehouseOutOfStock",
      hintTextKey: "warehouse.kpiOutOfStockHint",
      value: String(data.outOfStockCount ?? 0),
      tone: "danger",
    },
  ];

  const actions = [
    { href: "/warehouse/receive", labelKey: "warehouse.actionReceive", primary: true },
    { href: "/warehouse/new", labelKey: "warehouse.actionNewProduct" },
    { href: "/warehouse/purchases", labelKey: "warehouse.actionPurchaseHistory" },
    { href: "/warehouse/stock", labelKey: "warehouse.actionStock" },
    { href: "/warehouse/products", labelKey: "warehouse.actionCatalog" },
    { href: "/warehouse/suppliers", labelKey: "warehouse.actionSuppliers" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("warehouse.overviewTitle")}
        subtitle={data.warehouse?.name ?? t("warehouse.noWarehouse")}
      />

      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={cn(
              "rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 transition",
              a.primary
                ? "bg-brand text-white ring-brand/20 hover:opacity-95"
                : "bg-brand-soft text-brand ring-brand/10 hover:bg-brand hover:text-white"
            )}
          >
            {t(a.labelKey)}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpi.map((c) => (
          <Card
            key={c.key}
            className={cn("border-l-4 p-4", toneBorder(c.tone))}
          >
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">
              {c.hintKey ? (
                <HelpTip hintKey={c.hintKey}>{t(c.labelKey)}</HelpTip>
              ) : (
                t(c.labelKey)
              )}
            </div>
            {c.hintTextKey ? (
              <p className="mt-1 text-xs font-normal normal-case tracking-normal text-muted">
                {t(c.hintTextKey)}
              </p>
            ) : null}
            <div className={cn("mt-2 text-2xl font-bold", toneText(c.tone))}>
              {c.value}
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AlertList
          title={t("warehouse.feedLowStock")}
          empty={t("warehouse.emptyLowStock")}
          tone="warning"
          items={(data.lowStockItems ?? []).map((p) => ({
            id: p.id,
            href: `/warehouse/${p.id}`,
            line1: p.name,
            line2: t("warehouse.alertQtyLine", {
              qty: p.quantity,
              min: p.minStock,
            }),
          }))}
        />
        <AlertList
          title={t("warehouse.feedOutOfStock")}
          empty={t("warehouse.emptyOutOfStock")}
          tone="danger"
          items={(data.outOfStockItems ?? []).map((p) => ({
            id: p.id,
            href: `/warehouse/${p.id}`,
            line1: p.name,
            line2: t("warehouse.alertOutLine"),
          }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <Feed
          title={t("warehouse.feedReceipts")}
          empty={t("warehouse.emptyReceipts")}
          href="/warehouse/purchases"
          items={data.recentReceipts.map((r) => ({
            id: r.id,
            line1:
              r.productName != null
                ? `${r.productName}${r.quantity != null ? ` · ${r.quantity}` : ""}`
                : (r.comment ?? t("warehouse.receiptDefault")),
            line2: [
              r.supplierName,
              r.userName || t("common.system"),
              formatDateTime(r.createdAt),
            ]
              .filter(Boolean)
              .join(" · "),
          }))}
        />
        <Feed
          title={t("warehouse.feedMovements")}
          empty={t("warehouse.emptyMovements")}
          href="/warehouse/history"
          items={(data.recentMovements ?? []).map((m) => ({
            id: m.id,
            line1: m.comment ?? movementLabel(m.action, t),
            line2: `${m.userName || t("common.system")} · ${formatDateTime(m.createdAt)}`,
          }))}
        />
        <Feed
          title={t("warehouse.feedWriteOffs")}
          empty={t("warehouse.emptyWriteOffs")}
          href="/warehouse/write-offs"
          items={(data.recentWriteOffs ?? []).map((r) => ({
            id: r.id,
            line1: r.comment ?? t("warehouse.writeOffDefault"),
            line2: `${r.userName || t("common.system")} · ${formatDateTime(r.createdAt)}`,
          }))}
        />
      </div>
    </div>
  );
}

function toneBorder(tone: KpiTone) {
  switch (tone) {
    case "profit":
      return "border-l-success";
    case "stock":
      return "border-l-info";
    case "info":
      return "border-l-info/70";
    case "warning":
      return "border-l-warning";
    case "danger":
      return "border-l-danger";
    default:
      return "border-l-border";
  }
}

function toneText(tone: KpiTone) {
  switch (tone) {
    case "profit":
      return "text-success";
    case "stock":
    case "info":
      return "text-info";
    case "warning":
      return "text-warning";
    case "danger":
      return "text-danger";
    default:
      return "text-ink";
  }
}

function movementLabel(action: string, t: (k: string) => string) {
  if (action === "BATCH_CREATE") return t("wh.actionBatch");
  if (action === "TRANSFER_CREATE") return t("wh.actionTransfer");
  if (action === "WAREHOUSE_RETURN_IN") return t("wh.actionReturn");
  if (action === "WRITE_OFF") return t("wh.actionWriteOff");
  return action;
}

function Feed({
  title,
  empty,
  items,
  href,
}: {
  title: string;
  empty: string;
  href?: string;
  items: { id: string; line1: string; line2: string }[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
          {title}
        </h2>
        {href ? (
          <Link href={href} className="text-xs font-semibold text-brand hover:underline">
            →
          </Link>
        ) : null}
      </div>
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

function AlertList({
  title,
  empty,
  items,
  tone,
}: {
  title: string;
  empty: string;
  tone: "warning" | "danger";
  items: { id: string; href: string; line1: string; line2: string }[];
}) {
  return (
    <section>
      <h2
        className={cn(
          "mb-3 text-sm font-bold uppercase tracking-wide",
          tone === "warning" ? "text-warning" : "text-danger"
        )}
      >
        {title}
      </h2>
      <Card className="divide-y divide-border p-0">
        {items.length === 0 ? (
          <div className="p-4 text-sm text-muted">{empty}</div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block px-4 py-3 hover:bg-surface/60"
            >
              <div className="text-sm font-semibold text-ink">{item.line1}</div>
              <div className="text-xs text-muted">{item.line2}</div>
            </Link>
          ))
        )}
      </Card>
    </section>
  );
}
