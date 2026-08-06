import {
  BatchOrigin,
  InventoryStatus,
  LocationType,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch, deductBatchesFifo } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";

/** Start a blind inventory session for a branch store. */
export async function createInventorySession(params: {
  companyId: string;
  storeId: string;
  createdById: string;
  comment?: string;
}) {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      isActive: true,
      kind: "BRANCH",
    },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");

  const open = await prisma.inventorySession.findFirst({
    where: {
      storeId: store.id,
      status: {
        in: [InventoryStatus.IN_PROGRESS, InventoryStatus.PENDING_APPROVAL],
      },
    },
  });
  if (open) throw new Error("REVISION_ALREADY_OPEN");

  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: { gt: 0 },
    },
    include: { product: { select: { id: true, name: true, isActive: true } } },
  });

  const session = await prisma.inventorySession.create({
    data: {
      storeId: store.id,
      createdById: params.createdById,
      status: InventoryStatus.IN_PROGRESS,
      comment: params.comment?.trim() || null,
      items: {
        create: balances
          .filter((b) => b.product.isActive)
          .map((b) => ({
            productId: b.productId,
            expectedQty: b.quantity,
            // Blind count: fact stays empty until entered physically
            countedQty: null,
            difference: new Prisma.Decimal(0),
          })),
      },
    },
    include: {
      store: { select: { id: true, name: true } },
      items: true,
    },
  });

  await prisma.store.update({
    where: { id: store.id },
    data: { status: "INVENTORY" },
  });

  await logActivity({
    userId: params.createdById,
    companyId: params.companyId,
    action: "REVISION_CREATE",
    entityType: "InventorySession",
    entityId: session.id,
    comment: store.name,
    metadata: { storeId: store.id, itemCount: session.items.length },
  });

  return {
    id: session.id,
    storeId: session.store.id,
    store: session.store.name,
    status: session.status,
    itemCount: session.items.length,
    createdAt: session.createdAt.toISOString(),
  };
}

export async function updateInventoryCounts(params: {
  companyId: string;
  sessionId: string;
  userId: string;
  items: Array<{ productId: string; countedQty: number; reason?: string }>;
}) {
  const session = await prisma.inventorySession.findFirst({
    where: {
      id: params.sessionId,
      status: InventoryStatus.IN_PROGRESS,
      store: { companyId: params.companyId },
    },
    include: { items: true },
  });
  if (!session) throw new Error("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    for (const line of params.items) {
      const existing = session.items.find((i) => i.productId === line.productId);
      const counted = new Prisma.Decimal(line.countedQty);
      if (counted.lt(0)) throw new Error("VALIDATION_ERROR");

      if (existing) {
        const diff = counted.sub(existing.expectedQty);
        await tx.inventoryItem.update({
          where: { id: existing.id },
          data: {
            countedQty: counted,
            difference: diff,
            discrepancyReason: line.reason?.trim() || existing.discrepancyReason,
          },
        });
      } else {
        // Product with 0 expected (not on balance) but counted > 0
        await tx.inventoryItem.create({
          data: {
            sessionId: session.id,
            productId: line.productId,
            expectedQty: new Prisma.Decimal(0),
            countedQty: counted,
            difference: counted,
            discrepancyReason: line.reason?.trim() || null,
          },
        });
      }
    }
  });

  await logActivity({
    userId: params.userId,
    companyId: params.companyId,
    action: "REVISION_COUNT",
    entityType: "InventorySession",
    entityId: session.id,
    metadata: { lines: params.items.length },
  });

  return { ok: true };
}

/**
 * Finish counting: lock facts and send to owner review.
 * Counts become immutable; stock is NOT adjusted yet.
 */
