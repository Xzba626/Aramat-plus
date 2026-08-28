import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreFinanceBreakdown } from "@/lib/services/stores-detail.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;

    const period = new URL(req.url).searchParams.get("period");
    const data = await getStoreFinanceBreakdown(user!.companyId, id, period);
    return jsonOk(stripFinanceForRole(user!, data));
  } catch (err) {
    return handleApiError(err);
  }
}
