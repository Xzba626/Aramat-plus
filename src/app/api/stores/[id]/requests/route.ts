import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireStoreAccess } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreRequests } from "@/lib/services/stores-detail.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    const status = new URL(req.url).searchParams.get("status") as
      | "PENDING"
      | "APPROVED"
      | "REJECTED"
      | "ALL"
      | null;
    return jsonOk(
      await getStoreRequests(user!.companyId, id, status ?? "ALL")
    );
  } catch (err) {
    return handleApiError(err);
  }
}
