/**
 * Notification Center metadata — derived from type/titleKey (no schema change).
 */

export type NotifSeverity = "info" | "warning" | "critical" | "success";

export type NotifCategory =
  | "security"
  | "warehouse"
  | "sales"
  | "returns"
  | "users"
  | "system";

export type NotifDayGroup = "today" | "yesterday" | "earlier";

const SECURITY_TITLE_KEYS = new Set([
  "notif.newLogin",
  "notif.passwordChanged",
  "notif.passwordReset",
]);

const SUCCESS_TITLE_KEYS = new Set([
  "notif.discountApproved",
  "notif.returnApproved",
  "notif.returnApprovedWarehouse",
  "notif.returnApprovedStore",
]);

const REJECT_TITLE_KEYS = new Set([
  "notif.discountRejected",
  "notif.returnRejected",
]);

export function isSecurityNotification(input: {
  type: string;
  titleKey?: string | null;
  title?: string | null;
}): boolean {
  const key = input.titleKey || input.title || "";
  return SECURITY_TITLE_KEYS.has(key);
}

export function resolveNotifSeverity(input: {
  type: string;
  titleKey?: string | null;
  title?: string | null;
}): NotifSeverity {
  const key = input.titleKey || input.title || "";
  const type = input.type.toUpperCase();

  if (key === "notif.newLogin") return "warning";
  if (SECURITY_TITLE_KEYS.has(key)) return "info";
  if (SUCCESS_TITLE_KEYS.has(key)) return "success";
  if (REJECT_TITLE_KEYS.has(key)) return "warning";

  if (type === "LOW_STOCK" || type === "DANGER") return "warning";
  if (type === "WARNING") return "warning";
  if (type === "DISCOUNT_REQUEST" || type === "RETURN_REQUEST") return "warning";
  if (type === "BATCH_EMPTY") return "critical";

  return "info";
}

export function resolveNotifCategory(input: {
  type: string;
  titleKey?: string | null;
  title?: string | null;
}): NotifCategory {
  const key = input.titleKey || input.title || "";
  const type = input.type.toUpperCase();

  if (SECURITY_TITLE_KEYS.has(key)) return "security";
  if (type === "LOW_STOCK" || type === "BATCH_EMPTY" || type === "TRANSFER_DONE" || type === "INVENTORY_DONE" || type === "DANGER" || type === "WARNING") {
    if (key.startsWith("dashboard.outOfStock") || key.startsWith("dashboard.stock")) {
      return "warehouse";
    }
    return "warehouse";
  }
  if (type === "RETURN_REQUEST" || key.startsWith("notif.return") || key === "dashboard.decisionReturn") {
    return "returns";
  }
  if (type === "DISCOUNT_REQUEST" || key.startsWith("notif.discount") || key === "dashboard.decisionDiscount") {
    return "sales";
  }
  if (type === "SYSTEM" && !SECURITY_TITLE_KEYS.has(key)) return "system";
  return "system";
}

/** Local calendar day group relative to `now` (browser/system local time). */
export function notifDayGroup(
  createdAt: Date | string | number,
  now: Date = new Date()
): NotifDayGroup {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (d >= startToday) return "today";
  if (d >= startYesterday) return "yesterday";
  return "earlier";
}

export function periodRange(
  period: "today" | "yesterday" | "week" | "month" | "custom",
  custom?: { from?: string; to?: string },
  now: Date = new Date()
): { from?: Date; to?: Date } {
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

  if (period === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (period === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  if (period === "month") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 29);
    return { from, to: endOfDay(now) };
  }
  const from = custom?.from ? new Date(custom.from) : undefined;
  const to = custom?.to ? new Date(custom.to) : undefined;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? endOfDay(to) : undefined,
  };
}

/** True for ephemeral dashboard attention chips (not DB rows). */
export function isEphemeralNotifId(id: string): boolean {
  return id.startsWith("dec-") || id.startsWith("stock-");
}

/**
 * Display IP for users — never show raw localhost / loopback.
 * Returns translation key marker `__LOCAL__` for UI to replace.
 */
export function formatIpForStorage(ip: string | null | undefined): string {
  if (!ip || !ip.trim()) return "—";
  // Re-use loopback detection; marker replaced in UI via sanitizeNotifMessageForDisplay
  const v = ip.trim().toLowerCase().replace(/^::ffff:/, "");
  if (
    v === "127.0.0.1" ||
    v === "::1" ||
    v === "localhost" ||
    v === "0:0:0:0:0:0:0:1" ||
    v === "0.0.0.0" ||
    v.startsWith("127.")
  ) {
    return "__LOCAL__";
  }
  return ip.trim();
}

/** Replace stored IP markers for display. */
export function sanitizeNotifMessageForDisplay(
  message: string,
  localLabel: string
): string {
  return message
    .replace(/\b__LOCAL__\b/g, localLabel)
    .replace(/\bIP:\s*(127\.0\.0\.1|::1|localhost)\b/gi, `IP: ${localLabel}`)
    .replace(
      /\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\s*UTC)?/gi,
      ""
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
