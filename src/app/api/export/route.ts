import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import {
  getAnalyticsBreakdown,
  type AnalyticsPeriod,
} from "@/lib/services/analytics.service";
import {
  buildCsvBody,
  csvRow,
  exportTranslate,
  formatExportDateTime,
  formatExportPeriodicity,
  formatExportSaleStatus,
  formatExportYesNo,
  resolveExportLocale,
} from "@/lib/export/csv";
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

function salesPeriodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  if (period === "today") return startOfDay(now);
  if (period === "week") {
    const d = startOfDay(now);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
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
  return {
    from: salesPeriodStart(period),
    to: new Date(),
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

/** Export CSV: ?type=products|sales|expenses|analytics&period=&from=&to=&storeId=&lang=ru|tj */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "products";
    const storeId = url.searchParams.get("storeId") || undefined;
    const { from, to, periodLabel } = resolveRange(url);
    const companyId = user!.companyId;
    const locale = resolveExportLocale(req);
    const t = exportTranslate(locale);
    let lines: string[] = [];

    if (type === "products") {
      const rows = await prisma.product.findMany({
        where: { companyId },
        include: {
          category: true,
          productType: true,
          brand: true,
        },
        orderBy: { name: "asc" },
      });
      lines = [
        csvRow([
          t("exportCsv.colName"),
          t("exportCsv.colSku"),
          t("exportCsv.colBarcode"),
          t("exportCsv.colSalePrice"),
          t("exportCsv.colCost"),
          t("exportCsv.colCategory"),
          t("exportCsv.colType"),
          t("exportCsv.colBrand"),
          t("exportCsv.colActive"),
        ]),
        ...rows.map((p) =>
          csvRow([
            p.name,
            p.sku,
            p.barcode,
            decimalToNumber(p.salePrice),
            p.defaultCostPerUnit != null
              ? decimalToNumber(p.defaultCostPerUnit)
              : "",
            p.category?.name ?? "",
            labelProductType(p.productType?.name, t),
            p.brand?.name ?? "",
            formatExportYesNo(p.isActive, t),
          ])
        ),
      ];
    } else if (type === "sales") {
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
      lines = [
        csvRow([
          t("exportCsv.colDateTime"),
          t("exportCsv.colStore"),
          t("exportCsv.colSeller"),
          t("exportCsv.colStatus"),
          t("exportCsv.colTotal"),
          t("exportCsv.colItems"),
          t("exportCsv.colTechId"),
        ]),
        ...rows.map((s) =>
          csvRow([
            formatExportDateTime(s.createdAt, locale),
            s.store.name,
            s.seller.name,
            formatExportSaleStatus(s.status, t),
            decimalToNumber(s.total),
            s.items.length,
            s.id,
          ])
        ),
      ];
    } else if (type === "expenses") {
      const rows = await prisma.expense.findMany({
        where: {
          AND: [
            {
              OR: [
                { store: { companyId } },
                { createdBy: { companyId } },
              ],
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
      lines = [
        csvRow([
          t("exportCsv.colExpenseType"),
          t("exportCsv.colStore"),
          t("exportCsv.colAmount"),
          t("exportCsv.colPeriodicity"),
          t("exportCsv.colStarts"),
          t("exportCsv.colEnds"),
          t("exportCsv.colDescription"),
          t("exportCsv.colTechId"),
        ]),
        ...rows.map((e) =>
          csvRow([
            e.expenseType.name,
            e.store?.name ?? "",
            decimalToNumber(e.amount),
            formatExportPeriodicity(e.periodicity, t),
            formatExportDateTime(e.startsAt, locale),
            formatExportDateTime(e.endsAt, locale),
            e.description ?? "",
            e.id,
          ])
        ),
      ];
    } else if (type === "analytics") {
      const period: AnalyticsPeriod =
        periodLabel === "today" ||
        periodLabel === "week" ||
        periodLabel === "month" ||
        periodLabel === "year"
          ? periodLabel
          : "month";
      const data = await getAnalyticsBreakdown(companyId, period);
      const stores = storeId
        ? data.stores.filter((s) => s.id === storeId)
        : data.stores;
      const storeName = storeId
        ? (stores[0]?.name ?? storeId)
        : t("exportCsv.allStores");
      const revenue = storeId
        ? stores.reduce((a, s) => a + s.revenue, 0)
        : data.network.revenue;
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

      lines = [
        csvRow([t("exportCsv.colMetric"), t("exportCsv.colValue")]),
        csvRow([t("exportCsv.metricRevenue"), revenue]),
        csvRow([t("exportCsv.metricCogs"), cogs]),
        csvRow([t("exportCsv.metricGross"), gross]),
        csvRow([t("exportCsv.metricExpenses"), expenses]),
        csvRow([t("exportCsv.metricNet"), net]),
        csvRow([t("exportCsv.metricPeriod"), periodLabelText(periodLabel, t)]),
        csvRow([t("exportCsv.metricStore"), storeName]),
      ];
    } else {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const body = buildCsvBody(lines);
    const suffix =
      type === "sales" || type === "analytics" || type === "expenses"
        ? `-${periodLabel}`
        : "";
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aramat-${type}${suffix}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
