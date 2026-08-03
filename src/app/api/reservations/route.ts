import { Role, ReservationStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requireSeller,
  requireStoreAccess,
  scopedStoreId,
} from "@/lib/rbac";
import { reservationCreateSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createReservation,
  listReservations,
} from "@/lib/services/reservation.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const sp = new URL(req.url).searchParams;
    const statusParam = sp.get("status");
    const limit = Math.min(Number(sp.get("limit") || 50), 100);

    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      if (!user.storeId) return handleApiError(new Error("SELLER_NO_STORE"));
      const rows = await listReservations({
        companyId: user.companyId,
        storeId: user.storeId,
        createdById: user.id,
        status:
          statusParam === "ALL"
            ? undefined
            : statusParam && statusParam in ReservationStatus
              ? (statusParam as ReservationStatus)
              : "ACTIVE_ONLY",
        limit,
      });
      return jsonOk(rows);
    }

    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const scope = scopedStoreId(user);
    const requested = sp.get("storeId") ?? undefined;
    if (scope !== undefined && requested && requested !== scope) {
      return handleApiError(new Error("FORBIDDEN"));
    }
    const storeId =
      scope === undefined ? requested : scope === null ? "__none__" : scope;

    const rows = await listReservations({
      companyId: user.companyId,
      storeId,
      status:
        statusParam === "ALL"
          ? undefined
          : statusParam && statusParam in ReservationStatus
            ? (statusParam as ReservationStatus)
            : "ACTIVE_ONLY",
      limit,
    });
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = reservationCreateSchema.parse(await req.json());

    let storeId = body.storeId;
    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      if (!user.storeId) return handleApiError(new Error("SELLER_NO_STORE"));
      storeId = user.storeId;
    } else {
      const denied = requireOwnerOrManager(user);
      if (denied) return denied;
      if (!storeId) return handleApiError(new Error("ID_REQUIRED"));
      const scopeDenied = requireStoreAccess(user, storeId);
      if (scopeDenied) return scopeDenied;
    }

    const reservation = await createReservation({
      companyId: user.companyId,
      storeId: storeId!,
      createdById: user.id,
      items: body.items,
      customerNote: body.customerNote ?? undefined,
      ttlMs: body.ttlMinutes ? body.ttlMinutes * 60 * 1000 : undefined,
    });

    return jsonOk(reservation, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