export async function submitInventoryForApproval(params: {
  companyId: string;
  sessionId: string;
  userId: string;
}) {
  const session = await prisma.inventorySession.findFirst({
    where: {
      id: params.sessionId,
      status: InventoryStatus.IN_PROGRESS,
      store: { companyId: params.companyId },
    },
    include: { items: true },
  });
  if (!session) throw new Error("NOT_FOUND");

  const uncounted = session.items.filter((i) => i.countedQty == null);
  if (uncounted.length > 0) throw new Error("REVISION_COUNTS_INCOMPLETE");

  await prisma.inventorySession.update({
    where: { id: session.id },
    data: { status: InventoryStatus.PENDING_APPROVAL },
  });

  await logActivity({
    userId: params.userId,
    companyId: params.companyId,
    action: "REVISION_COUNT",
    entityType: "InventorySession",
    entityId: session.id,
    metadata: {
      lines: session.items.length,
      before: { status: "IN_PROGRESS" },
      after: { status: "PENDING_APPROVAL" },
    },
  });

  return { ok: true, status: InventoryStatus.PENDING_APPROVAL };
}

/**
 * Approve revision: apply FIFO deduct for shortages, addBatch(ADJUSTMENT) for surplus.
 */
export async function approveInventorySession(params: {
  companyId: string;
  sessionId: string;
  approvedById: string;
  note?: string;
}) {
  const session = await prisma.inventorySession.findFirst({
    where: {
      id: params.sessionId,
      status: InventoryStatus.PENDING_APPROVAL,
      store: { companyId: params.companyId },
    },
    include: {
      items: true,
      store: true,
    },
  });
  if (!session) throw new Error("NOT_FOUND");

  const uncounted = session.items.filter((i) => i.countedQty == null);
  if (uncounted.length > 0) throw new Error("REVISION_COUNTS_INCOMPLETE");

  const adjustments: Array<{
    productId: string;
    expected: number;
    counted: number;
    delta: number;
    cost?: number;
  }> = [];

  await prisma.$transaction(
    async (tx) => {
      for (const item of session.items) {
        const expected = item.expectedQty;
        const counted = item.countedQty!;
        const diff = counted.sub(expected);
        if (diff.eq(0)) continue;

        if (diff.lt(0)) {
          // Shortage — FIFO deduct from store
          const need = expected.sub(counted);
          const consumed = await deductBatchesFifo(tx, {
            productId: item.productId,
            locationType: LocationType.STORE,
            locationId: session.storeId,
            quantity: need,
          });
          const cost = consumed.reduce(
            (s, c) => s.add(c.costPerUnit.mul(c.quantity)),
            new Prisma.Decimal(0)
          );
          adjustments.push({
            productId: item.productId,
            expected: decimalToNumber(expected),
            counted: decimalToNumber(counted),
            delta: -decimalToNumber(need),
            cost: decimalToNumber(cost),
          });
        } else {
          // Surplus — add adjustment batch at avg/last known cost
          const lastBatch = await tx.batch.findFirst({
            where: {
              productId: item.productId,
              locationType: LocationType.STORE,
              locationId: session.storeId,
            },
            orderBy: { receivedAt: "desc" },
            select: { costPerUnit: true, salePrice: true },
          });
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { defaultCostPerUnit: true, salePrice: true },
          });
          const costPerUnit =
            lastBatch?.costPerUnit ??
            product?.defaultCostPerUnit ??
            product?.salePrice ??
            new Prisma.Decimal(0);
          const salePrice =
            lastBatch?.salePrice ??
            product?.salePrice ??
            new Prisma.Decimal(0);

          await addBatch(tx, {
            productId: item.productId,
            locationType: LocationType.STORE,
            locationId: session.storeId,
            quantity: diff,
            costPerUnit,
            salePrice,
            notes: `revision:${session.id}`,
            origin: BatchOrigin.ADJUSTMENT,
            createdById: params.approvedById,
          });
          adjustments.push({
            productId: item.productId,
            expected: decimalToNumber(expected),
            counted: decimalToNumber(counted),
            delta: decimalToNumber(diff),
            cost: decimalToNumber(costPerUnit.mul(diff)),
          });
        }
      }

      await tx.inventorySession.update({
        where: { id: session.id },
        data: {
          status: InventoryStatus.COMPLETED,
          approvedById: params.approvedById,
          completedAt: new Date(),
          comment: params.note?.trim() || session.comment,
        },
      });

      await tx.store.update({
        where: { id: session.storeId },
        data: { status: "ACTIVE" },
      });
    },
    { timeout: 60000 }
  );

  await logActivity({
    userId: params.approvedById,
    companyId: params.companyId,
    action: "REVISION_APPROVE",
    entityType: "InventorySession",
    entityId: session.id,
    comment: params.note,
    metadata: {
      storeId: session.storeId,
      adjustments,
      before: { status: "PENDING_APPROVAL" },
      after: { status: "COMPLETED" },
    },
  });

  return {
    id: session.id,
    adjustmentCount: adjustments.length,
    adjustments,
  };
}

