import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  canApplyDirectDiscount,
  requireOwnerOrManager,
  requireSeller,
  requireStoreAccess,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { cancelReservation } from "@/lib/services/reservation.service";
import { createSale } from "@/lib/services/sale.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const decideSchema = z.object({
  action: z.enum(["CANCEL", "COMPLETE"]),
  paymentMethod: z.string().max(40).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const { id } = await ctx.params;
    const body = decideSchema.parse(await req.json());

    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
    } else {
      const denied = requireOwnerOrManager(user);
      if (denied) return denied;
    }

    const reservation = await prisma.reservation.findFirst({
      where: { id, companyId: user.companyId },
      include: { items: true },
    });
    if (!reservation) return handleApiError(new Error("RESERVATION_NOT_FOUND"));

    const storeDenied = requireStoreAccess(user, reservation.storeId);
    if (storeDenied) return storeDenied;

    if (body.action === "CANCEL") {
      if (user.role === Role.SELLER && reservation.createdById !== user.id) {
        return handleApiError(new Error("FORBIDDEN"));
      }
      const row = await cancelReservation({
        companyId: user.companyId,
        reservationId: id,
        userId: user.id,
        asSeller: user.role === Role.SELLER,
      });
      return jsonOk(row);
    }

    if (user.role === Role.SELLER) {
      if (reservation.createdById !== user.id) {
        return handleApiError(new Error("FORBIDDEN"));
      }
      if (!user.storeId || user.storeId !== reservation.storeId) {
        return handleApiError(new Error("SELLER_WRONG_STORE"));
      }
    }

    const sale = await createSale({
      companyId: user.companyId,
      storeId: reservation.storeId,
      sellerId: user.id,
      reservationId: reservation.id,
      paymentMethod: body.paymentMethod,
      discountAmount: body.discountAmount,
      notes: body.notes ?? undefined,
      enforceApprovedDiscount: !canApplyDirectDiscount(user.role),
      items: reservation.items.map((it) => ({
        productId: it.productId,
        quantity: Number(it.quantity),
      })),
    });

    return jsonOk(sale, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
