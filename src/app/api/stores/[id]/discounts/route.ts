import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreDiscountHistory } from "@/lib/services/stores-detail.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    return jsonOk(await getStoreDiscountHistory(user!.companyId, id));
  } catch (err) {
    return handleApiError(err);
  }
}