export async function cancelInventorySession(params: {
  companyId: string;
  sessionId: string;
  userId: string;
  /** Owner may cancel pending review; managers only while counting. */
  allowPending?: boolean;
}) {
  const allowedStatuses = params.allowPending
    ? [InventoryStatus.IN_PROGRESS, InventoryStatus.PENDING_APPROVAL]
    : [InventoryStatus.IN_PROGRESS];

  const session = await prisma.inventorySession.findFirst({
    where: {
      id: params.sessionId,
      status: { in: allowedStatuses },
      store: { companyId: params.companyId },
    },
  });
  if (!session) throw new Error("NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    await tx.inventorySession.update({
      where: { id: session.id },
      data: { status: InventoryStatus.CANCELLED, completedAt: new Date() },
    });
    await tx.store.update({
      where: { id: session.storeId },
      data: { status: "ACTIVE" },
    });
  });

  await logActivity({
    userId: params.userId,
    companyId: params.companyId,
    action: "REVISION_CANCEL",
    entityType: "InventorySession",
    entityId: session.id,
    metadata: { before: { status: session.status } },
  });

  return { ok: true };
}

export async function getInventorySessionDetail(
  companyId: string,
  sessionId: string,
  role: Role = Role.OWNER
) {
  const session = await prisma.inventorySession.findFirst({
    where: { id: sessionId, store: { companyId } },
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: true,
    },
  });
  if (!session) throw new Error("NOT_FOUND");

  const productIds = session.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      accountingType: true,
      unit: { select: { symbol: true } },
      category: { select: { name: true } },
    },
  });
  const nameMap = new Map(products.map((p) => [p.id, p]));

  const base = {
    id: session.id,
    storeId: session.store.id,
    store: session.store.name,
    status: session.status,
    createdBy: session.createdBy.name,
    approvedBy: session.approvedBy?.name ?? null,
    createdAt: session.createdAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    comment: session.comment,
    itemCount: session.items.length,
  };

  const isInProgress = session.status === InventoryStatus.IN_PROGRESS;
  const isPending = session.status === InventoryStatus.PENDING_APPROVAL;
  const isOwner = role === Role.OWNER || role === Role.ADMIN;

  const mapItemMeta = (i: (typeof session.items)[number]) => {
    const p = nameMap.get(i.productId);
    return {
      productId: i.productId,
      name: p?.name ?? i.productId,
      category: p?.category?.name ?? null,
      accountingType: p?.accountingType ?? null,
      unit: p?.unit?.symbol ?? "",
      countedQty: i.countedQty == null ? null : decimalToNumber(i.countedQty),
      reason: i.discrepancyReason,
    };
  };

  // Blind count for EVERYONE while IN_PROGRESS — no system qty / difference.
  if (isInProgress) {
    return {
      ...base,
      blind: true as const,
      items: session.items.map(mapItemMeta),
    };
  }

  // Pending / completed / cancelled: Manager sees metadata only.
  if (!isOwner) {
    return {
      ...base,
      blind: true as const,
      items: [] as Array<{
        productId: string;
        name: string;
        category: string | null;
        accountingType: string | null;
        unit: string;
        countedQty: number | null;
        reason: string | null;
      }>,
    };
  }

  // Owner: full discrepancy table for pending review and completed sessions.
  if (isPending || session.status === InventoryStatus.COMPLETED) {
    return {
      ...base,
      blind: false as const,
      items: session.items.map((i) => ({
        ...mapItemMeta(i),
        expectedQty: decimalToNumber(i.expectedQty),
        difference: decimalToNumber(i.difference),
      })),
    };
  }

  // Cancelled: owner may see locked snapshot if counts existed
  return {
    ...base,
    blind: false as const,
    items: session.items.map((i) => ({
      ...mapItemMeta(i),
      expectedQty: decimalToNumber(i.expectedQty),
      difference: decimalToNumber(i.difference),
    })),
  };
}
