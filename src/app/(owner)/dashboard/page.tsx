import { getSessionUser } from "@/lib/session";
import { scopedStoreId } from "@/lib/rbac";
import { getDashboardPayload } from "@/lib/services/dashboard.service";
import { OwnerDashboardClient } from "@/components/dashboard/owner-dashboard-client";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const scope = scopedStoreId(user);
  const data = await getDashboardPayload(user.companyId, {
    storeId: scope === undefined ? undefined : scope,
  });
  return (
    <OwnerDashboardClient
      initial={data}
      userName={user.name ?? ""}
      userRole={user.role}
    />
  );
}
