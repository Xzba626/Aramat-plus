import { getSessionUser } from "@/lib/session";
import {
  canViewWarehouseFinance,
  requireOwner,
  scopedStoreId,
} from "@/lib/rbac";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import {
  getAnalyticsBreakdown,
  analyticsPeriodFrom,
  type AnalyticsPeriod,
} from "@/lib/services/analytics.service";
import {
  exportTranslate,
  formatExportDateTime,
  formatExportPeriodicity,
  formatExportSaleStatus,
  formatExportYesNo,
  formatExpenseDescriptionForExport,
  resolveExportLocale,
} from "@/lib/export/csv";
import { buildXlsxBuffer, xlsxResponse } from "@/lib/export/xlsx";
import { labelProductType } from "@/lib/i18n/labels";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function resolveRange(url: URL): { from: Date; to: Date; periodLabel: string } {
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if (fromParam) {
    const from = startOfDay(new Date(fromParam));
    const to = toParam ? endOfDay(new Date(toParam)) : endOfDay(new Date());
    return { from, to, periodLabel: "custom" };
  }
  const periodParam = url.searchParams.get("period");
  const period: AnalyticsPeriod =
    periodParam === "today" ||
    periodParam === "week" ||
    periodParam === "month" ||
    periodParam === "year"
      ? periodParam
      : "month";
  const now = new Date();
  return {
    from: analyticsPeriodFrom(period, now),
    to: now,
    periodLabel: period,
  };
}

function periodLabelText(
  periodLabel: string,
  t: ReturnType<typeof exportTranslate>
): string {
  if (periodLabel === "today") return t("exportCsv.periodToday");
  if (periodLabel === "week") return t("exportCsv.periodWeek");
  if (periodLabel === "month") return t("exportCsv.periodMonth");
  if (periodLabel === "year") return t("exportCsv.periodYear");
  return t("exportCsv.periodCustom");
}

