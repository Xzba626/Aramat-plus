import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const sessions = await prisma.inventorySession.findMany({
      where: { store: { companyId: user!.companyId } },
      include: {
        store: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return jsonOk(
      sessions.map((s) => {
        const variance = s.items.reduce((sum, it) => {
          return sum + Math.abs(decimalToNumber(it.difference));
        }, 0);
        return {
          id: s.id,
          storeId: s.store.id,
          store: s.store.name,
          createdBy: s.createdBy.name,
          approvedBy: s.approvedBy?.name ?? null,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          completedAt: s.completedAt?.toISOString() ?? null,
          itemCount: s.items.length,
          varianceAbs: Math.round(variance * 1000) / 1000,
          comment: s.comment,
        };
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
