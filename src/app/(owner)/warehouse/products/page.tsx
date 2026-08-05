import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  listCatalogRefs,
  listProductCatalog,
} from "@/lib/services/products-catalog.service";
import { RouteLoading } from "@/components/ui/route-loading";
import WarehouseCatalogClient from "./products-client";

export default async function WarehouseCatalogPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [rows, refs] = await Promise.all([
    listProductCatalog(user.companyId, { status: "active" }),
    listCatalogRefs(user.companyId),
  ]);

  // Serialize Decimal / Date for the client boundary
  const initialRows = JSON.parse(JSON.stringify(rows));

  return (
    <Suspense fallback={<RouteLoading />}>
      <WarehouseCatalogClient
        initialRows={initialRows}
        initialCategories={refs.categories}
        initialBrands={refs.brands}
      />
    </Suspense>
  );
}
