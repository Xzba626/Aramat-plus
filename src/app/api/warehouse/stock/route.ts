import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseStock } from "@/lib/services/stock.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const warehouseId = new URL(req.url).searchParams.get("warehouseId") ?? undefined;
    const data = await getWarehouseStock(user!.companyId, warehouseId);
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
