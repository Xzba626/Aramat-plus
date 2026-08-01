import { LocationType } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseStock } from "@/lib/services/stock.service";
import { reservedQtyByProduct } from "@/lib/services/reservation.service";
import { decimalToNumber } from "@/lib/utils";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const sp = new URL(req.url).searchParams;
    const warehouseId = sp.get("warehouseId") ?? undefined;
    const forPos = sp.get("forPos") === "1";
    const data = await getWarehouseStock(user!.companyId, warehouseId);

    if (!forPos || !data.warehouse) {
      return jsonOk(data);
    }

    const reserved = await reservedQtyByProduct({
      companyId: user!.companyId,
      locationType: LocationType.WAREHOUSE,
      locationId: data.warehouse.id,
      productIds: data.items.map((i) => i.productId),
    });

    return jsonOk({
      ...data,
      items: data.items.map((item) => {
        const physical = decimalToNumber(item.quantity as never);
        const held = reserved.get(item.productId) ?? 0;
        return {
          ...item,
          physicalQty: physical,
          reservedQty: held,
          quantity: Math.max(0, physical - held),
        };
      }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
