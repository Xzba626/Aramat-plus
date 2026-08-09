import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requireSeller,
  requireStoreAccess,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { listStorePackagingStock } from "@/lib/services/packaging.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";
import { stripExactStockForManager } from "@/lib/permissions/manager-response";

/** Bottles available at a store for WEIGHT/decant POS checkout. */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const sp = new URL(req.url).searchParams;
    let storeId = sp.get("storeId") ?? undefined;

    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      if (!user.storeId) {
        return handleApiError(new Error("SELLER_NO_STORE"));
      }
      storeId = user.storeId;
    } else {
      const denied = requireOwnerOrManager(user);
      if (denied) return denied;
      if (!storeId) {
        return handleApiError(new Error("ID_REQUIRED"));
      }
      const scopeDenied = await requireStoreAccess(user, storeId);
      if (scopeDenied) return scopeDenied;
    }

    const items = await listStorePackagingStock(user.companyId, storeId);
    // Seller UI must not see exact bottle stock or cost (revision blindness + no opex leak)
    if (user.role === Role.SELLER) {
      return jsonOk(
        items.map(({ quantity: _q, defaultCost: _c, ...rest }) => rest)
      );
    }
    // MANAGER: no exact on-hand qty; OWNER: full after finance strip (noop)
    return jsonOk(
      stripExactStockForManager(user, stripFinanceForRole(user, items))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
