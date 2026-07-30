import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";

export async function createExpense(params: {
  companyId: string;
  createdById: string;
  expenseTypeId: string;
  amount: number;
  storeId?: string | null;
  description?: string;
  incurredAt?: Date;
}) {
  if (params.amount <= 0) throw new Error("VALIDATION_ERROR");

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

  const row = await prisma.expense.create({
    data: {
      expenseTypeId: params.expenseTypeId,
      amount: new Prisma.Decimal(params.amount),
      storeId: params.storeId ?? null,
      description: params.description?.trim() || null,
      createdById: params.createdById,
      incurredAt: params.incurredAt ?? new Date(),
    },
    include: {
      expenseType: { select: { id: true, name: true } },
      store: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    userId: params.createdById,
    companyId: params.companyId,
    action: "EXPENSE_CREATE",
    entityType: "Expense",
    entityId: row.id,
    comment: `${type.name} · ${params.amount}`,
    metadata: {
      storeId: params.storeId ?? null,
      amount: params.amount,
    },
  });

  return {
    id: row.id,
    amount: decimalToNumber(row.amount),
    description: row.description,
    incurredAt: row.incurredAt.toISOString(),
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
    orderBy: { incurredAt: "desc" },
    take: opts?.limit ?? 100,
  });

  return rows.map((r) => ({
    id: r.id,
    amount: decimalToNumber(r.amount),
    description: r.description,
    incurredAt: r.incurredAt.toISOString(),
    expenseType: r.expenseType,
    store: r.store,
    createdBy: r.createdBy.name,
  }));
}
