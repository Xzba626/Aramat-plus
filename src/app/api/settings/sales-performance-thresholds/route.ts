import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  getSalesPerformanceThresholds,
  setSalesPerformanceThresholds,
} from "@/lib/services/sales-performance.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const thresholds = await getSalesPerformanceThresholds(user!.companyId);
    return jsonOk(thresholds);
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  monthlyPieces: z.coerce.number().min(0).optional(),
  monthlyMl: z.coerce.number().min(0).optional(),
});

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = patchSchema.parse(await req.json());
    const thresholds = await setSalesPerformanceThresholds(
      user!.companyId,
      body
    );
    return jsonOk(thresholds);
  } catch (err) {
    return handleApiError(err);
  }
}
