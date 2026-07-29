import { auth } from "@/lib/auth";
import { getDashboardPayload } from "@/lib/services/dashboard.service";
import { OwnerDashboardClient } from "@/components/dashboard/owner-dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  const data = await getDashboardPayload(session!.user.companyId);
  return (
    <OwnerDashboardClient
      initial={data}
      userName={session!.user.name ?? "Владелец"}
    />
  );
}
