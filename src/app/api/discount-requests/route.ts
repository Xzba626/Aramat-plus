import { Role } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { handleApiError, jsonOk } from "@/lib/api";
import { createDiscountRequest } from "@/lib/services/discount-request.service";

const schema = z.object({
  amount: z.coerce.number().min(0),
  percent: z.coerce.number().min(0).max(100).optional(),
  reason: z.string().max(500).optional().nullable(),
  saleId: z.string().min(1).optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));
    if (
      user.role !== Role.SELLER &&
      user.role !== Role.OWNER &&
      user.role !== Role.MANAGER
    ) {
      return handleApiError(new Error("UNAUTHORIZED"));
    }

    const body = schema.parse(await req.json());
    const row = await createDiscountRequest({
      companyId: user.companyId,
      requesterId: user.id,
      amount: body.amount,
      percent: body.percent,
      reason: body.reason ?? undefined,
      saleId: body.saleId ?? undefined,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
