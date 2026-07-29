import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const rows = await prisma.activityLog.findMany({
      where: { companyId: user!.companyId },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return jsonOk(
      rows.map((log) => ({
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        userName: log.user?.name ?? null,
        role: log.user?.role ?? null,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        comment: log.comment,
        result: log.result,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}
