import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requirePermission,
  requireStoreAccess,
  resolveScopedStoreFilter,
} from "@/lib/rbac";
import { transferSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createStoreTransfer,
  createTransfer,
  listTransfers,
} from "@/lib/services/transfer.service";
import { stripFinanceForRole } from "@/lib/finance-visibility";
import { stripExactStockForManager } from "@/lib/permissions/manager-response";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "transfers.view");
      if (permDenied) return permDenied;
    }

    const scope = await resolveScopedStoreFilter(user!);
    const items = await listTransfers(user!.companyId, {
      ...(scope.all
        ? {}
        : scope.storeIds.length === 0
          ? { storeId: null }
          : { storeIds: scope.storeIds }),
    });
    return jsonOk(
      stripExactStockForManager(user!, stripFinanceForRole(user!, items))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "transfers.create");
      if (permDenied) return permDenied;
    }

    const body = transferSchema.parse(await req.json());

    const toDenied = await requireStoreAccess(user!, body.toStoreId);
    if (toDenied) return toDenied;
    if (body.fromStoreId) {
      const fromDenied = await requireStoreAccess(user!, body.fromStoreId);
      if (fromDenied) return fromDenied;
    }

    if (body.fromStoreId) {
      const transfer = await createStoreTransfer({
        companyId: user!.companyId,
        fromStoreId: body.fromStoreId,
        toStoreId: body.toStoreId,
        createdById: user!.id,
        items: body.items,
        notes: body.notes ?? undefined,
      });
      return jsonOk(
        stripExactStockForManager(user!, stripFinanceForRole(user!, transfer)),
        201
      );
    }

    if (!body.fromWarehouseId) {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const transfer = await createTransfer({
      companyId: user!.companyId,
      fromWarehouseId: body.fromWarehouseId,
      toStoreId: body.toStoreId,
      createdById: user!.id,
      items: body.items,
      notes: body.notes ?? undefined,
    });
    return jsonOk(
      stripExactStockForManager(user!, stripFinanceForRole(user!, transfer)),
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
