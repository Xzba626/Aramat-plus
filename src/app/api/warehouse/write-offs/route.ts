import { z } from "zod";
import { WriteOffReasonCode } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createWarehouseWriteOff,
  listWarehouseWriteOffs,
} from "@/lib/services/write-off.service";

const createSchema = z.object({
  reasonCode: z.nativeEnum(WriteOffReasonCode),
  comment: z.string().max(500).optional().nullable(),
  /** @deprecated use reasonCode */
  reason: z.string().max(500).optional(),
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
    let reasonCode = body.reasonCode;
    if (!reasonCode && body.reason) {
      const upper = body.reason.toUpperCase();
      if ((Object.values(WriteOffReasonCode) as string[]).includes(upper)) {
        reasonCode = upper as WriteOffReasonCode;
      } else {
        reasonCode = WriteOffReasonCode.OTHER;
      }
    }
    if (!reasonCode) return handleApiError(new Error("VALIDATION_ERROR"));

    const result = await createWarehouseWriteOff({
      companyId: user!.companyId,
      createdById: user!.id,
      reasonCode,
      comment: body.comment ?? body.reason,
      items: body.items,
    });
    return jsonOk(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
