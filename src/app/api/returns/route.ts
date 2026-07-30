import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createSaleReturn,
  listSaleReturns,
} from "@/lib/services/sale-return.service";
import { z } from "zod";

const createSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
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
    return jsonOk(await listSaleReturns(user.companyId, limit));
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
      user.role !== Role.OWNER &&
      user.role !== Role.MANAGER
    ) {
      return handleApiError(new Error("UNAUTHORIZED"));
    }

    const body = createSchema.parse(await req.json());
    const row = await createSaleReturn({
      companyId: user.companyId,
      saleId: body.saleId,
      requesterId: user.id,
      reason: body.reason ?? undefined,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
