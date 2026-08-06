import { ExpensePeriodicity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";
import { isPackagingExpenseRow } from "@/lib/packaging-expense";

export type ExpensePeriodicityValue = ExpensePeriodicity;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = startOfDay(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Daily share of one expense record for calendar day `day`. */
export function dailyShareForExpense(
  expense: {
    amount: Prisma.Decimal | number | string;
    periodicity: ExpensePeriodicity;
    startsAt: Date;
    endsAt: Date | null;
    incurredAt: Date;
  },
  day: Date
): number {
  const dayStart = startOfDay(day);
  const amount = decimalToNumber(expense.amount);
  const starts = startOfDay(expense.startsAt);
  const ends = expense.endsAt ? endOfDay(expense.endsAt) : null;

  if (dayStart < starts) return 0;
  if (ends && dayStart > ends) return 0;

  switch (expense.periodicity) {
    case ExpensePeriodicity.ONCE:
      return sameCalendarDay(expense.incurredAt, dayStart) ||
        sameCalendarDay(expense.startsAt, dayStart)
        ? amount
        : 0;
    case ExpensePeriodicity.DAILY:
      return amount;
    case ExpensePeriodicity.WEEKLY:
      return amount / 7;
    case ExpensePeriodicity.MONTHLY:
      return amount / daysInMonth(dayStart);
    default:
      return 0;
  }
}

type ExpenseRow = {
  id: string;
  amount: Prisma.Decimal;
  periodicity: ExpensePeriodicity;
  startsAt: Date;
  endsAt: Date | null;
  incurredAt: Date;
  storeId: string | null;
  expenseTypeName: string;
  description: string | null;
};

async function loadActiveExpenses(
  companyId: string,
  rangeStart: Date,
  rangeEnd: Date,
  storeId?: string | null
): Promise<ExpenseRow[]> {
  const rows = await prisma.expense.findMany({
    where: {
      startsAt: { lte: endOfDay(rangeEnd) },
      AND: [
        {
          OR: [{ endsAt: null }, { endsAt: { gte: startOfDay(rangeStart) } }],
        },
        storeId
          ? { storeId, store: { companyId } }
          : {
              OR: [
                { store: { companyId } },
                { createdBy: { companyId }, storeId: null },
              ],
            },
      ],
    },
    select: {
      id: true,
      amount: true,
      periodicity: true,
      startsAt: true,
      endsAt: true,
      incurredAt: true,
      storeId: true,
      description: true,
      expenseType: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    periodicity: r.periodicity,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    incurredAt: r.incurredAt,
    storeId: r.storeId,
    expenseTypeName: r.expenseType.name,
    description: r.description,
  }));
}

/** Sum of daily-allocated expenses for [from, to] inclusive calendar days. */
export async function sumAllocatedExpenses(params: {
  companyId: string;
  from: Date;
  to: Date;
  storeId?: string | null;
}): Promise<{
  total: number;
  packaging: number;
  operational: number;
  byStore: Map<string | null, number>;
  byStorePackaging: Map<string | null, number>;
  byStoreOperational: Map<string | null, number>;
  byDay: Map<string, number>;
  byDayPackaging: Map<string, number>;
  byDayOperational: Map<string, number>;
}> {
  const from = startOfDay(params.from);
  const to = startOfDay(params.to);
  const rows = await loadActiveExpenses(
    params.companyId,
    from,
    to,
    params.storeId
  );

  const byStore = new Map<string | null, number>();
  const byStorePackaging = new Map<string | null, number>();
  const byStoreOperational = new Map<string | null, number>();
  const byDay = new Map<string, number>();
  const byDayPackaging = new Map<string, number>();
  const byDayOperational = new Map<string, number>();
  let total = 0;
  let packaging = 0;
  let operational = 0;

  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
    const day = new Date(t);
    const key = day.toISOString().slice(0, 10);
    let daySum = 0;
    let dayPack = 0;
    let dayOps = 0;
    for (const e of rows) {
      if (params.storeId != null && e.storeId !== params.storeId) continue;
      const share = dailyShareForExpense(e, day);
      if (share <= 0) continue;
      daySum += share;
      byStore.set(e.storeId, (byStore.get(e.storeId) ?? 0) + share);
      if (
        isPackagingExpenseRow({
          expenseTypeName: e.expenseTypeName,
          description: e.description,
        })
      ) {
        dayPack += share;
        packaging += share;
        byStorePackaging.set(
          e.storeId,
          (byStorePackaging.get(e.storeId) ?? 0) + share
        );
      } else {
        dayOps += share;
        operational += share;
        byStoreOperational.set(
          e.storeId,
          (byStoreOperational.get(e.storeId) ?? 0) + share
        );
      }
    }
    byDay.set(key, Math.round(daySum * 100) / 100);
    byDayPackaging.set(key, Math.round(dayPack * 100) / 100);
    byDayOperational.set(key, Math.round(dayOps * 100) / 100);
    total += daySum;
  }

  return {
    total: Math.round(total * 100) / 100,
    packaging: Math.round(packaging * 100) / 100,
    operational: Math.round(operational * 100) / 100,
    byStore,
    byStorePackaging,
    byStoreOperational,
    byDay,
    byDayPackaging,
    byDayOperational,
  };
}

/** Expenses that contribute to P&L in [from, to], with period-allocated amounts. */
export async function listAllocatedExpenseItems(params: {
  companyId: string;
  from: Date;
  to: Date;
  storeId?: string | null;
}): Promise<
  Array<{
    id: string;
    amount: number;
    allocatedAmount: number;
    type: string;
    store: string | null;
    description: string | null;
    periodicity: ExpensePeriodicity;
    startsAt: string;
    endsAt: string | null;
    incurredAt: string;
  }>
> {
  const from = startOfDay(params.from);
  const to = startOfDay(params.to);
  const rows = await prisma.expense.findMany({
    where: {
      startsAt: { lte: endOfDay(to) },
      AND: [
        {
          OR: [{ endsAt: null }, { endsAt: { gte: startOfDay(from) } }],
        },
        params.storeId
          ? { storeId: params.storeId, store: { companyId: params.companyId } }
          : {
              OR: [
                { store: { companyId: params.companyId } },
                { createdBy: { companyId: params.companyId }, storeId: null },
              ],
            },
      ],
    },
    include: {
      expenseType: { select: { name: true } },
      store: { select: { name: true } },
    },
    orderBy: [{ incurredAt: "desc" }, { startsAt: "desc" }],
    take: 200,
  });

  const items: Array<{
    id: string;
    amount: number;
    allocatedAmount: number;
    type: string;
    store: string | null;
    description: string | null;
    periodicity: ExpensePeriodicity;
    startsAt: string;
    endsAt: string | null;
    incurredAt: string;
  }> = [];

  for (const r of rows) {
    let allocated = 0;
    for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
      allocated += dailyShareForExpense(
        {
          amount: r.amount,
          periodicity: r.periodicity,
          startsAt: r.startsAt,
          endsAt: r.endsAt,
          incurredAt: r.incurredAt,
        },
        new Date(t)
      );
    }
    allocated = Math.round(allocated * 100) / 100;
    if (allocated <= 0) continue;
    items.push({
      id: r.id,
      amount: decimalToNumber(r.amount),
      allocatedAmount: allocated,
      type: r.expenseType.name,
      store: r.store?.name ?? null,
      description: r.description,
      periodicity: r.periodicity,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      incurredAt: r.incurredAt.toISOString(),
    });
  }

  return items;
}

