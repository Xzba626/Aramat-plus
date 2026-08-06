import { auth } from "@/lib/auth";
import { isOwnerClass } from "@/lib/rbac";
import { getWarehouseOverview } from "@/lib/services/warehouse.service";
import { WarehouseOverviewClient } from "@/components/warehouse/warehouse-overview-client";

export default async function WarehouseOverviewPage() {
  const session = await auth();
  const showFinance = isOwnerClass(session!.user.role);
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
        categoryCount: data.categoryCount,
        unitsTotal: data.unitsTotal,
        batchCount: data.batchCount,
        lowStockCount: data.lowStockCount,
        outOfStockCount: data.outOfStockCount,
        totalPurchaseCost: data.totalPurchaseCost,
        totalCost: data.totalCost,
        totalSaleValue: data.totalSaleValue,
        potentialProfit: data.potentialProfit,
        lowStockItems: data.lowStockItems,
        outOfStockItems: data.outOfStockItems,
        recentReceipts: data.recentReceipts,
        recentTransfers: data.recentTransfers,
        recentMovements: data.recentMovements,
        recentWriteOffs: data.recentWriteOffs,
      }}
    />
  );
}
