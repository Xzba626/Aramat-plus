import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import {
  getAnalyticsBreakdown,
  type AnalyticsPeriod,
} from "@/lib/services/analytics.service";

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

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

/** Export CSV: ?type=products|sales|expenses|analytics&period=today|week|month&from=&to=&storeId= */
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
        "id,name,sku,barcode,salePrice,defaultCost,category,type,brand,active",
        ...rows.map((p) =>
          [
            p.id,
            p.name,
            p.sku,
            p.barcode,
            decimalToNumber(p.salePrice),
            p.defaultCostPerUnit != null
              ? decimalToNumber(p.defaultCostPerUnit)
              : "",
            p.category?.name,
            p.productType?.name,
            p.brand?.name,
            p.isActive ? 1 : 0,
          ]
            .map(csvEscape)
            .join(",")
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
        "id,createdAt,store,seller,status,total,items",
        ...rows.map((s) =>
          [
            s.id,
            s.createdAt.toISOString(),
            s.store.name,
            s.seller.name,
            s.status,
            decimalToNumber(s.total),
            s.items.length,
          ]
            .map(csvEscape)
            .join(",")
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
        "id,type,store,amount,periodicity,startsAt,endsAt,description",
        ...rows.map((e) =>
          [
            e.id,
            e.expenseType.name,
            e.store?.name,
            decimalToNumber(e.amount),
            e.periodicity,
            e.startsAt.toISOString(),
            e.endsAt?.toISOString() ?? "",
            e.description,
          ]
            .map(csvEscape)
            .join(",")
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
      lines = [
        "metric,value",
        `revenue,${storeId ? stores.reduce((a, s) => a + s.revenue, 0) : data.network.revenue}`,
        `cogs,${storeId ? stores.reduce((a, s) => a + s.cogs, 0) : data.network.cogs}`,
        `grossProfit,${storeId ? stores.reduce((a, s) => a + s.grossProfit, 0) : data.network.grossProfit}`,
        `expenses,${storeId ? stores.reduce((a, s) => a + s.expenses, 0) : data.network.expenses}`,
        `netProfit,${storeId ? stores.reduce((a, s) => a + s.netProfit, 0) : data.network.netProfit}`,
        `period,${periodLabel}`,
        `storeId,${storeId ?? "ALL"}`,
      ];
    } else {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const body = "\uFEFF" + lines.join("\n");
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
