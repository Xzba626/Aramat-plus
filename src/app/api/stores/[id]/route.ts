import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requirePermission,
  requireStoreAccess,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreDetail } from "@/lib/services/stores-detail.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";
import { stripExactStockForManager } from "@/lib/permissions/manager-response";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "stores.view");
      if (permDenied) return permDenied;
    }

    const detail = await getStoreDetail(user!.companyId, id);
    return jsonOk(
      stripExactStockForManager(user!, stripFinanceForRole(user!, detail))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
