import { getSessionUser } from "@/lib/session";
import { requireOwner, canViewWarehouseFinance } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getPurchaseHistory } from "@/lib/services/purchase.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 50);
    const offset = Number(url.searchParams.get("offset") || 0);
    const showFinance = canViewWarehouseFinance(user!);

    const data = await getPurchaseHistory(user!.companyId, {
      limit,
      offset,
      showFinance,
    });

    return jsonOk({ showFinance, ...data });
  } catch (err) {
    return handleApiError(err);
  }
}
