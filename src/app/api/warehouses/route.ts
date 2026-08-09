import { getSessionUser } from "@/lib/session";
import { isOwnerClass, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    // MANAGER: id/name only (transfer UI). No stock/inventory payload.
    if (!isOwnerClass(user!.role)) {
      const warehouses = await prisma.warehouse.findMany({
        where: { companyId: user!.companyId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true },
      });
      return jsonOk(warehouses);
    }

    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: user!.companyId, isActive: true },
      orderBy: { name: "asc" },
    });
    return jsonOk(warehouses);
  } catch (err) {
    return handleApiError(err);
  }
}
