import { Prisma, Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { scopedStoreId } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  isEphemeralNotifId,
  periodRange,
  resolveNotifCategory,
  resolveNotifSeverity,
} from "@/lib/notifications/notification-meta";
import { isProofArtifactNotificationMessage } from "@/lib/proof-artifacts";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function mapDbRow(n: {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  entityType: string | null;
  entityId: string | null;
}) {
  const isKey = /^[a-zA-Z][\w.]*$/.test(n.title);
  const titleKey = isKey ? n.title : null;
  const title = isKey ? null : n.title;
  const base = {
    id: n.id,
    type: n.type,
    title,
    titleKey,
    message: n.message,
    isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
    href: null as string | null,
    entityType: n.entityType,
    entityId: n.entityId,
    ephemeral: false,
  };
  return {
    ...base,
    severity: resolveNotifSeverity(base),
    category: resolveNotifCategory(base),
  };
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const url = new URL(req.url);
    const view = url.searchParams.get("view") === "history" ? "history" : "feed";
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit") || DEFAULT_LIMIT) || DEFAULT_LIMIT)
    );
    const cursor = url.searchParams.get("cursor"); // `${iso}|${id}`
    const typeFilter = url.searchParams.get("type");
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const periodParam = url.searchParams.get("period") as
      | "today"
      | "yesterday"
      | "week"
      | "month"
      | "custom"
      | null;

    // Prefer explicit from/to (client local calendar). Fallback: server period helper.
    let range: { from?: Date; to?: Date } = {};
    if (fromParam || toParam) {
      range = {
        from: fromParam ? new Date(fromParam) : undefined,
        to: toParam ? new Date(toParam) : undefined,
      };
      if (range.from && Number.isNaN(range.from.getTime())) range.from = undefined;
      if (range.to && Number.isNaN(range.to.getTime())) range.to = undefined;
    } else if (view === "history" && periodParam) {
      range = periodRange(periodParam, {
        from: undefined,
        to: undefined,
      });
    }

    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(typeFilter ? { type: typeFilter as never } : {}),
    };

    const and: Prisma.NotificationWhereInput[] = [];

    if (range.from || range.to) {
      and.push({
        createdAt: {
          ...(range.from ? { gte: range.from } : {}),
          ...(range.to ? { lte: range.to } : {}),
        },
      });
    }

    if (cursor) {
      const [iso, id] = cursor.split("|");
      const cursorDate = new Date(iso);
      if (!Number.isNaN(cursorDate.getTime()) && id) {
        and.push({
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: id } },
          ],
        });
      }
    }

    if (and.length) where.AND = and;

    const dbRows = await prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });

    const hasMore = dbRows.length > limit;
    const page = hasMore ? dbRows.slice(0, limit) : dbRows;
    let items = page
      .filter((n) => !isProofArtifactNotificationMessage(n.message))
      .map(mapDbRow);

    // Feed only: merge live dashboard attention chips on first page
    if (
      view === "feed" &&
      !cursor &&
      (user.role === Role.OWNER || user.role === Role.MANAGER)
    ) {
      const { getDashboardPayload } = await import(
        "@/lib/services/dashboard.service"
      );
      const scope = scopedStoreId(user);
      const dash = await getDashboardPayload(user.companyId, {
        storeId: scope === undefined ? undefined : scope,
      });
      const fromDash = dash.notifications.map((n) => {
        const base = {
          id: n.id,
          type: n.tone,
          title: null as string | null,
          titleKey: n.titleKey,
          message: n.message,
          isRead: false,
          createdAt:
            typeof n.createdAt === "string"
              ? n.createdAt
              : new Date(n.createdAt).toISOString(),
          href: n.href,
          entityType: null as string | null,
          entityId: null as string | null,
          ephemeral: true,
        };
        return {
          ...base,
          severity: resolveNotifSeverity(base),
          category: resolveNotifCategory(base),
        };
      });
      items = [...fromDash, ...items]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, limit);
    }

    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null;

    return jsonOk({ items, nextCursor, hasMore });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = (await req.json()) as {
      action?: string;
      id?: string;
    };

    if (body.action === "markAllRead") {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true },
      });
      return jsonOk({ ok: true });
    }

    if (body.action === "markRead" && body.id) {
      if (!isEphemeralNotifId(body.id)) {
        await prisma.notification.updateMany({
          where: { id: body.id, userId: user.id },
          data: { isRead: true },
        });
      }
      return jsonOk({ ok: true });
    }

    if (body.action === "delete" && body.id) {
      if (isEphemeralNotifId(body.id)) {
        return jsonOk({ ok: true, skipped: true });
      }
      await prisma.notification.deleteMany({
        where: { id: body.id, userId: user.id },
      });
      return jsonOk({ ok: true });
    }

    return handleApiError(new Error("VALIDATION_ERROR"));
  } catch (err) {
    return handleApiError(err);
  }
}
