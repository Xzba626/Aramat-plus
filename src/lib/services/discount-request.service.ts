import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  notifyCompanyRoles,
  notifyUser,
} from "@/lib/services/notification.service";
import { decimalToNumber } from "@/lib/utils";
import {
  cartCompositionMatchesSnapshot,
  cartMatchesSnapshot,
  type CartFingerprintLine,
} from "@/lib/pos/cart-fingerprint";

export type DiscountCartLine = CartFingerprintLine;

export function serializeDiscountRequest(row: {
  id: string;
  status: string;
  originalAmount: Prisma.Decimal | number;
  amount: Prisma.Decimal | number;
  percent: Prisma.Decimal | number | null;
  reason: string | null;
  reviewNote: string | null;
  storeId: string | null;
  saleId: string | null;
  cartSnapshot: unknown;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewerId: string | null;
  requesterId: string;
}) {
  const original = decimalToNumber(row.originalAmount as never);
  const discount = decimalToNumber(row.amount as never);
  return {
    id: row.id,
    status: row.status,
    originalAmount: original,
    discountAmount: discount,
    finalAmount: Math.round((original - discount) * 100) / 100,
    percent: row.percent != null ? decimalToNumber(row.percent as never) : null,
    reason: row.reason,
    reviewNote: row.reviewNote,
    storeId: row.storeId,
    saleId: row.saleId,
    cartSnapshot: row.cartSnapshot,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewerId: row.reviewerId,
    requesterId: row.requesterId,
  };
}

export async function createDiscountRequest(params: {
  companyId: string;
  requesterId: string;
  storeId: string;
  originalAmount: number;
  amount: number;
  percent?: number;
  reason?: string;
  items: DiscountCartLine[];
  saleId?: string;
}) {
  const requester = await prisma.user.findFirst({
    where: {
      id: params.requesterId,
      companyId: params.companyId,
      isActive: true,
    },
  });
  if (!requester) throw new Error("USER_NOT_FOUND");

  if (!(params.originalAmount > 0)) throw new Error("VALIDATION_ERROR");
  if (!(params.amount > 0)) throw new Error("VALIDATION_ERROR");
  if (params.amount > params.originalAmount + 1e-9) {
    throw new Error("DISCOUNT_EXCEEDS_TOTAL");
  }
  if (!params.items.length) throw new Error("EMPTY_CART");

  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      isActive: true,
    },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");

  if (requester.role === Role.SELLER) {
    if (!requester.storeId || requester.storeId !== params.storeId) {
      throw new Error("SELLER_WRONG_STORE");
    }
  }

  const recomputed = params.items.reduce(
    (s, i) => s + i.salePrice * i.quantity,
    0
  );
  if (Math.abs(recomputed - params.originalAmount) > 0.05) {
    throw new Error("CART_TOTAL_MISMATCH");
  }

  await prisma.discountRequest.updateMany({
    where: {
      requesterId: params.requesterId,
      storeId: params.storeId,
      status: { in: ["PENDING", "APPROVED"] },
      saleId: null,
    },
    data: {
      status: "REJECTED",
      reviewNote: "SUPERSEDED",
      reviewedAt: new Date(),
    },
  });

  if (params.saleId) {
    const sale = await prisma.sale.findFirst({
      where: {
        id: params.saleId,
        store: { companyId: params.companyId },
      },
    });
    if (!sale) throw new Error("NOT_FOUND");
  }

  const row = await prisma.discountRequest.create({
    data: {
      companyId: params.companyId,
      storeId: params.storeId,
      requesterId: params.requesterId,
      saleId: params.saleId ?? null,
      originalAmount: new Prisma.Decimal(params.originalAmount),
      amount: new Prisma.Decimal(params.amount),
      percent:
        params.percent != null ? new Prisma.Decimal(params.percent) : null,
      reason: params.reason?.trim() || null,
      cartSnapshot: params.items,
      status: "PENDING",
    },
  });

  await logActivity({
    userId: params.requesterId,
    companyId: params.companyId,
    action: "DISCOUNT_REQUEST",
    entityType: "DiscountRequest",
    entityId: row.id,
    comment: params.reason,
    metadata: {
      originalAmount: params.originalAmount,
      discountAmount: params.amount,
      finalAmount: params.originalAmount - params.amount,
      percent: params.percent ?? null,
      storeId: params.storeId,
      itemCount: params.items.length,
    },
  });

  await notifyCompanyRoles({
    companyId: params.companyId,
    roles: [Role.OWNER, Role.ADMIN, Role.MANAGER],
    type: "DISCOUNT_REQUEST",
    title: "notif.discountRequest",
    message: `${requester.name} · ${store.name} · ${params.originalAmount} → ${
      params.originalAmount - params.amount
    } (−${params.amount})`,
    entityType: "DiscountRequest",
    entityId: row.id,
  });

  return serializeDiscountRequest(row);
}

