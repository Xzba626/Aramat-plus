import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, canViewWarehouseFinance } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { listPurchaseHistory } from "@/lib/services/warehouse.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const showFinance = canViewWarehouseFinance(user!);
    const data = await listPurchaseHistory(user!.companyId, {
      showFinance,
      take: 150,
    });

    return jsonOk({
      showFinance,
      warehouse: data.warehouse,
      purchases: data.purchases,
      batches: data.purchases,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
