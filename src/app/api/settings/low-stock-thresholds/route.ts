import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  getLowStockThresholds,
  setLowStockThresholds,
} from "@/lib/services/low-stock-thresholds.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const thresholds = await getLowStockThresholds(user!.companyId);
    return jsonOk(thresholds);
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  warehousePiece: z.coerce.number().min(0).optional(),
  storePiece: z.coerce.number().min(0).optional(),
  storeWeightMl: z.coerce.number().min(0).optional(),
  bottlePiece: z.coerce.number().min(0).optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = patchSchema.parse(await req.json());
    const thresholds = await setLowStockThresholds(user!.companyId, body);
    return jsonOk(thresholds);
  } catch (err) {
    return handleApiError(err);
  }
}
