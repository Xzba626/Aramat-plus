import { Role, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  actionsForCategory,
  allKnownActions,
  categorizeActivityAction,
  getActivitySeverity,
  isJournalCategoryParam,
  type ActivityLogCategory,
  type ActivitySeverity,
} from "@/lib/activity-log-categories";
import {
  cleanUaLabel,
  ipForDisplay,
  parseUserAgent,
} from "@/lib/security/client-fingerprint";

export type JournalQueryInput = {
  companyId: string;
  category?: string | null;
  userId?: string | null;
  role?: string | null;
  storeId?: string | null;
  q?: string | null;
  period?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  limit?: number;
};

export type JournalLogDto = {
  id: string;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  role: string | null;
  action: string;
  category: ActivityLogCategory;
  severity: ActivitySeverity;
  entityType: string;
  entityId: string | null;
  comment: string | null;
  result: string | null;
  ip: string | null;
  /** Display-safe IP: real public IP, or null when local/unavailable */
  ipDisplay: string | null;
  /** local | unavailable | ok — UI picks i18n label when not ok */
  ipKind: "ok" | "local" | "unavailable";
  userAgent: string | null;
  browser: string | null;
  browserName: string | null;
  browserVersion: string | null;
  device: string | null;
  os: string | null;
  osName: string | null;
  osVersion: string | null;
  deviceType: string | null;
  deviceModel: string | null;
  country: string | null;
  city: string | null;
  email: string | null;
  storeId: string | null;
  storeName: string | null;
  /** Flattened highlight fields for rich cards */
  details: Array<{ key: string; value: string }>;
  metadata: Record<string, unknown> | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function periodRange(
  period: string | null | undefined,
  fromParam: string | null | undefined,
  toParam: string | null | undefined
): { gte?: Date; lte?: Date } | undefined {
  const now = new Date();
  if (fromParam || toParam) {
    const range: { gte?: Date; lte?: Date } = {};
    if (fromParam) {
      const f = new Date(fromParam);
      if (!Number.isNaN(f.getTime())) range.gte = f;
    }
    if (toParam) {
      const t = new Date(toParam);
      if (!Number.isNaN(t.getTime())) range.lte = t;
    }
    return Object.keys(range).length ? range : undefined;
  }
  if (!period || period === "all") return undefined;
  if (period === "today") return { gte: startOfDay(now), lte: now };
  if (period === "week") {
    return {
      gte: startOfDay(new Date(now.getTime() - 6 * 86_400_000)),
      lte: now,
    };
  }
  if (period === "month") {
    return { gte: new Date(now.getFullYear(), now.getMonth(), 1), lte: now };
  }
  if (period === "year") {
    return { gte: new Date(now.getFullYear(), 0, 1), lte: now };
  }
  return undefined;
}

function metaString(
  meta: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  if (!meta) return null;
  for (const k of keys) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function buildDetails(
  action: string,
  meta: Record<string, unknown> | null,
  parsedUa: {
    browser: string;
    device: string;
    os: string;
    deviceType: string;
  } | null
): Array<{ key: string; value: string }> {
  const details: Array<{ key: string; value: string }> = [];
  if (!meta && !parsedUa) return details;

  const push = (key: string, value: string | null | undefined) => {
    const cleaned = cleanUaLabel(value);
    if (cleaned) details.push({ key, value: cleaned });
  };

  // Login / security rows use dedicated fields on the card — skip UA stubs here
  const isAuth =
    action === "LOGIN" ||
    action === "LOGIN_FAIL" ||
    action === "LOGIN_LOCKED";

  push("product", metaString(meta, "productName", "skuName", "name"));
  push("quantity", metaString(meta, "quantity", "qty", "itemCount"));
  push(
    "amount",
    metaString(meta, "finalAmount", "amount", "total", "originalAmount")
  );
  push("discount", metaString(meta, "discountAmount"));
  push("oldPrice", metaString(meta, "oldPrice", "from"));
  push("newPrice", metaString(meta, "newPrice", "to", "price"));
  push("location", metaString(meta, "locationType", "locationName"));

  if (!isAuth) {
    if (parsedUa) {
      push("browser", parsedUa.browser);
      push("device", parsedUa.deviceType || parsedUa.device);
    } else {
      push("browser", metaString(meta, "browser"));
      push(
        "device",
        metaString(meta, "deviceType") ?? metaString(meta, "device")
      );
    }
  }

  if (action === "SALE_CREATE" && meta) {
    if (!details.some((d) => d.key === "quantity") && meta.itemCount != null) {
      push("quantity", String(meta.itemCount));
    }
  }

  return details;
}

/** Shared where-clause for list + export (same filters). */
export function buildJournalWhere(
  input: JournalQueryInput
): Prisma.ActivityLogWhereInput {
  const and: Prisma.ActivityLogWhereInput[] = [
    { companyId: input.companyId },
  ];

  const categoryRaw = input.category;
  if (
    categoryRaw &&
    categoryRaw !== "all" &&
    isJournalCategoryParam(categoryRaw)
  ) {
    if (categoryRaw === "other") {
      and.push({ action: { notIn: allKnownActions() } });
    } else {
      const actions = actionsForCategory(categoryRaw);
      if (actions?.length) and.push({ action: { in: actions } });
    }
  }

  if (input.userId) and.push({ userId: input.userId });

  const roleRaw = input.role;
  if (
    roleRaw === Role.OWNER ||
    roleRaw === Role.MANAGER ||
    roleRaw === Role.SELLER
  ) {
    and.push({ user: { role: roleRaw } });
  }

  if (input.storeId) {
    and.push({
      OR: [
        {
          metadata: {
            path: ["storeId"],
            equals: input.storeId,
          },
        },
        {
          metadata: {
            path: ["toStoreId"],
            equals: input.storeId,
          },
        },
      ],
    });
  }

  const createdAt = periodRange(input.period, input.from, input.to);
  if (createdAt) and.push({ createdAt });

  const q = (input.q || "").trim();
  if (q) {
    and.push({
      OR: [
        { action: { contains: q, mode: "insensitive" } },
        { comment: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { entityType: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { ip: { contains: q, mode: "insensitive" } },
        // Product name search (journal by merchandise)
        {
          metadata: {
            path: ["productName"],
            string_contains: q,
          },
        },
        {
          metadata: {
            path: ["productNames"],
            string_contains: q,
          },
        },
        {
          metadata: {
            path: ["skuName"],
            string_contains: q,
          },
        },
      ],
    });
  }

  return { AND: and };
}

/**
 * Prevent cross-tenant leakage via forged userId/storeId query params.
 * Invalid IDs collapse to an empty result set (no existence oracle).
 */
export async function sanitizeJournalScope(
  input: JournalQueryInput
): Promise<JournalQueryInput> {
  const next = { ...input };
  if (next.userId) {
    const u = await prisma.user.findFirst({
      where: { id: next.userId, companyId: next.companyId },
      select: { id: true },
    });
    if (!u) next.userId = "__none__";
  }
  if (next.storeId) {
    const s = await prisma.store.findFirst({
      where: { id: next.storeId, companyId: next.companyId },
      select: { id: true },
    });
    if (!s) next.storeId = "__none__";
  }
  return next;
}

export async function queryJournal(input: JournalQueryInput): Promise<{
  items: JournalLogDto[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const scoped = await sanitizeJournalScope(input);
  const page = Math.max(1, Number(scoped.page || 1) || 1);
  const limit = Math.min(50, Math.max(1, Number(scoped.limit || 30) || 30));
  const where = buildJournalWhere(scoped);

  const [total, rows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const items: JournalLogDto[] = rows.map((log) => {
    const meta =
      log.metadata &&
      typeof log.metadata === "object" &&
      !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : null;
    const email = metaString(meta, "email");
    const metaStoreId =
      metaString(meta, "storeId") ?? metaString(meta, "toStoreId");
    const storeName = metaString(meta, "storeName");
    const uaInfo = log.userAgent ? parseUserAgent(log.userAgent) : null;
    const browser = cleanUaLabel(
      metaString(meta, "browser") ?? uaInfo?.browser ?? null
    );
    const browserName = cleanUaLabel(
      metaString(meta, "browserName") ?? uaInfo?.browserName ?? null
    );
    const browserVersion = cleanUaLabel(
      metaString(meta, "browserVersion") ?? uaInfo?.browserVersion ?? null
    );
    const os = cleanUaLabel(metaString(meta, "os") ?? uaInfo?.os ?? null);
    const osName = cleanUaLabel(
      metaString(meta, "osName") ?? uaInfo?.osName ?? null
    );
    const osVersion = cleanUaLabel(
      metaString(meta, "osVersion") ?? uaInfo?.osVersion ?? null
    );
    const deviceType = cleanUaLabel(
      metaString(meta, "deviceType") ?? uaInfo?.deviceType ?? null
    );
    const deviceModel = cleanUaLabel(
      metaString(meta, "deviceModel") ?? uaInfo?.deviceModel ?? null
    );
    const device = cleanUaLabel(
      metaString(meta, "device") ??
        uaInfo?.device ??
        (deviceType
          ? deviceModel
            ? deviceModel
            : deviceType
          : null) ??
        null
    );
    const country = cleanUaLabel(metaString(meta, "country"));
    const city = cleanUaLabel(metaString(meta, "city"));
    const ipInfo = ipForDisplay(log.ip);
    const metaName = metaString(meta, "userName");

    return {
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      userId: log.userId,
      userName: log.user?.name?.trim() || metaName || null,
      role: log.user?.role ?? metaString(meta, "role") ?? null,
      action: log.action,
      category: categorizeActivityAction(log.action),
      severity: getActivitySeverity(log.action, log.result),
      entityType: log.entityType,
      entityId: log.entityId,
      comment: log.comment,
      result: log.result,
      ip: log.ip,
      ipDisplay: ipInfo.value,
      ipKind: ipInfo.kind,
      userAgent: log.userAgent,
      browser,
      browserName,
      browserVersion,
      device,
      os,
      osName,
      osVersion,
      deviceType,
      deviceModel,
      country,
      city,
      email,
      storeId: metaStoreId,
      storeName,
      details: buildDetails(log.action, meta, uaInfo),
      metadata: meta,
    };
  });

  const missingNameIds = [
    ...new Set(
      items
        .filter((i) => i.storeId && !i.storeName)
        .map((i) => i.storeId as string)
    ),
  ];
  if (missingNameIds.length) {
    const stores = await prisma.store.findMany({
      where: { id: { in: missingNameIds }, companyId: input.companyId },
      select: { id: true, name: true },
    });
    const nameById = new Map(stores.map((s) => [s.id, s.name]));
    for (const item of items) {
      if (item.storeId && !item.storeName) {
        item.storeName = nameById.get(item.storeId) ?? null;
      }
    }
  }

  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Parse list filters from URLSearchParams (list + export share this). */
export function journalInputFromSearchParams(
  companyId: string,
  sp: URLSearchParams
): JournalQueryInput {
  return {
    companyId,
    category: sp.get("category"),
    userId: sp.get("userId"),
    role: sp.get("role"),
    storeId: sp.get("storeId"),
    q: sp.get("q"),
    period: sp.get("period"),
    from: sp.get("from"),
    to: sp.get("to"),
    page: Number(sp.get("page") || 1) || 1,
    limit: Number(sp.get("limit") || 30) || 30,
  };
}
