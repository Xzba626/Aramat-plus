import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireSeller } from "@/lib/rbac";
import { saleSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { createSale } from "@/lib/services/sale.service";
import { prisma } from "@/lib/prisma";

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
      return jsonOk(sales);
    }

    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const storeId = sp.get("storeId") ?? undefined;
    const sales = await prisma.sale.findMany({
      where: {
        store: { companyId: user.companyId },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        items: { include: { product: { select: { name: true } } } },
        seller: { select: { name: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return jsonOk(sales);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = saleSchema.parse(await req.json());

    let storeId = body.storeId;
    if (user.role === Role.SELLER) {
      const denied = requireSeller(user);
      if (denied) return denied;
      if (!user.storeId) {
        return handleApiError(new Error("SELLER_NO_STORE"));
      }
      storeId = user.storeId;
    } else {
      const denied = requireOwnerOrManager(user);
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
      paymentMethod: body.paymentMethod,
      notes: body.notes ?? undefined,
    });

    return jsonOk(sale, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
