import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { storeSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity, requestAuditMeta } from "@/lib/services/activity-log.service";
import { listStoresForCompany } from "@/lib/services/stores-list.service";
import { StoreKind, StoreStatus } from "@prisma/client";
import { isOwnerDirect } from "@/lib/services/owner-direct.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const rows = await listStoresForCompany(user!.companyId);
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const body = storeSchema.parse(await req.json());
    const store = await prisma.store.create({
      data: {
        name: body.name,
        address: body.address ?? null,
        phone: body.phone ?? null,
        workingHours: body.workingHours ?? null,
        companyId: user!.companyId,
        isActive: body.isActive ?? true,
        kind: StoreKind.BRANCH,
        status: StoreStatus.ACTIVE,
        openedAt: new Date(),
      },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "STORE_CREATE",
      entityType: "Store",
      entityId: store.id,
      comment: store.name,
    });
    return jsonOk(store, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("id обязателен"));
    const body = storeSchema.partial().parse(data);

    const existing = await prisma.store.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Торговая точка не найдена"));

    if (isOwnerDirect(existing) && data.isArchived === true) {
      return handleApiError(
        new Error("Канал «Личные продажи владельца» нельзя архивировать")
      );
    }

    // Удаление запрещено — только архив
    if (data.delete === true) {
      return handleApiError(new Error("Удаление запрещено. Используйте архивацию."));
    }

    const oldSnapshot = {
      name: existing.name,
      address: existing.address,
      status: existing.status,
      isArchived: existing.isArchived,
    };

    const store = await prisma.store.update({
      where: { id },
      data: {
        name: isOwnerDirect(existing) ? undefined : body.name,
        address: body.address === undefined ? undefined : body.address,
        phone: body.phone === undefined ? undefined : body.phone,
        workingHours:
          body.workingHours === undefined ? undefined : body.workingHours,
        isActive: body.isActive,
        status: body.status,
        isArchived:
          typeof body.isArchived === "boolean"
            ? body.isArchived
            : typeof data.isArchived === "boolean"
              ? data.isArchived
              : undefined,
        managerId: body.managerId === undefined ? undefined : body.managerId,
        notifyLowStock: body.notifyLowStock,
        notifyRequests: body.notifyRequests,
      },
    });

    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "STORE_UPDATE",
      entityType: "Store",
      entityId: id,
      comment: store.name,
      ...requestAuditMeta(req),
      metadata: {
        old: oldSnapshot,
        new: {
          name: store.name,
          address: store.address,
          status: store.status,
          isArchived: store.isArchived,
          notifyLowStock: store.notifyLowStock,
          notifyRequests: store.notifyRequests,
        },
      },
    });

    return jsonOk(store);
  } catch (err) {
    return handleApiError(err);
  }
}
