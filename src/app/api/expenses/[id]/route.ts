import { z } from "zod";
import { ExpensePeriodicity } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { updateExpense, getExpenseById } from "@/lib/services/expense.service";
import { optionalPlainText } from "@/lib/validators";

const updateSchema = z.object({
  expenseTypeId: z.string().min(1).optional(),
  amount: z.coerce.number().positive().optional(),
  storeId: z.string().min(1).optional().nullable(),
  description: optionalPlainText(500).optional().nullable(),
  incurredAt: z.string().datetime().optional().nullable(),
  periodicity: z.nativeEnum(ExpensePeriodicity).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id } = await params;
    const existing = await getExpenseById(id, user!.companyId);
    if (!existing) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const body = updateSchema.parse(await req.json());
    const row = await updateExpense(id, {
      companyId: user!.companyId,
      updatedById: user!.id,
      expenseTypeId: body.expenseTypeId,
      amount: body.amount,
      storeId: body.storeId,
      description: body.description ?? undefined,
      incurredAt: body.incurredAt ? new Date(body.incurredAt) : undefined,
      periodicity: body.periodicity,
      startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
      endsAt: body.endsAt !== undefined
        ? body.endsAt
          ? new Date(body.endsAt)
          : null
        : undefined,
    });
    return jsonOk(row);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id } = await params;
    const row = await getExpenseById(id, user!.companyId);
    if (!row) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return jsonOk(row);
  } catch (err) {
    return handleApiError(err);
  }
}