export async function decideDiscountRequest(params: {
  companyId: string;
  requestId: string;
  reviewerId: string;
  decision: "APPROVE" | "REJECT";
  note?: string;
}) {
  const existing = await prisma.discountRequest.findFirst({
    where: {
      id: params.requestId,
      companyId: params.companyId,
      status: "PENDING",
    },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const status = params.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const updated = await prisma.discountRequest.update({
    where: { id: existing.id },
    data: {
      status,
      reviewerId: params.reviewerId,
      reviewedAt: new Date(),
      reviewNote: params.note?.trim() || null,
    },
  });

  await logActivity({
    userId: params.reviewerId,
    companyId: params.companyId,
    action:
      params.decision === "APPROVE" ? "DISCOUNT_APPROVE" : "DISCOUNT_REJECT",
    entityType: "DiscountRequest",
    entityId: existing.id,
    comment: params.note,
    metadata: {
      originalAmount: decimalToNumber(existing.originalAmount),
      discountAmount: decimalToNumber(existing.amount),
      finalAmount:
        decimalToNumber(existing.originalAmount) -
        decimalToNumber(existing.amount),
    },
  });

  const original = decimalToNumber(existing.originalAmount);
  const discount = decimalToNumber(existing.amount);
  await notifyUser({
    userId: existing.requesterId,
    type: "SYSTEM",
    title:
      params.decision === "APPROVE"
        ? "notif.discountApproved"
        : "notif.discountRejected",
    message:
      params.note?.trim() ||
      `${original} → ${Math.round((original - discount) * 100) / 100}`,
    entityType: "DiscountRequest",
    entityId: existing.id,
  });

  return serializeDiscountRequest(updated);
}

export async function getDiscountRequestForSeller(params: {
  companyId: string;
  requesterId: string;
  requestId: string;
}) {
  const row = await prisma.discountRequest.findFirst({
    where: {
      id: params.requestId,
      companyId: params.companyId,
      requesterId: params.requesterId,
    },
  });
  if (!row) throw new Error("NOT_FOUND");
  return serializeDiscountRequest(row);
}

/** Latest unused APPROVED or PENDING request for seller cart. */
export async function getActiveDiscountForCart(params: {
  companyId: string;
  requesterId: string;
  storeId: string;
}) {
  const row = await prisma.discountRequest.findFirst({
    where: {
      companyId: params.companyId,
      requesterId: params.requesterId,
      storeId: params.storeId,
      saleId: null,
      status: { in: ["PENDING", "APPROVED"] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  const used = await prisma.sale.findFirst({
    where: { discountRequestId: row.id },
    select: { id: true },
  });
  if (used) return null;
  return serializeDiscountRequest(row);
}

/**
 * Consume an APPROVED discount into a sale (inside TX).
 * Returns discountAmount + approver metadata.
 */
export async function consumeApprovedDiscount(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    discountRequestId: string;
    sellerId: string;
    storeId: string;
    cartItems: DiscountCartLine[];
    cartSubtotal: number;
  }
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "DiscountRequest"
    WHERE id = ${params.discountRequestId}
      AND "companyId" = ${params.companyId}
    FOR UPDATE
  `;
  if (!rows.length) throw new Error("DISCOUNT_NOT_FOUND");

  const req = await tx.discountRequest.findFirst({
    where: { id: params.discountRequestId, companyId: params.companyId },
  });
  if (!req) throw new Error("DISCOUNT_NOT_FOUND");
  if (req.requesterId !== params.sellerId) throw new Error("FORBIDDEN");
  if (req.storeId && req.storeId !== params.storeId) {
    throw new Error("DISCOUNT_WRONG_STORE");
  }
  if (req.status !== "APPROVED") throw new Error("DISCOUNT_NOT_APPROVED");
  if (req.saleId) throw new Error("DISCOUNT_ALREADY_USED");

  const already = await tx.sale.findFirst({
    where: { discountRequestId: req.id },
    select: { id: true },
  });
  if (already) throw new Error("DISCOUNT_ALREADY_USED");

  if (!cartCompositionMatchesSnapshot(params.cartItems, req.cartSnapshot)) {
    throw new Error("CART_CHANGED");
  }

  // Approved discount amount is fixed; apply against FIFO-based subtotal (may differ from estimate).
  const discountAmount = decimalToNumber(req.amount);
  if (discountAmount > params.cartSubtotal + 1e-9) {
    throw new Error("DISCOUNT_EXCEEDS_TOTAL");
  }

  return {
    discountAmount,
    originalAmount: decimalToNumber(req.originalAmount),
    approvedById: req.reviewerId,
    approvedAt: req.reviewedAt,
    requestId: req.id,
  };
}

export async function linkDiscountToSale(
  tx: Prisma.TransactionClient,
  params: {
    discountRequestId: string;
    saleId: string;
  }
) {
  await tx.discountRequest.update({
    where: { id: params.discountRequestId },
    data: { saleId: params.saleId },
  });
}

export async function listDiscountRequests(
  companyId: string,
  limit = 100,
  opts?: { storeId?: string | null }
) {
  const rows = await prisma.discountRequest.findMany({
    where: {
      companyId,
      status: { in: ["PENDING", "APPROVED", "REJECTED"] },
      ...(opts?.storeId === null
        ? { storeId: "__none__" }
        : opts?.storeId
          ? { storeId: opts.storeId }
          : {}),
    },
    include: {
      requester: { select: { name: true } },
      store: { select: { name: true } },
      reviewer: { select: { name: true } },
      sale: {
        include: {
          store: { select: { name: true } },
          items: {
            take: 5,
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => {
    const base = serializeDiscountRequest(row);
    const fromSale =
      row.sale?.items.map((i) => i.product.name).filter(Boolean).join(", ") ??
      "";
    let fromCart = "";
    if (!fromSale && Array.isArray(row.cartSnapshot)) {
      fromCart = (row.cartSnapshot as Array<{ name?: string }>)
        .map((l) => l.name)
        .filter(Boolean)
        .join(", ");
    }
    return {
      ...base,
      storeName: row.store?.name ?? row.sale?.store.name ?? "—",
      requesterName: row.requester.name,
      reviewerName: row.reviewer?.name ?? null,
      products: fromSale || fromCart,
    };
  });
}