/** Export XLSX: ?type=products|sales|expenses|analytics&period=&from=&to=&storeId=&lang=ru|tj */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "products";
    const requestedStore = url.searchParams.get("storeId") || undefined;
    const scope = scopedStoreId(user!);
    const storeId =
      scope === undefined
        ? requestedStore
        : scope === null
          ? "__none__"
          : scope;
    const { from, to, periodLabel } = resolveRange(url);
    const companyId = user!.companyId;
    const locale = resolveExportLocale(req);
    const t = exportTranslate(locale);
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const creator = company?.name?.trim() || "Aramat Plus";

    const suffix =
      type === "sales" || type === "analytics" || type === "expenses"
        ? `-${periodLabel}`
        : "";
    const filename = `aramat-${type}${suffix}.xlsx`;

    if (type === "products") {
      const showCost = canViewWarehouseFinance(user!);
      const rows = await prisma.product.findMany({
        where: { companyId, kind: "STANDARD" },
        include: {
          category: true,
          productType: true,
          brand: true,
        },
        orderBy: { name: "asc" },
      });
      const columns = [
        { header: t("exportCsv.colName"), key: "name", width: 28 },
        { header: t("exportCsv.colSku"), key: "sku", width: 14 },
        { header: t("exportCsv.colBarcode"), key: "barcode", width: 16 },
        { header: t("exportCsv.colSalePrice"), key: "salePrice", width: 12 },
        ...(showCost
          ? [{ header: t("exportCsv.colCost"), key: "cost", width: 12 }]
          : []),
        { header: t("exportCsv.colCategory"), key: "category", width: 18 },
        { header: t("exportCsv.colType"), key: "type", width: 14 },
        { header: t("exportCsv.colBrand"), key: "brand", width: 16 },
        { header: t("exportCsv.colActive"), key: "active", width: 10 },
      ];
      const buffer = await buildXlsxBuffer({
        sheetName: t("exportCsv.sheetProducts"),
        creator,
        columns,
        rows: rows.map((p) => ({
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          salePrice: decimalToNumber(p.salePrice),
          ...(showCost
            ? {
                cost:
                  p.defaultCostPerUnit != null
                    ? decimalToNumber(p.defaultCostPerUnit)
                    : "",
              }
            : {}),
          category: p.category?.name ?? "",
          type: labelProductType(p.productType?.name, t),
          brand: p.brand?.name ?? "",
          active: formatExportYesNo(p.isActive, t),
        })),
        locale,
      });
      return xlsxResponse(buffer, filename);
    }

    if (type === "sales") {
      const rows = await prisma.sale.findMany({
        where: {
          store: { companyId, ...(storeId ? { id: storeId } : {}) },
          createdAt: { gte: from, lte: to },
        },
        include: {
          store: true,
          seller: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5000,
      });
      const buffer = await buildXlsxBuffer({
        sheetName: t("exportCsv.sheetSales"),
        creator,
        columns: [
          { header: t("exportCsv.colDateTime"), key: "dt", width: 24 },
          { header: t("exportCsv.colStore"), key: "store", width: 20 },
          { header: t("exportCsv.colSeller"), key: "seller", width: 18 },
          { header: t("exportCsv.colStatus"), key: "status", width: 14 },
          { header: t("exportCsv.colTotal"), key: "total", width: 12 },
          { header: t("exportCsv.colItems"), key: "items", width: 10 },
          { header: t("exportCsv.colTechId"), key: "id", width: 26 },
        ],
        rows: rows.map((s) => ({
          dt: formatExportDateTime(s.createdAt, locale),
          store: s.store.name,
          seller: s.seller.name,
          status: formatExportSaleStatus(s.status, t),
          total: decimalToNumber(s.total),
          items: s.items.length,
          id: s.id,
        })),
        locale,
      });
      return xlsxResponse(buffer, filename);
    }

    if (type === "expenses") {
      const rows = await prisma.expense.findMany({
        where: {
          AND: [
            {
              OR: [{ store: { companyId } }, { createdBy: { companyId } }],
            },
            ...(storeId ? [{ storeId }] : []),
            { startsAt: { lte: to } },
            {
              OR: [{ endsAt: null }, { endsAt: { gte: from } }],
            },
          ],
        },
        include: { expenseType: true, store: true },
        orderBy: { startsAt: "desc" },
        take: 5000,
      });
      const buffer = await buildXlsxBuffer({
        sheetName: t("exportCsv.sheetExpenses"),
        creator,
        columns: [
          { header: t("exportCsv.colExpenseType"), key: "type", width: 18 },
          { header: t("exportCsv.colStore"), key: "store", width: 18 },
          { header: t("exportCsv.colAmount"), key: "amount", width: 12 },
          {
            header: t("exportCsv.colPeriodicity"),
            key: "periodicity",
            width: 14,
          },
          { header: t("exportCsv.colStarts"), key: "starts", width: 22 },
          { header: t("exportCsv.colEnds"), key: "ends", width: 22 },
          {
            header: t("exportCsv.colDescription"),
            key: "description",
            width: 28,
          },
          { header: t("exportCsv.colTechId"), key: "id", width: 26 },
        ],
        rows: rows.map((e) => ({
          type: e.expenseType.name,
          store: e.store?.name ?? "",
          amount: decimalToNumber(e.amount),
          periodicity: formatExportPeriodicity(e.periodicity, t),
          starts: formatExportDateTime(e.startsAt, locale),
          ends: formatExportDateTime(e.endsAt, locale),
          description: formatExpenseDescriptionForExport(e.description, t),
          id: e.id,
        })),
        locale,
      });
      return xlsxResponse(buffer, filename);
    }

    if (type === "analytics") {
      const period: AnalyticsPeriod =
        periodLabel === "today" ||
        periodLabel === "week" ||
        periodLabel === "month" ||
        periodLabel === "year"
          ? periodLabel
          : "month";
      const customRange =
        periodLabel === "custom"
          ? { from, to }
          : undefined;
      const data = await getAnalyticsBreakdown(companyId, period, {
        storeId: storeId === "__none__" ? null : storeId,
        range: customRange,
      });
      const stores = storeId
        ? data.stores.filter((s) => s.id === storeId)
        : data.stores;
      const storeName = storeId
        ? (stores[0]?.name ?? storeId)
        : t("exportCsv.allStores");
      const revenue = storeId
        ? stores.reduce((a, s) => a + s.revenue, 0)
        : data.network.revenue;
      const showFinance = canViewWarehouseFinance(user!);
      const cogs = storeId
        ? stores.reduce((a, s) => a + s.cogs, 0)
        : data.network.cogs;
      const gross = storeId
        ? stores.reduce((a, s) => a + s.grossProfit, 0)
        : data.network.grossProfit;
      const expenses = storeId
        ? stores.reduce((a, s) => a + s.expenses, 0)
        : data.network.expenses;
      const net = storeId
        ? stores.reduce((a, s) => a + s.netProfit, 0)
        : data.network.netProfit;

      // Option A: Manager gets revenue (+ ops expenses) only — no COGS/margin/net.
      const rows = showFinance
        ? [
            { metric: t("exportCsv.metricRevenue"), value: revenue },
            { metric: t("exportCsv.metricCogs"), value: cogs },
            { metric: t("exportCsv.metricGross"), value: gross },
            { metric: t("exportCsv.metricExpenses"), value: expenses },
            { metric: t("exportCsv.metricNet"), value: net },
            {
              metric: t("exportCsv.metricPeriod"),
              value: periodLabelText(periodLabel, t),
            },
            { metric: t("exportCsv.metricStore"), value: storeName },
          ]
        : [
            { metric: t("exportCsv.metricRevenue"), value: revenue },
            { metric: t("exportCsv.metricExpenses"), value: expenses },
            {
              metric: t("exportCsv.metricPeriod"),
              value: periodLabelText(periodLabel, t),
            },
            { metric: t("exportCsv.metricStore"), value: storeName },
          ];

      const buffer = await buildXlsxBuffer({
        sheetName: t("exportCsv.sheetAnalytics"),
        creator,
        columns: [
          { header: t("exportCsv.colMetric"), key: "metric", width: 28 },
          { header: t("exportCsv.colValue"), key: "value", width: 24 },
        ],
        rows,
        locale,
      });
      return xlsxResponse(buffer, filename);
    }

    return handleApiError(new Error("VALIDATION_ERROR"));
  } catch (err) {
    return handleApiError(err);
  }
}
