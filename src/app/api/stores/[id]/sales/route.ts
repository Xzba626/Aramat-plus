import { getSessionUser } from "@/lib/session";
import { requireOwner, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreSalesHistory } from "@/lib/services/stores-detail.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    const sp = new URL(req.url).searchParams;
    const data = await getStoreSalesHistory(
      user!.companyId,
      id,
      Number(sp.get("page") || 1),
      Number(sp.get("pageSize") || 20)
    );
    return jsonOk(stripFinanceForRole(user!, data));
  } catch (err) {
    return handleApiError(err);
  }
}
