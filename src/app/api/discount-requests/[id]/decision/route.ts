import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { handleApiError, jsonOk } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const body = await req.json();
    const decision = body.decision as "APPROVE" | "REJECT";
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return handleApiError(new Error("decision: APPROVE | REJECT"));
    }

    const existing = await prisma.discountRequest.findFirst({
      where: {
        id,
        status: "PENDING",
        OR: [
          { sale: { store: { companyId: user!.companyId } } },
          { requester: { companyId: user!.companyId } },
        ],
      },
    });
    if (!existing) return handleApiError(new Error("Запрос не найден"));

    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const updated = await prisma.discountRequest.update({
      where: { id },
      data: {
        status,
        reviewerId: user!.id,
        reviewedAt: new Date(),
        reviewNote: body.note ? String(body.note) : null,
      },
    });

    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: decision === "APPROVE" ? "DISCOUNT_APPROVE" : "DISCOUNT_REJECT",
      entityType: "DiscountRequest",
      entityId: id,
      comment: body.note ? String(body.note) : undefined,
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
