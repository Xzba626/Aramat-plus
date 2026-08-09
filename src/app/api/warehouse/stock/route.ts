import { LocationType, ProductKind, Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getWarehouseStock } from "@/lib/services/stock.service";
import { reservedQtyByProduct } from "@/lib/services/reservation.service";
import { decimalToNumber } from "@/lib/utils";
import { stripFinanceForRole } from "@/lib/finance-visibility";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    // R1: MANAGER has no warehouse stock browse (exact or otherwise)
    if (user!.role === Role.MANAGER) {
      const ownerOnly = requireOwner(user);
      if (ownerOnly) return ownerOnly;
    }

    const sp = new URL(req.url).searchParams;
    const warehouseId = sp.get("warehouseId") ?? undefined;
    const forPos = sp.get("forPos") === "1";
    const data = await getWarehouseStock(user!.companyId, warehouseId, {
      includeZero: forPos,
    });

    if (!forPos || !data.warehouse) {
      return jsonOk(stripFinanceForRole(user!, data));
    }

    // Defense in depth: packaging already stripped in getWarehouseStock.
    const sellable = data.items.filter(
      (i) => i.product.kind !== ProductKind.PACKAGING
    );

    const reserved = await reservedQtyByProduct({
      companyId: user!.companyId,
      locationType: LocationType.WAREHOUSE,
      locationId: data.warehouse.id,
      productIds: sellable.map((i) => i.productId),
    });

    const { getLowStockThresholds, resolveStockStatus } = await import(
      "@/lib/services/low-stock-thresholds.service"
    );
    const thresholds = await getLowStockThresholds(user!.companyId);

    return jsonOk(
      stripFinanceForRole(user!, {
        ...data,
        items: sellable.map((item) => {
          const physical = decimalToNumber(item.quantity as never);
          const held = reserved.get(item.productId) ?? 0;
          const quantity = Math.max(0, physical - held);
          return {
            ...item,
            physicalQty: physical,
            reservedQty: held,
            quantity,
            stockStatus: resolveStockStatus({
              quantity,
              accountingType: item.product.accountingType,
              locationType: LocationType.WAREHOUSE,
              thresholds,
            }),
            /** POS estimate: FIFO-front batch sale price. */
            salePriceEstimate: (() => {
              const batches = (
                item as {
                  batches?: Array<{ salePrice?: unknown; quantity?: unknown }>;
                }
              ).batches;
              const open = (batches ?? []).find(
                (b) =>
                  decimalToNumber(b.quantity as never) > 0 && b.salePrice != null
              );
              return open
                ? decimalToNumber(open.salePrice as never)
                : decimalToNumber(item.product.salePrice as never);
            })(),
          };
        }),
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
