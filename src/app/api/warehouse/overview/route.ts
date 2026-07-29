import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { canViewWarehouseFinance } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseOverview } from "@/lib/services/warehouse.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const data = await getWarehouseOverview(
      user!.companyId,
      canViewWarehouseFinance(user!)
    );
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
