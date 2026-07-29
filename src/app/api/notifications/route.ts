import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getDashboardPayload } from "@/lib/services/dashboard.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const [dbRows, dash] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      getDashboardPayload(user!.companyId),
    ]);

    const fromDb = dbRows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
      href: null as string | null,
    }));

    const fromDash = dash.notifications.map((n) => ({
      id: n.id,
      type: n.tone,
      title: n.title,
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
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const body = (await req.json()) as { action?: string };
    if (body.action === "markAllRead") {
      await prisma.notification.updateMany({
        where: { userId: user!.id, isRead: false },
        data: { isRead: true },
      });
    }

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
