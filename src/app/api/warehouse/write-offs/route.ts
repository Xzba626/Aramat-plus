import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createWarehouseWriteOff,
  listWarehouseWriteOffs,
} from "@/lib/services/write-off.service";

const createSchema = z.object({
  reason: z.string().min(1).max(500),
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
    const denied = requireOwner(user);
    if (denied) return denied;
    return jsonOk(await listWarehouseWriteOffs(user!.companyId));
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
    const result = await createWarehouseWriteOff({
      companyId: user!.companyId,
      createdById: user!.id,
      reason: body.reason,
      items: body.items,
    });
    return jsonOk(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
