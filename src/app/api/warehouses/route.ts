import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const warehouses = await prisma.warehouse.findMany({
      where: { companyId: user!.companyId, isActive: true },
      orderBy: { name: "asc" },
    });
    return jsonOk(warehouses);
  } catch (err) {
    return handleApiError(err);
  }
}
