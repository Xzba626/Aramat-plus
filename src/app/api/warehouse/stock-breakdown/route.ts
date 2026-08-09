import { getSessionUser } from "@/lib/session";
import { requireOwner, canViewWarehouseFinance } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseStockBreakdown } from "@/lib/services/warehouse.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const data = await getWarehouseStockBreakdown(
      user!.companyId,
      canViewWarehouseFinance(user!)
    );
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
