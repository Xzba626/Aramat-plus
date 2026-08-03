import { LocationType, Role, StoreKind, StoreStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";

export async function createBranchStore(params: {
  companyId: string;
  actorId: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  managerId?: string | null;
  sellerIds?: string[];
}) {
  const sellerIds = [...new Set(params.sellerIds ?? [])];
  if (params.managerId && sellerIds.includes(params.managerId)) {
    // manager is also bound via managerId + storeId
  }

  const bindIds = [...new Set([
    ...sellerIds,
    ...(params.managerId ? [params.managerId] : []),
  ])];

  if (bindIds.length) {
    const users = await prisma.user.findMany({
      where: {
        id: { in: bindIds },
        companyId: params.companyId,
        isActive: true,
        role: { in: [Role.SELLER, Role.MANAGER] },
      },
      select: { id: true, role: true },
    });
    if (users.length !== bindIds.length) throw new Error("USER_NOT_FOUND");
    if (params.managerId) {
      const mgr = users.find((u) => u.id === params.managerId);
      if (!mgr || (mgr.role !== Role.MANAGER && mgr.role !== Role.SELLER)) {
        throw new Error("FORBIDDEN");
      }
    }
  }

  const store = await prisma.$transaction(async (tx) => {
    const created = await tx.store.create({
      data: {
        name: params.name,
        address: params.address ?? null,
        phone: params.phone ?? null,
        companyId: params.companyId,
        isActive: true,
        kind: StoreKind.BRANCH,
        status: StoreStatus.ACTIVE,
        openedAt: new Date(),
        managerId: params.managerId ?? null,
      },
    });

    if (bindIds.length) {
      await tx.user.updateMany({
        where: { id: { in: bindIds }, companyId: params.companyId },
        data: { storeId: created.id },
      });
    }

    await logActivity({
      tx,
      userId: params.actorId,
      companyId: params.companyId,
      action: "STORE_CREATE",
      entityType: "Store",
      entityId: created.id,
      comment: created.name,
      metadata: {
        managerId: params.managerId ?? null,
        sellerIds,
      },
    });

    return created;
  });

  return store;
}

/** True if store has any operational history — must archive, not hard-delete. */
export async function storeHasHistory(storeId: string): Promise<boolean> {
  const [sales, transfers, users, expenses, sessions, stock] =
    await Promise.all([
      prisma.sale.count({ where: { storeId } }),
      prisma.transfer.count({ where: { toStoreId: storeId } }),
      prisma.user.count({ where: { storeId } }),
      prisma.expense.count({ where: { storeId } }),
      prisma.inventorySession.count({ where: { storeId } }),
      prisma.stockBalance.count({
        where: { locationType: LocationType.STORE, locationId: storeId },
      }),
    ]);
  return sales + transfers + users + expenses + sessions + stock > 0;
}

export async function archiveStore(params: {
  companyId: string;
  storeId: string;
  actorId: string;
  archive: boolean;
}) {
  const store = await prisma.store.findFirst({
    where: { id: params.storeId, companyId: params.companyId },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.kind === StoreKind.OWNER_DIRECT) throw new Error("VALIDATION_ERROR");

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: {
      isArchived: params.archive,
      isActive: params.archive ? false : true,
      status: params.archive ? StoreStatus.CLOSED : StoreStatus.ACTIVE,
      archivedAt: params.archive ? new Date() : null,
    },
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "STORE_UPDATE",
    entityType: "Store",
    entityId: store.id,
    comment: params.archive ? `archive:${store.name}` : `restore:${store.name}`,
  });

  return updated;
}

export async function hardDeleteStore(params: {
  companyId: string;
  storeId: string;
  actorId: string;
  /** Permanent purge (cascade). Without force → soft-archive. */
  force?: boolean;
}) {
  const store = await prisma.store.findFirst({
    where: { id: params.storeId, companyId: params.companyId },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");
  if (store.kind === StoreKind.OWNER_DIRECT) throw new Error("VALIDATION_ERROR");

  // Unified pattern: "Delete" = archive first
  if (!params.force) {
    if (!store.isArchived) {
      await archiveStore({
        companyId: params.companyId,
        storeId: store.id,
        actorId: params.actorId,
        archive: true,
      });
    }
    return { ok: true as const, archived: true as const };
  }

  const { forceDeleteStoreCascade } = await import(
    "@/lib/services/archive-retention.service"
  );
  await forceDeleteStoreCascade({
    companyId: params.companyId,
    storeId: store.id,
    actorId: params.actorId,
  });
  return { ok: true as const, purged: true as const };
}

/** True if user has sales/history/bindings — archive only. */
export async function userHasHistory(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { storeId: true },
  });
  if (user?.storeId) return true;

  const [sales, discounts, returns, transfers, expenses, managed] =
    await Promise.all([
      prisma.sale.count({ where: { sellerId: userId } }),
      prisma.discountRequest.count({
        where: { OR: [{ requesterId: userId }, { reviewerId: userId }] },
      }),
      prisma.saleReturn.count({
        where: { OR: [{ requesterId: userId }, { reviewerId: userId }] },
      }),
      prisma.transfer.count({ where: { createdById: userId } }),
      prisma.expense.count({ where: { createdById: userId } }),
      prisma.store.count({ where: { managerId: userId } }),
    ]);
  return (
    sales + discounts + returns + transfers + expenses + managed > 0
  );
}

export async function hardDeleteUser(params: {
  companyId: string;
  userId: string;
  actorId: string;
}) {
  const target = await prisma.user.findFirst({
    where: { id: params.userId, companyId: params.companyId },
  });
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.role === Role.OWNER) throw new Error("FORBIDDEN");
  if (target.id === params.actorId) throw new Error("FORBIDDEN");
  if (await userHasHistory(target.id)) throw new Error("ARCHIVE_ONLY");

  await prisma.$transaction(async (tx) => {
    await tx.store.updateMany({
      where: { managerId: target.id },
      data: { managerId: null },
    });
    await tx.user.delete({ where: { id: target.id } });
    await logActivity({
      tx,
      userId: params.actorId,
      companyId: params.companyId,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: target.id,
      comment: `delete:${target.name}`,
    });
  });

  return { ok: true };
}
