import {
  BatchOrigin,
  LocationType,
  Prisma,
  ReturnReasonCode,
  SaleStatus,
  StoreKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addBatch } from "@/lib/services/stock.service";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  notifyCompanyRoles,
  notifyUser,
} from "@/lib/services/notification.service";
import { decimalToNumber } from "@/lib/utils";

export type ReturnLineInput = {
  saleItemId: string;
  quantity: number;
};

/** Seller/owner requests a return (full sale or selected lines/qty). */
export async function createSaleReturn(params: {
  companyId: string;
  saleId: string;
  requesterId: string;
  reason?: string;
  reasonCode?: ReturnReasonCode;
  items?: ReturnLineInput[];
}) {
  const sale = await prisma.sale.findFirst({
    where: {
      id: params.saleId,
      store: { companyId: params.companyId },
      status: { in: [SaleStatus.COMPLETED, SaleStatus.PARTIAL_RETURN] },
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
  } else if (requester.role === "MANAGER") {
    if (!requester.storeId || sale.storeId !== requester.storeId) {
      throw new Error("FORBIDDEN");
    }
  }

  const existing = await prisma.saleReturn.findFirst({
    where: { saleId: sale.id, status: "PENDING" },
  });
  if (existing) throw new Error("RETURN_ALREADY_PENDING");

  // Previously approved return lines for this sale (remaining capacity)
  const priorApproved = await prisma.saleReturnItem.findMany({
    where: {
      return: { saleId: sale.id, status: "APPROVED" },
    },
  });
  const returnedQtyByItem = new Map<string, Prisma.Decimal>();
  for (const row of priorApproved) {
    const prev = returnedQtyByItem.get(row.saleItemId) ?? new Prisma.Decimal(0);
    returnedQtyByItem.set(row.saleItemId, prev.add(row.quantity));
  }

  let lines: Array<{
    saleItemId: string;
    productId: string;
    quantity: Prisma.Decimal;
    costPerUnit: Prisma.Decimal;
    salePrice: Prisma.Decimal;
  }>;

  if (params.items?.length) {
    lines = [];
    for (const input of params.items) {
      const saleItem = sale.items.find((i) => i.id === input.saleItemId);
      if (!saleItem) throw new Error("NOT_FOUND");
      const qty = new Prisma.Decimal(input.quantity);
      if (qty.lte(0)) throw new Error("VALIDATION_ERROR");
      const already = returnedQtyByItem.get(saleItem.id) ?? new Prisma.Decimal(0);
      const remaining = saleItem.quantity.sub(already);
      if (qty.gt(remaining)) throw new Error("RETURN_QTY_EXCEEDS");
      lines.push({
        saleItemId: saleItem.id,
        productId: saleItem.productId,
        quantity: qty,
        costPerUnit: saleItem.costPerUnit,
        salePrice: saleItem.salePrice,
      });
    }
  } else {
    // Full remaining return
    lines = sale.items
      .map((saleItem) => {
        const already =
          returnedQtyByItem.get(saleItem.id) ?? new Prisma.Decimal(0);
        const remaining = saleItem.quantity.sub(already);
        if (remaining.lte(0)) return null;
        return {
          saleItemId: saleItem.id,
          productId: saleItem.productId,
          quantity: remaining,
          costPerUnit: saleItem.costPerUnit,
          salePrice: saleItem.salePrice,
        };
      })
      .filter(Boolean) as typeof lines;
  }

  if (!lines.length) throw new Error("RETURN_ITEMS_REQUIRED");

  const reasonCode = params.reasonCode ?? null;

  const ret = await prisma.saleReturn.create({
    data: {
      saleId: sale.id,
      requesterId: params.requesterId,
      reason: params.reason?.trim() || reasonCode || null,
      reasonCode,
      status: "PENDING",
      items: {
        create: lines.map((l) => ({
          saleItemId: l.saleItemId,
          productId: l.productId,
          quantity: l.quantity,
          costPerUnit: l.costPerUnit,
          salePrice: l.salePrice,
        })),
      },
    },
  });

  await logActivity({
    userId: params.requesterId,
    companyId: params.companyId,
    action: "RETURN_REQUEST",
    entityType: "SaleReturn",
    entityId: ret.id,
    comment: params.reason ?? reasonCode ?? undefined,
    metadata: {
      saleId: sale.id,
      storeId: sale.storeId,
      reasonCode,
      lines: lines.map((l) => ({
        saleItemId: l.saleItemId,
        productId: l.productId,
        quantity: decimalToNumber(l.quantity),
      })),
    },
  });

  const productNames = lines
    .map((l) => {
      const saleItem = sale.items.find((i) => i.id === l.saleItemId);
      return saleItem?.product.name;
    })
    .filter(Boolean)
    .join(", ");
  const reasonText =
    params.reason?.trim() ||
    (reasonCode ? String(reasonCode) : "—");
  await notifyCompanyRoles({
    companyId: params.companyId,
    type: "RETURN_REQUEST",
    title: "notif.returnRequest",
    message: `${sale.store.name} · #${sale.id.slice(-8).toUpperCase()} · ${productNames || "—"} · ${reasonText}`,
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
      items: true,
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

  // Lines to restore: explicit SaleReturnItem or legacy full sale.items
  const restoreLines =
    existing.items.length > 0
      ? existing.items
      : existing.sale.items.map((i) => ({
          saleItemId: i.id,
          productId: i.productId,
          quantity: i.quantity,
          costPerUnit: i.costPerUnit,
          salePrice: i.salePrice,
        }));

  const updated = await prisma.$transaction(
    async (tx) => {
      for (const item of restoreLines) {
        await addBatch(tx, {
          productId: item.productId,
          locationType,
          locationId,
          quantity: item.quantity,
          costPerUnit: item.costPerUnit,
          salePrice: item.salePrice,
          notes: `sale_return:${existing.saleId}`,
          origin: BatchOrigin.RETURN,
          createdById: params.reviewerId,
        });
      }

      // Determine if entire sale is now returned
      const allApproved = await tx.saleReturnItem.findMany({
        where: {
          return: {
            saleId: existing.saleId,
            status: { in: ["APPROVED"] },
          },
        },
      });
      // Include current lines (not yet marked approved in DB until we update)
      const qtyMap = new Map<string, Prisma.Decimal>();
      for (const row of allApproved) {
        qtyMap.set(
          row.saleItemId,
          (qtyMap.get(row.saleItemId) ?? new Prisma.Decimal(0)).add(row.quantity)
        );
      }
      for (const row of restoreLines) {
        const key = row.saleItemId;
        qtyMap.set(
          key,
          (qtyMap.get(key) ?? new Prisma.Decimal(0)).add(row.quantity)
        );
      }

      let fullyReturned = true;
      for (const saleItem of existing.sale.items) {
        const retQty = qtyMap.get(saleItem.id) ?? new Prisma.Decimal(0);
        if (retQty.lt(saleItem.quantity)) {
          fullyReturned = false;
          break;
        }
      }

      await tx.sale.update({
        where: { id: existing.saleId },
        data: {
          status: fullyReturned
            ? SaleStatus.RETURNED
            : SaleStatus.PARTIAL_RETURN,
        },
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
      reasonCode: existing.reasonCode,
      restoredItems: restoreLines.map((l) => ({
        productId: l.productId,
        quantity: decimalToNumber(l.quantity),
      })),
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

export async function listSaleReturns(
  companyId: string,
  limit = 100,
  opts?: { storeId?: string | null }
) {
  const storeFilter =
    opts?.storeId === null
      ? { id: "__none__" }
      : opts?.storeId
        ? { companyId, id: opts.storeId }
        : { companyId };
  const rows = await prisma.saleReturn.findMany({
    where: { sale: { store: storeFilter } },
    include: {
      requester: { select: { id: true, name: true } },
      reviewer: { select: { id: true, name: true } },
      items: true,
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

  return rows.map((r) => {
    const amount =
      r.items.length > 0
        ? r.items.reduce(
            (s, i) =>
              s + decimalToNumber(i.salePrice) * decimalToNumber(i.quantity),
            0
          )
        : decimalToNumber(r.sale.total);
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      status: r.status,
      reason: r.reason,
      reasonCode: r.reasonCode,
      reviewNote: r.reviewNote,
      store: r.sale.store.name,
      seller: r.requester.name,
      product: r.sale.items.map((i) => i.product.name).join(", ") || "—",
      amount,
      saleId: r.saleId,
      partial: r.items.length > 0,
    };
  });
}
