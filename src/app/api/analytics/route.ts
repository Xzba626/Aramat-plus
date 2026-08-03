import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, scopedStoreId } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  getAnalyticsBreakdown,
  type AnalyticsPeriod,
} from "@/lib/services/analytics.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const periodParam =
      new URL(req.url).searchParams.get("period") ?? "month";
    const period = (
      ["today", "week", "month", "year"].includes(periodParam)
        ? periodParam
        : "month"
    ) as AnalyticsPeriod;
    const storeId = scopedStoreId(user!);
    return jsonOk(
      await getAnalyticsBreakdown(user!.companyId, period, {
        storeId: storeId === undefined ? undefined : storeId,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
