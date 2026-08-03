import { z } from "zod";
import { ExpensePeriodicity } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager, scopedStoreId } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createExpense,
  listExpenses,
} from "@/lib/services/expense.service";

const createSchema = z.object({
  expenseTypeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  storeId: z.string().min(1).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  incurredAt: z.string().datetime().optional().nullable(),
  periodicity: z.nativeEnum(ExpensePeriodicity).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  replacesExpenseId: z.string().min(1).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const requested =
      new URL(req.url).searchParams.get("storeId") ?? undefined;
    const scope = scopedStoreId(user!);
    const storeId =
      scope === undefined
        ? requested
        : scope === null
          ? "__none__"
          : scope;
    return jsonOk(
      await listExpenses(user!.companyId, { storeId, limit: 100 })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = createSchema.parse(await req.json());
    const row = await createExpense({
      companyId: user!.companyId,
      createdById: user!.id,
      expenseTypeId: body.expenseTypeId,
      amount: body.amount,
      storeId: body.storeId,
      description: body.description ?? undefined,
      incurredAt: body.incurredAt ? new Date(body.incurredAt) : undefined,
      periodicity: body.periodicity,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      replacesExpenseId: body.replacesExpenseId,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
