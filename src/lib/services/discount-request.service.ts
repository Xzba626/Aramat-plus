import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  notifyCompanyRoles,
  notifyUser,
} from "@/lib/services/notification.service";
import { decimalToNumber } from "@/lib/utils";

export async function createDiscountRequest(params: {
  companyId: string;
  requesterId: string;
  amount: number;
  percent?: number;
  reason?: string;
  saleId?: string;
}) {
  const requester = await prisma.user.findFirst({
    where: { id: params.requesterId, companyId: params.companyId, isActive: true },
  });
  if (!requester) throw new Error("USER_NOT_FOUND");

  if (params.amount < 0) throw new Error("VALIDATION_ERROR");

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
      requesterId: params.requesterId,
      saleId: params.saleId ?? null,
      amount: new Prisma.Decimal(params.amount),
      percent:
        params.percent != null ? new Prisma.Decimal(params.percent) : null,
      reason: params.reason?.trim() || null,
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
      amount: params.amount,
      percent: params.percent ?? null,
      saleId: params.saleId ?? null,
    },
  });

  await notifyCompanyRoles({
    companyId: params.companyId,
    type: "DISCOUNT_REQUEST",
    title: "notif.discountRequest",
    message: `${requester.name} · ${params.amount}${
      params.percent != null ? ` (${params.percent}%)` : ""
    }`,
    entityType: "DiscountRequest",
    entityId: row.id,
  });

  return row;
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
      status: "PENDING",
      OR: [
        { sale: { store: { companyId: params.companyId } } },
        { requester: { companyId: params.companyId } },
      ],
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
    action: params.decision === "APPROVE" ? "DISCOUNT_APPROVE" : "DISCOUNT_REJECT",
    entityType: "DiscountRequest",
    entityId: existing.id,
    comment: params.note,
  });

  await notifyUser({
    userId: existing.requesterId,
    type: "SYSTEM",
    title:
      params.decision === "APPROVE"
        ? "notif.discountApproved"
        : "notif.discountRejected",
    message:
      params.note?.trim() ||
      `${decimalToNumber(existing.amount)}`,
    entityType: "DiscountRequest",
    entityId: existing.id,
  });

  return updated;
}
