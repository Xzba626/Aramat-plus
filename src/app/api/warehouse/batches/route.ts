import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { canViewWarehouseFinance } from "@/lib/rbac";
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
      purchases: data.purchases,
      /** @deprecated alias for older UI — same as purchases */
      batches: data.purchases,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
