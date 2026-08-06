import { getSessionUser } from "@/lib/session";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { scopedStoreId, isOwnerClass } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const dbUnread = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });

    // Owner/Manager: also count unread-style dashboard attention chips
    let dashUnread = 0;
    if (isOwnerClass(user.role) || user.role === Role.MANAGER) {
      const { getDashboardPayload } = await import(
        "@/lib/services/dashboard.service"
      );
      const scope = scopedStoreId(user);
      const dash = await getDashboardPayload(user.companyId, {
        storeId: scope === undefined ? undefined : scope,
      });
      dashUnread = dash.notifications.length;
    }

    return jsonOk({ unread: dbUnread + dashUnread });
  } catch (err) {
    return handleApiError(err);
  }
}
