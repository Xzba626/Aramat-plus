import { auth } from "@/lib/auth";
import { Role } from "@prisma/client";
import { getWarehouseOverview } from "@/lib/services/warehouse.service";
import { WarehouseOverviewClient } from "@/components/warehouse/warehouse-overview-client";

export default async function WarehouseOverviewPage() {
  const session = await auth();
  const showFinance = session!.user.role === Role.OWNER;
  const data = await getWarehouseOverview(session!.user.companyId, showFinance);

  return (
    <WarehouseOverviewClient
      showFinance={showFinance}
      data={{
        warehouse: data.warehouse
          ? { id: data.warehouse.id, name: data.warehouse.name }
          : null,
        skuCount: data.skuCount,
        productCount: data.productCount,
        unitsTotal: data.unitsTotal,
        batchCount: data.batchCount,
        lowStockCount: data.lowStockCount,
        totalCost: data.totalCost,
        totalSaleValue: data.totalSaleValue,
        recentReceipts: data.recentReceipts,
        recentTransfers: data.recentTransfers,
        recentReturns: data.recentReturns,
      }}
    />
  );
}
