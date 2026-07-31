"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { HelpTip } from "@/components/ui/help-tip";
import { useI18n } from "@/components/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import { labelAction } from "@/lib/i18n/labels";

export type WarehouseOverviewData = {
  warehouse: { id: string; name: string } | null;
  skuCount: number;
  productCount?: number;
  categoryCount?: number;
  unitsTotal: number;
  batchCount: number;
  lowStockCount: number;
  emptyStockCount?: number;
  totalCost: number;
  totalSaleValue: number;
  potentialProfit?: number;
  recentReceipts: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
    productName?: string;
    supplierName?: string | null;
    totalCost?: number | null;
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
  recentWriteOffs?: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    comment: string | null;
  }>;
  recentMovements?: Array<{
    id: string;
    createdAt: string | Date;
    userName: string;
    action: string;
    comment: string | null;
  }>;
  lowStockItems?: Array<{
    productId: string;
    name: string;
    quantity: number;
    minStock: number;
  }>;
  emptyStockItems?: Array<{
    productId: string;
    name: string;
  }>;
};

type KpiTone = "profit" | "stock" | "sale" | "warn" | "danger" | "neutral";

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
    tone: KpiTone;
    href?: string;
  }> = [
    ...(showFinance
      ? [
          {
            key: "profit",
            labelKey: "warehouse.kpiPotentialProfit",
            hintKey: "warehousePotentialProfit",
            value: formatMoney(data.potentialProfit ?? 0),
            tone: "profit" as const,
          },
          {
            key: "cost",
            labelKey: "warehouse.kpiCostValue",
            hintKey: "warehouseCostValue",
            value: formatMoney(data.totalCost),
            tone: "stock" as const,
          },
          {
            key: "sale",
            labelKey: "warehouse.kpiSaleValue",
            hintKey: "warehouseSaleValue",
            value: formatMoney(data.totalSaleValue),
            tone: "sale" as const,
          },
        ]
      : []),
    {
      key: "sku",
      labelKey: "warehouse.kpiSku",
      hintKey: "warehouseSku",
      value: String(data.skuCount),
      tone: "neutral",
    },
    {
      key: "units",
      labelKey: "warehouse.kpiUnits",
      hintKey: "warehouseUnits",
      value: String(data.unitsTotal),
      tone: "neutral",
    },
    {
      key: "categories",
      labelKey: "warehouse.kpiCategories",
      value: String(data.categoryCount ?? 0),
      tone: "neutral",
    },
    {
      key: "products",
      labelKey: "warehouse.kpiProducts",
      hintKey: "warehouseProducts",
      value: String(data.productCount ?? 0),
      tone: "neutral",
      href: "/warehouse/products",
    },
    {
      key: "low",
      labelKey: "warehouse.kpiLowStock",
      hintKey: "warehouseLowStock",
      value: String(data.lowStockCount),
      tone: "warn",
      href: "/warehouse/stock?status=low",
    },
    {
      key: "empty",
      labelKey: "warehouse.kpiEmptyStock",
      value: String(data.emptyStockCount ?? 0),
      tone: "danger",
      href: "/warehouse/stock?status=empty",
    },
  ];

  const actions = [
    { href: "/warehouse/receive", labelKey: "warehouse.actionReceive" },
    { href: "/warehouse/new", labelKey: "warehouse.actionNewProduct" },
    { href: "/warehouse/batches", labelKey: "warehouse.actionPurchaseHistory" },
    { href: "/warehouse/stock", labelKey: "warehouse.actionStock" },
    { href: "/warehouse/products", labelKey: "warehouse.actionCatalog" },
    { href: "/warehouse/suppliers", labelKey: "warehouse.actionSuppliers" },
    { href: "/warehouse/history", labelKey: "warehouse.actionHistory" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("warehouse.overviewTitle")}
        subtitle={data.warehouse?.name ?? t("warehouse.noWarehouse")}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpi.map((c) => {
          const body = (
            <Card className={cn("p-4", toneRing(c.tone))}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {c.hintKey ? (
                    <HelpTip hintKey={c.hintKey}>{t(c.labelKey)}</HelpTip>
                  ) : (
                    t(c.labelKey)
                  )}
                </div>
                <span className={cn("mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full", toneDot(c.tone))} />
              </div>
              <div className={cn("mt-2 text-2xl font-bold", toneText(c.tone))}>{c.value}</div>
            </Card>
          );
          return c.href ? (
            <Link key={c.key} href={c.href} className="block transition hover:opacity-90">
              {body}
            </Link>
          ) : (
            <div key={c.key}>{body}</div>
          );
        })}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <AlertList
          title={t("warehouse.feedLowStock")}
          empty={t("warehouse.emptyLowStock")}
          tone="warn"
          items={(data.lowStockItems ?? []).map((i) => ({
            id: i.productId,
            href: `/warehouse/${i.productId}`,
            line1: i.name,
            line2: `${i.quantity} ≤ ${i.minStock}`,
          }))}
        />
        <AlertList
          title={t("warehouse.feedEmptyStock")}
          empty={t("warehouse.emptyEmptyStock")}
          tone="danger"
          items={(data.emptyStockItems ?? []).map((i) => ({
            id: i.productId,
            href: `/warehouse/${i.productId}`,
            line1: i.name,
            line2: t("warehouse.outOfStock"),
          }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <Feed
          title={t("warehouse.feedReceipts")}
          empty={t("warehouse.emptyReceipts")}
          href="/warehouse/batches"
          items={data.recentReceipts.map((r) => ({
            id: r.id,
            line1: r.productName
              ? `${r.productName}${r.supplierName ? ` · ${r.supplierName}` : ""}`
              : r.comment ?? t("warehouse.newBatch"),
            line2: `${r.userName || t("common.system")} · ${formatDateTime(r.createdAt)}${
              showFinance && r.totalCost != null ? ` · ${formatMoney(r.totalCost)}` : ""
            }`,
          }))}
        />
        <Feed
          title={t("warehouse.feedTransfers")}
          empty={t("warehouse.emptyTransfers")}
          href="/warehouse/transfers"
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
          title={t("warehouse.feedWriteOffs")}
          empty={t("warehouse.emptyWriteOffs")}
          href="/warehouse/write-offs"
          items={(data.recentWriteOffs ?? []).map((w) => ({
            id: w.id,
            line1: w.comment ?? t("warehouse.writeOffFallback"),
            line2: `${w.userName || t("common.system")} · ${formatDateTime(w.createdAt)}`,
          }))}
        />
        <Feed
          title={t("warehouse.feedMovements")}
          empty={t("warehouse.emptyMovements")}
          href="/warehouse/history"
          items={(data.recentMovements ?? []).map((m) => ({
            id: m.id,
            line1: `${labelAction(m.action, t)}${m.comment ? ` · ${m.comment}` : ""}`,
            line2: `${m.userName || t("common.system")} · ${formatDateTime(m.createdAt)}`,
          }))}
        />
      </div>
    </div>
  );
}

function toneRing(tone: KpiTone) {
  if (tone === "profit") return "border-success/30 bg-success/5";
  if (tone === "stock") return "border-sky-500/30 bg-sky-500/5";
  if (tone === "sale") return "border-brand/20 bg-brand-soft/40";
  if (tone === "warn") return "border-warning/40 bg-warning/10";
  if (tone === "danger") return "border-danger/30 bg-danger/5";
  return "";
}

function toneDot(tone: KpiTone) {
  if (tone === "profit") return "bg-success";
  if (tone === "stock") return "bg-sky-500";
  if (tone === "sale") return "bg-brand";
  if (tone === "warn") return "bg-warning";
  if (tone === "danger") return "bg-danger";
  return "bg-muted";
}

function toneText(tone: KpiTone) {
  if (tone === "profit") return "text-success";
  if (tone === "stock") return "text-sky-700";
  if (tone === "sale") return "text-brand";
  if (tone === "warn") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "text-ink";
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
  items: Array<{ id: string; line1: string; line2: string }>;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {href ? (
          <Link href={href} className="text-xs font-semibold text-brand">
            →
          </Link>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id} className="border-b border-border pb-2 last:border-0 last:pb-0">
              <div className="text-sm font-medium text-ink">{i.line1}</div>
              <div className="text-xs text-muted">{i.line2}</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
  tone: "warn" | "danger";
  items: Array<{ id: string; href: string; line1: string; line2: string }>;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        tone === "warn" ? "border-warning/30" : "border-danger/30"
      )}
    >
      <h3 className="mb-3 text-sm font-bold text-ink">{title}</h3>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id}>
              <Link
                href={i.href}
                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-page"
              >
                <span className="truncate text-sm font-medium text-ink">{i.line1}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    tone === "warn" ? "text-warning" : "text-danger"
                  )}
                >
                  {i.line2}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
