import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const dbRows = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 80,
    });

    const fromDb = dbRows.map((n) => {
      const isKey = /^[a-zA-Z][\w.]*$/.test(n.title);
      return {
        id: n.id,
        type: n.type,
        title: isKey ? null : n.title,
        titleKey: isKey ? n.title : null,
        message: n.message,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
        href: null as string | null,
      };
    });

    // Owner/Manager also see dashboard attention chips
    if (user.role === Role.OWNER || user.role === Role.MANAGER) {
      const { getDashboardPayload } = await import(
        "@/lib/services/dashboard.service"
      );
      const dash = await getDashboardPayload(user.companyId);
      const fromDash = dash.notifications.map((n) => ({
        id: n.id,
        type: n.tone,
        title: null as string | null,
        titleKey: n.titleKey,
        message: n.message,
        isRead: false,
        createdAt: n.createdAt,
        href: n.href,
      }));
      const merged = [...fromDb, ...fromDash].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return jsonOk(merged.slice(0, 60));
    }

    return jsonOk(fromDb);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = (await req.json()) as { action?: string; id?: string };
    if (body.action === "markAllRead") {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
    }
    if (body.action === "markRead" && body.id) {
      await prisma.notification.updateMany({
        where: { id: body.id, userId: user.id },
        data: { isRead: true },
      });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
