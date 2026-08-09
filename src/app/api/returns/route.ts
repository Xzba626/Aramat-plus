import { Role, ReturnReasonCode } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { isOwnerClass, requireOwnerOrManager, scopedStoreId } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createSaleReturn,
  listSaleReturns,
} from "@/lib/services/sale-return.service";
import { z } from "zod";
import { optionalPlainText } from "@/lib/validators";

const createSchema = z.object({
  saleId: z.string().min(1),
  reason: optionalPlainText(500),
  reasonCode: z.nativeEnum(ReturnReasonCode).optional().nullable(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .optional(),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const limit = Math.min(
      Number(new URL(req.url).searchParams.get("limit") || 100),
      200
    );
    const scope = scopedStoreId(user);
    return jsonOk(
      await listSaleReturns(user.companyId, limit, {
        storeId: scope === undefined ? undefined : scope,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    if (
      user.role !== Role.SELLER &&
      !isOwnerClass(user.role) &&
      user.role !== Role.MANAGER
    ) {
      return handleApiError(new Error("UNAUTHORIZED"));
    }

    const body = createSchema.parse(await req.json());
    if (!body.reasonCode && !body.reason?.trim()) {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }
    const row = await createSaleReturn({
      companyId: user.companyId,
      saleId: body.saleId,
      requesterId: user.id,
      reason: body.reason ?? undefined,
      reasonCode: body.reasonCode ?? undefined,
      items: body.items,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