export async function createExpense(params: {
  companyId: string;
  createdById: string;
  expenseTypeId: string;
  amount: number;
  storeId?: string | null;
  description?: string;
  incurredAt?: Date;
  periodicity?: ExpensePeriodicity;
  startsAt?: Date;
  endsAt?: Date | null;
  /** When changing a monthly rate: close previous open expense of same type+store. */
  replacesExpenseId?: string | null;
}) {
  if (params.amount <= 0) throw new Error("VALIDATION_ERROR");

  const periodicity = params.periodicity ?? ExpensePeriodicity.ONCE;
  const startsAt = startOfDay(params.startsAt ?? params.incurredAt ?? new Date());
  const incurredAt = params.incurredAt ?? startsAt;

  const type = await prisma.expenseType.findFirst({
    where: { id: params.expenseTypeId, companyId: params.companyId },
  });
  if (!type) throw new Error("NOT_FOUND");

  if (params.storeId) {
    const store = await prisma.store.findFirst({
      where: { id: params.storeId, companyId: params.companyId },
    });
    if (!store) throw new Error("STORE_NOT_FOUND");
  }

  if (periodicity !== ExpensePeriodicity.ONCE && !params.storeId) {
    throw new Error("STORE_REQUIRED_FOR_RECURRING");
  }

  const row = await prisma.$transaction(
    async (tx) => {
      if (params.replacesExpenseId) {
        const prev = await tx.expense.findFirst({
          where: {
            id: params.replacesExpenseId,
            OR: [
              { store: { companyId: params.companyId } },
              { createdBy: { companyId: params.companyId } },
            ],
          },
        });
        if (prev && !prev.endsAt) {
          const closeDay = new Date(startsAt.getTime() - 86400000);
          await tx.expense.update({
            where: { id: prev.id },
            data: { endsAt: endOfDay(closeDay) },
          });
        }
      } else if (periodicity !== ExpensePeriodicity.ONCE && params.storeId) {
        const open = await tx.expense.findMany({
          where: {
            storeId: params.storeId,
            expenseTypeId: params.expenseTypeId,
            periodicity,
            endsAt: null,
            startsAt: { lt: startsAt },
          },
        });
        const closeDay = new Date(startsAt.getTime() - 86400000);
        for (const prev of open) {
          await tx.expense.update({
            where: { id: prev.id },
            data: { endsAt: endOfDay(closeDay) },
          });
        }
      }

      return tx.expense.create({
        data: {
          expenseTypeId: params.expenseTypeId,
          amount: new Prisma.Decimal(params.amount),
          storeId: params.storeId ?? null,
          description: params.description?.trim() || null,
          createdById: params.createdById,
          incurredAt,
          periodicity,
          startsAt,
          endsAt: params.endsAt ? endOfDay(params.endsAt) : null,
        },
        include: {
          expenseType: { select: { id: true, name: true } },
          store: { select: { id: true, name: true } },
        },
      });
    },
    { timeout: 20000 }
  );

  await logActivity({
    userId: params.createdById,
    companyId: params.companyId,
    action: "EXPENSE_CREATE",
    entityType: "Expense",
    entityId: row.id,
    comment: `${type.name} · ${params.amount} · ${periodicity}`,
    metadata: {
      storeId: params.storeId ?? null,
      amount: params.amount,
      periodicity,
      startsAt: startsAt.toISOString(),
      endsAt: params.endsAt?.toISOString() ?? null,
    },
  });

  return {
    id: row.id,
    amount: decimalToNumber(row.amount),
    description: row.description,
    incurredAt: row.incurredAt.toISOString(),
    periodicity: row.periodicity,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    expenseType: row.expenseType,
    store: row.store,
  };
}

export async function listExpenses(
  companyId: string,
  opts?: { storeId?: string; limit?: number }
) {
  const rows = await prisma.expense.findMany({
    where: {
      ...(opts?.storeId
        ? { storeId: opts.storeId, store: { companyId } }
        : {
            OR: [
              { store: { companyId } },
              { createdBy: { companyId }, storeId: null },
            ],
          }),
    },
    include: {
      expenseType: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: opts?.limit ?? 100,
  });

  return rows.map((r) => ({
    id: r.id,
    amount: decimalToNumber(r.amount),
    description: r.description,
    incurredAt: r.incurredAt.toISOString(),
    periodicity: r.periodicity,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt?.toISOString() ?? null,
    expenseType: r.expenseType,
    store: r.store,
    createdBy: r.createdBy.name,
  }));
}
