import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { getAnalyticsBreakdown } from "@/lib/services/analytics.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    return jsonOk(await getAnalyticsBreakdown(user!.companyId));
  } catch (err) {
    return handleApiError(err);
  }
}
