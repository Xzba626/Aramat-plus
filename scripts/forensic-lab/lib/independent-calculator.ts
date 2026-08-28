/**
 * Independent financial calculator — raw DB records only.
 * Does NOT import profit.service or analytics.service.
 */
import { PrismaClient } from "@prisma/client";
import { decimalToNumber } from "../../../src/lib/utils";

const prisma = new PrismaClient();

export type RawFinancials = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  saleCount: number;
  returnRevenueNet: number;
  returnCogsNet: number;
  expenseTotal: number;
  netProfit: number;
};

function money(n: number) {
  return Math.round(n * 100) / 100;
}

/** Sum Sale.total for COMPLETED + PARTIAL_RETURN sales in optional store filter. */
export async function rawSaleRevenue(params: {
  companyId: string;
  storeId?: string | null;
  from?: Date;
  to?: Date;
}): Promise<number> {
  const sales = await prisma.sale.findMany({
    where: {
      store: { companyId: params.companyId },
      ...(params.storeId ? { storeId: params.storeId } : {}),
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    },
    select: { total: true },
  });
  return money(
    sales.reduce((s, r) => s + decimalToNumber(r.total), 0)
  );
}

/** COGS = Σ(SaleItem.costPerUnit × quantity) for qualifying sales. */
export async function rawSaleCogs(params: {
  companyId: string;
  storeId?: string | null;
  from?: Date;
  to?: Date;
}): Promise<number> {
  const items = await prisma.saleItem.findMany({
    where: {
      sale: {
        store: { companyId: params.companyId },
        ...(params.storeId ? { storeId: params.storeId } : {}),
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
        ...(params.from || params.to
          ? {
              createdAt: {
                ...(params.from ? { gte: params.from } : {}),
                ...(params.to ? { lte: params.to } : {}),
              },
            }
          : {}),
      },
    },
    select: { costPerUnit: true, quantity: true },
  });
  return money(
    items.reduce(
      (s, it) =>
        s + decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity),
      0
    )
  );
}

/** Approved return lines — revenue and COGS reversal (discount-aware net unit price). */
export async function rawApprovedReturnNet(params: {
  companyId: string;
  storeId?: string | null;
}): Promise<{ revenue: number; cogs: number }> {
  const lines = await prisma.saleReturnItem.findMany({
    where: {
      return: {
        status: "APPROVED",
        sale: {
          store: { companyId: params.companyId },
          ...(params.storeId ? { storeId: params.storeId } : {}),
        },
      },
    },
    select: {
      quantity: true,
      costPerUnit: true,
      salePrice: true,
      return: {
        select: {
          sale: {
            select: { subtotal: true, total: true },
          },
        },
      },
    },
  });
  let revenue = 0;
  let cogs = 0;
  for (const line of lines) {
    const qty = decimalToNumber(line.quantity);
    const sale = line.return.sale;
    const sub = decimalToNumber(sale.subtotal);
    const netRatio = sub > 0 ? decimalToNumber(sale.total) / sub : 1;
    revenue += decimalToNumber(line.salePrice) * netRatio * qty;
    cogs += decimalToNumber(line.costPerUnit) * qty;
  }
  return { revenue: money(revenue), cogs: money(cogs) };
}

/** Expense sum for store (simple list, not daily allocation). */
export async function rawExpenseSum(params: {
  companyId: string;
  storeId?: string | null;
}): Promise<number> {
  const rows = await prisma.expense.findMany({
    where: {
      store: {
        companyId: params.companyId,
        ...(params.storeId ? { id: params.storeId } : {}),
      },
    },
    select: { amount: true },
  });
  return money(rows.reduce((s, e) => s + decimalToNumber(e.amount), 0));
}

export async function computeRawFinancials(params: {
  companyId: string;
  storeId?: string | null;
  from?: Date;
  to?: Date;
}): Promise<RawFinancials> {
  const grossRev = await rawSaleRevenue(params);
  const grossCogs = await rawSaleCogs(params);
  const ret = await rawApprovedReturnNet(params);
  const revenue = money(grossRev - ret.revenue);
  const cogs = money(grossCogs - ret.cogs);
  const expenseTotal = await rawExpenseSum(params);
  const saleCount = await prisma.sale.count({
    where: {
      store: { companyId: params.companyId },
      ...(params.storeId ? { storeId: params.storeId } : {}),
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
    },
  });
  return {
    revenue,
    cogs,
    grossProfit: money(revenue - cogs),
    saleCount,
    returnRevenueNet: ret.revenue,
    returnCogsNet: ret.cogs,
    expenseTotal,
    netProfit: money(revenue - cogs - expenseTotal),
  };
}

/** Detect phantom COGS: line_cogs ≈ sale.total with costPerUnit ≈ salePrice. */
export async function findPhantomCogsSales(companyId: string) {
  const rows = await prisma.$queryRaw<
    Array<{ sale_id: string; sale_total: number; line_cogs: number }>
  >`
    SELECT s.id AS sale_id,
           s.total::float AS sale_total,
           SUM(i."costPerUnit" * i.quantity)::float AS line_cogs
    FROM "Sale" s
    JOIN "SaleItem" i ON i."saleId" = s.id
    JOIN "Store" st ON st.id = s."storeId"
    WHERE st."companyId" = ${companyId}
      AND s.status IN ('COMPLETED', 'PARTIAL_RETURN')
    GROUP BY s.id, s.total
    HAVING ABS(SUM(i."costPerUnit" * i.quantity) - s.total) < 0.05
       AND s.total > 50
  `;
  return rows;
}

export async function disconnectIndependentCalc() {
  await prisma.$disconnect();
}
