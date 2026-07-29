import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreDetail } from "@/lib/services/stores-detail.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const detail = await getStoreDetail(user!.companyId, id);
    return jsonOk(detail);
  } catch (err) {
    return handleApiError(err);
  }
}
