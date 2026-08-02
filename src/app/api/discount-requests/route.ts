import { Role } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  createDiscountRequest,
  getActiveDiscountForCart,
  getDiscountRequestForSeller,
  listDiscountRequests,
} from "@/lib/services/discount-request.service";

const createSchema = z.object({
  storeId: z.string().min(1).optional(),
  amount: z.coerce.number().positive(),
  originalAmount: z.coerce.number().positive(),
  percent: z.coerce.number().min(0).max(100).optional(),
  reason: z.string().min(1).max(500),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        salePrice: z.coerce.number().min(0),
      })
    )
    .min(1),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const sp = new URL(req.url).searchParams;
    const id = sp.get("id");
    if (id) {
      if (user.role === Role.SELLER) {
        return jsonOk(
          await getDiscountRequestForSeller({
            companyId: user.companyId,
            requesterId: user.id,
            requestId: id,
          })
        );
      }
      const { prisma } = await import("@/lib/prisma");
      const { serializeDiscountRequest } = await import(
        "@/lib/services/discount-request.service"
      );
      const row = await prisma.discountRequest.findFirst({
        where: { id, companyId: user.companyId },
      });
      if (!row) return handleApiError(new Error("NOT_FOUND"));
      return jsonOk(serializeDiscountRequest(row));
    }

    if (user.role === Role.SELLER) {
      if (!user.storeId) return handleApiError(new Error("SELLER_NO_STORE"));
      const active = await getActiveDiscountForCart({
        companyId: user.companyId,
        requesterId: user.id,
        storeId: user.storeId,
      });
      return jsonOk(active);
    }

    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const limit = Math.min(
      Number(sp.get("limit") || 100),
      200
    );
    return jsonOk(await listDiscountRequests(user.companyId, limit));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));
    if (
      user.role !== Role.SELLER &&
      user.role !== Role.OWNER &&
      user.role !== Role.MANAGER
    ) {
      return handleApiError(new Error("FORBIDDEN"));
    }

    const body = createSchema.parse(await req.json());
    let storeId = body.storeId;
    if (user.role === Role.SELLER) {
      if (!user.storeId) return handleApiError(new Error("SELLER_NO_STORE"));
      storeId = user.storeId;
    } else if (!storeId) {
      return handleApiError(new Error("ID_REQUIRED"));
    }

    const row = await createDiscountRequest({
      companyId: user.companyId,
      requesterId: user.id,
      storeId: storeId!,
      originalAmount: body.originalAmount,
      amount: body.amount,
      percent: body.percent,
      reason: body.reason,
      items: body.items,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
