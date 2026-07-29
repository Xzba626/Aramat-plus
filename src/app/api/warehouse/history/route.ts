import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseHistory } from "@/lib/services/warehouse.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const sp = new URL(req.url).searchParams;
    const data = await getWarehouseHistory(
      user!.companyId,
      Number(sp.get("limit") || 100),
      Number(sp.get("offset") || 0)
    );
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
