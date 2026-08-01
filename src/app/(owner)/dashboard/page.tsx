import { getSessionUser } from "@/lib/session";
import { getDashboardPayload } from "@/lib/services/dashboard.service";
import { OwnerDashboardClient } from "@/components/dashboard/owner-dashboard-client";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const data = await getDashboardPayload(user.companyId);
  return (
    <OwnerDashboardClient
      initial={data}
      userName={user.name ?? ""}
      userRole={user.role}
    />
  );
}
