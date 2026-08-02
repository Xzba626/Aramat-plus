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

function salesPeriodStart(period: AnalyticsPeriod): Date {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "week") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setDate(d.getDate() - diff);
    return d;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Export CSV: ?type=products|sales|expenses|analytics&period=today|week|month (sales) */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const type = new URL(req.url).searchParams.get("type") || "products";
    const periodParam = new URL(req.url).searchParams.get("period");
    const period: AnalyticsPeriod =
      periodParam === "today" || periodParam === "week" || periodParam === "month"
        ? periodParam
        : "month";
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
      const from = salesPeriodStart(period);
      const rows = await prisma.sale.findMany({
        where: {
          store: { companyId },
          createdAt: { gte: from },
        },
        include: {
          store: true,
          seller: true,
          items: true,
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
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
          OR: [
            { store: { companyId } },
            { createdBy: { companyId } },
          ],
        },
        include: { expenseType: true, store: true },
        orderBy: { startsAt: "desc" },
        take: 2000,
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
      const data = await getAnalyticsBreakdown(companyId, period);
      lines = [
        "metric,value",
        `revenue,${data.network.revenue}`,
        `cogs,${data.network.cogs}`,
        `grossProfit,${data.network.grossProfit}`,
        `expenses,${data.network.expenses}`,
        `netProfit,${data.network.netProfit}`,
      ];
    } else {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const body = "\uFEFF" + lines.join("\n");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="aramat-${type}${type === "sales" || type === "analytics" ? `-${period}` : ""}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
