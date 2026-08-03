import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, scopedStoreId } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { getDashboardPayload } from "@/lib/services/dashboard.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const storeId = scopedStoreId(user!);
    const data = await getDashboardPayload(user!.companyId, {
      storeId: storeId === undefined ? undefined : storeId,
    });
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
