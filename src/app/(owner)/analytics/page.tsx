import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { scopedStoreId } from "@/lib/rbac";
import {
  getAnalyticsBreakdown,
  type AnalyticsPeriod,
} from "@/lib/services/analytics.service";
import AnalyticsClient from "./analytics-client";
import { RouteLoading } from "@/components/ui/route-loading";

const DEFAULT_PERIOD: AnalyticsPeriod = "today";

export default async function AnalyticsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const storeId = scopedStoreId(user);
  const initial = await getAnalyticsBreakdown(user.companyId, DEFAULT_PERIOD, {
    storeId: storeId === undefined ? undefined : storeId,
  });

  return (
    <Suspense fallback={<RouteLoading />}>
      <AnalyticsClient initial={initial} initialPeriod={DEFAULT_PERIOD} />
    </Suspense>
  );
}
