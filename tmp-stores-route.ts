import { getSessionUser } from "@/lib/session";
import {
  requireOwner,
  requireOwnerOrManager,
  requireStoreAccess,
  scopedStoreId,
} from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { storeSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity, requestAuditMeta } from "@/lib/services/activity-log.service";
import { listStoresForCompany } from "@/lib/services/stores-list.service";
import {
  archiveStore,
  createBranchStore,
  hardDeleteStore,
} from "@/lib/services/store-lifecycle.service";
import { isOwnerDirect } from "@/lib/services/owner-direct.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const includeArchived =
      new URL(req.url).searchParams.get("archived") === "1";
    const scope = scopedStoreId(user!);
    const rows = await listStoresForCompany(user!.companyId, {
      includeArchived,
      storeId: scope === undefined ? undefined : scope,
    });
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = storeSchema.parse(await req.json());
    const store = await createBranchStore({
      companyId: user!.companyId,
      actorId: user!.id,
      name: body.name,
      address: body.address,
      phone: body.phone,
      managerId: body.managerId ?? null,
      sellerIds: body.sellerIds ?? [],
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
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const body = storeSchema.partial().parse(data);

    const existing = await prisma.store.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("STORE_NOT_FOUND"));
    const scopeDenied = requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;

    if (isOwnerDirect(existing) && data.isArchived === true) {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    if (data.delete === true) {
      const ownerDenied = requireOwner(user);
      if (ownerDenied) return ownerDenied;
      return jsonOk(
        await hardDeleteStore({
          companyId: user!.companyId,
          storeId: id,
          actorId: user!.id,
          force: data.force === true,
        })
      );
    }

    if (typeof data.isArchived === "boolean" && data.isArchived !== existing.isArchived) {
      const ownerDenied = requireOwner(user);
      if (ownerDenied) return ownerDenied;
      const updated = await archiveStore({
        companyId: user!.companyId,
        storeId: id,
        actorId: user!.id,
        archive: data.isArchived,
      });
      return jsonOk(updated);
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

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const force = url.searchParams.get("force") === "1";
    return jsonOk(
      await hardDeleteStore({
        companyId: user!.companyId,
        storeId: id,
        actorId: user!.id,
        force,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
