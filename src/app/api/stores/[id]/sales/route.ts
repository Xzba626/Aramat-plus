import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreSalesHistory } from "@/lib/services/stores-detail.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    const sp = new URL(req.url).searchParams;
    return jsonOk(
      await getStoreSalesHistory(
        user!.companyId,
        id,
        Number(sp.get("page") || 1),
        Number(sp.get("pageSize") || 20)
      )
    );
  } catch (err) {
    return handleApiError(err);
  }
}
