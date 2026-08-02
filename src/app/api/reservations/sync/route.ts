import { getSessionUser } from "@/lib/session";
import { requireSeller } from "@/lib/rbac";
import { z } from "zod";
import { jsonOk, handleApiError } from "@/lib/api";
import { syncSellerCartReservation } from "@/lib/services/reservation.service";

const syncSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .default([]),
});

/** Auto-hold cart lines for seller (no TTL). Empty items = release hold. */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireSeller(user);
    if (denied) return denied;
    if (!user!.storeId) return handleApiError(new Error("SELLER_NO_STORE"));

    const body = syncSchema.parse(await req.json());
    const reservation = await syncSellerCartReservation({
      companyId: user!.companyId,
      storeId: user!.storeId,
      createdById: user!.id,
      items: body.items,
    });
    return jsonOk(reservation);
  } catch (err) {
    return handleApiError(err);
  }
}
