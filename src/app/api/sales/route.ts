import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  canApplyDirectDiscount,
  requireOwner,
  requirePermission,
  requireSeller,
  requireStoreAccess,
  resolveScopedStoreFilter,
} from "@/lib/rbac";
import { saleSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { createSale } from "@/lib/services/sale.service";
import { prisma } from "@/lib/prisma";
import { stripFinanceForRole } from "@/lib/finance-visibility";
import { allowActionRate } from "@/lib/security/action-rate-limit";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const sp = new URL(req.url).searchParams;
    const limit = Math.min(Number(sp.get("limit") || 50), 100);

    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      const sales = await prisma.sale.findMany({
        where: { sellerId: user.id },
        include: {
          items: { include: { product: { select: { name: true } } } },
          store: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return jsonOk(stripFinanceForRole(user, sales));
    }

    if (user.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "sales.view");
      if (permDenied) return permDenied;

      const scope = await resolveScopedStoreFilter(user);
      const requested = sp.get("storeId") ?? undefined;
      if (requested) {
        const scopeDenied = await requireStoreAccess(user, requested);
        if (scopeDenied) return scopeDenied;
      }

      const storeFilter = requested
        ? { storeId: requested }
        : scope.all
          ? {}
          : scope.storeIds.length
            ? { storeId: { in: scope.storeIds } }
            : { storeId: "__none__" };

      const sales = await prisma.sale.findMany({
        where: {
          store: { companyId: user.companyId },
          ...storeFilter,
        },
        include: {
          items: { include: { product: { select: { name: true } } } },
          seller: { select: { name: true } },
          store: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return jsonOk(stripFinanceForRole(user, sales));
    }

    const denied = requireOwner(user);
    if (denied) return denied;

    const requested = sp.get("storeId") ?? undefined;
    const sales = await prisma.sale.findMany({
      where: {
        store: { companyId: user.companyId },
        ...(requested ? { storeId: requested } : {}),
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
        seller: { select: { name: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return jsonOk(stripFinanceForRole(user, sales));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    if (!allowActionRate(`sale:${user.id}`, 60, 60_000)) {
      return handleApiError(new Error("RATE_LIMITED"));
    }

    const body = saleSchema.parse(await req.json());

    let storeId = body.storeId;
    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      if (!user.storeId) {
        return handleApiError(new Error("SELLER_NO_STORE"));
      }
      storeId = user.storeId;
    } else if (user.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "sales.create");
      if (permDenied) return permDenied;
      if (!storeId) {
        return handleApiError(new Error("ID_REQUIRED"));
      }
      const scopeDenied = await requireStoreAccess(user, storeId);
      if (scopeDenied) return scopeDenied;
    } else {
      const denied = requireOwner(user);
      if (denied) return denied;
      if (!storeId) {
        return handleApiError(new Error("ID_REQUIRED"));
      }
    }

    const sale = await createSale({
      companyId: user.companyId,
      storeId: storeId!,
      sellerId: user.id,
      items: body.items,
      discountAmount: body.discountAmount,
      discountRequestId: body.discountRequestId,
      paymentMethod: body.paymentMethod,
      notes: body.notes ?? undefined,
      reservationId: body.reservationId,
      enforceApprovedDiscount: !canApplyDirectDiscount(user.role),
    });

    return jsonOk(stripFinanceForRole(user, sale), 201);
  } catch (err) {
    return handleApiError(err);
  }
}
