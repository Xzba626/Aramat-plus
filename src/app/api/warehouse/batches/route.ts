import { getSessionUser } from "@/lib/session";
import { requireOwner, canViewWarehouseFinance } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { listPurchaseHistory } from "@/lib/services/warehouse.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const showFinance = canViewWarehouseFinance(user!);
    const data = await listPurchaseHistory(user!.companyId, {
      showFinance,
      take: 150,
    });

    return jsonOk(
      stripFinanceForRole(user!, {
        showFinance,
        warehouse: data.warehouse,
        purchases: data.purchases,
        batches: data.purchases,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
