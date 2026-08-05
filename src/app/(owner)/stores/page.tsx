import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { scopedStoreId } from "@/lib/rbac";
import { listStoresForCompany } from "@/lib/services/stores-list.service";
import StoresClient from "./stores-client";

export default async function StoresPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const scope = scopedStoreId(user);
  const rows = await listStoresForCompany(user.companyId, {
    includeArchived: false,
    storeId: scope === undefined ? undefined : scope,
  });

  const initialStores = JSON.parse(JSON.stringify(rows));

  return <StoresClient initialStores={initialStores} />;
}
