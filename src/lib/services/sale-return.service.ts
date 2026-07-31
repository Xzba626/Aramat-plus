import { BatchOrigin, LocationType, Prisma, StoreKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  notifyCompanyRoles,
  notifyUser,
} from "@/lib/services/notification.service";
import { decimalToNumber } from "@/lib/utils";

/** Seller/owner requests a return of a completed sale. */
export async function createSaleReturn(params: {
  companyId: string;
  saleId: string;
  requesterId: string;
  reason?: string;
}) {
  const sale = await prisma.sale.findFirst({
    where: {
      id: params.saleId,
      store: { companyId: params.companyId },
      status: "COMPLETED",
    },
    include: {
      store: { select: { id: true, name: true, companyId: true } },
      items: { include: { product: { select: { name: true } } } },
    },
  });
  if (!sale) throw new Error("NOT_FOUND");

  const requester = await prisma.user.findFirst({
    where: { id: params.requesterId, companyId: params.companyId, isActive: true },
  });
  if (!requester) throw new Error("USER_NOT_FOUND");

  if (requester.role === "SELLER") {
    if (sale.sellerId !== requester.id) {
      throw new Error("FORBIDDEN");
    }
  }

  const existing = await prisma.saleReturn.findFirst({
    where: { saleId: sale.id, status: "PENDING" },
  });
  if (existing) throw new Error("RETURN_ALREADY_PENDING");

  const ret = await prisma.saleReturn.create({
    data: {
      saleId: sale.id,
      requesterId: params.requesterId,
      reason: params.reason?.trim() || null,
      status: "PENDING",
    },
  });

  await logActivity({
    userId: params.requesterId,
    companyId: params.companyId,
    action: "RETURN_REQUEST",
    entityType: "SaleReturn",
    entityId: ret.id,
    comment: params.reason ?? undefined,
    metadata: { saleId: sale.id, storeId: sale.storeId },
  });

  const productNames = sale.items.map((i) => i.product.name).join(", ");
  await notifyCompanyRoles({
    companyId: params.companyId,
    type: "RETURN_REQUEST",
    title: "notif.returnRequest",
    message: `${requester.name} · ${sale.store.name} · ${productNames || sale.id}`,
    entityType: "SaleReturn",
    entityId: ret.id,
  });

  return ret;
}

export async function decideSaleReturn(params: {
  companyId: string;
  returnId: string;
  reviewerId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}) {
  const existing = await prisma.saleReturn.findFirst({
    where: {
      id: params.returnId,
      status: "PENDING",
      sale: { store: { companyId: params.companyId } },
    },
    include: {
      sale: {
        include: {
          items: true,
          store: true,
        },
      },
      requester: { select: { id: true, name: true } },
    },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (params.decision === "REJECT") {
    const updated = await prisma.saleReturn.update({
      where: { id: existing.id },
      data: {
        status: "REJECTED",
        reviewerId: params.reviewerId,
        reviewedAt: new Date(),
        reviewNote: params.note?.trim() || null,
      },
    });

    await logActivity({
      userId: params.reviewerId,
      companyId: params.companyId,
      action: "RETURN_REJECT",
      entityType: "SaleReturn",
      entityId: existing.id,
      comment: params.note,
    });

    await notifyUser({
      userId: existing.requesterId,
      type: "SYSTEM",
      title: "notif.returnRejected",
      message: params.note?.trim() || existing.saleId.slice(-8),
      entityType: "SaleReturn",
      entityId: existing.id,
    });

    return updated;
  }

  // APPROVE — restore stock to the location that was deducted at sale time
  const store = existing.sale.store;
  let locationType: LocationType;
  let locationId: string;

  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: params.companyId, isActive: true },
    });
    if (!warehouse) throw new Error("WAREHOUSE_MISSING");
    locationType = LocationType.WAREHOUSE;
    locationId = warehouse.id;
  } else {
    locationType = LocationType.STORE;
    locationId = store.id;
  }

  const updated = await prisma.$transaction(
    async (tx) => {
      for (const item of existing.sale.items) {
        await addBatch(tx, {
          productId: item.productId,
          locationType,
          locationId,
          quantity: item.quantity,
          costPerUnit: item.costPerUnit,
          notes: `sale_return:${existing.saleId}`,
          origin: BatchOrigin.RETURN,
          createdById: params.reviewerId,
        });
      }

      await tx.sale.update({
        where: { id: existing.saleId },
        data: { status: "RETURNED" },
      });

      return tx.saleReturn.update({
        where: { id: existing.id },
        data: {
          status: "APPROVED",
          reviewerId: params.reviewerId,
          reviewedAt: new Date(),
          reviewNote: params.note?.trim() || null,
        },
      });
    },
    { timeout: 20000 }
  );

  await logActivity({
    userId: params.reviewerId,
    companyId: params.companyId,
    action: "RETURN_APPROVE",
    entityType: "SaleReturn",
    entityId: existing.id,
    comment: params.note,
    metadata: {
      saleId: existing.saleId,
      locationType,
      locationId,
      restoredItems: existing.sale.items.length,
    },
  });

  await notifyUser({
    userId: existing.requesterId,
    type: "SYSTEM",
    title:
      locationType === LocationType.WAREHOUSE
        ? "notif.returnApprovedWarehouse"
        : "notif.returnApprovedStore",
    message: existing.saleId.slice(-8),
    entityType: "SaleReturn",
    entityId: existing.id,
  });

  return updated;
}

export async function listSaleReturns(companyId: string, limit = 100) {
  const rows = await prisma.saleReturn.findMany({
    where: { sale: { store: { companyId } } },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      sale: {
        include: {
          store: { select: { id: true, name: true } },
          items: {
            include: { product: { select: { name: true } } },
            take: 8,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    status: r.status,
    reason: r.reason,
    reviewNote: r.reviewNote,
    store: r.sale.store.name,
    seller: r.requester.name,
    product: r.sale.items.map((i) => i.product.name).join(", ") || "—",
    amount: decimalToNumber(r.sale.total),
    saleId: r.saleId,
  }));
}
