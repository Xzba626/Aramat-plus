import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreReturnHistory } from "@/lib/services/stores-detail.service";
import { stripExactStockForManager } from "@/lib/permissions/manager-response";
import { stripFinanceForRole } from "@/lib/finance-visibility";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    return jsonOk(
      stripExactStockForManager(
        user!,
        stripFinanceForRole(user!, await getStoreReturnHistory(user!.companyId, id))
      )
    );
  } catch (err) {
    return handleApiError(err);
  }
}
