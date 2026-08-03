import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requireStoreAccess,
  scopedStoreId,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createStoreReturnIn,
  listStoreReturnIns,
} from "@/lib/services/warehouse-return.service";

const returnInSchema = z.object({
  storeId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const scope = scopedStoreId(user!);
    return jsonOk(
      await listStoreReturnIns(user!.companyId, {
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
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const body = returnInSchema.parse(await req.json());
    const scopeDenied = requireStoreAccess(user!, body.storeId);
    if (scopeDenied) return scopeDenied;

    const result = await createStoreReturnIn({
      companyId: user!.companyId,
      storeId: body.storeId,
      createdById: user!.id,
      reason: body.reason ?? undefined,
      items: body.items,
    });

    return jsonOk(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
