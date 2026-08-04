import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/services/notification.service";
import {
  parseUserAgent,
  type ClientDeviceInfo,
} from "@/lib/security/client-fingerprint";
import { formatIpForStorage } from "@/lib/notifications/notification-meta";

function formatLoginDetails(params: {
  info: ClientDeviceInfo;
  ip: string | null;
}) {
  // Time is shown from Notification.createdAt via formatDateTime (local).
  const lines = [
    params.info.deviceType || params.info.device,
    params.info.browser,
    params.info.os,
    `IP: ${formatIpForStorage(params.ip)}`,
  ].filter((line) => line && String(line).trim());
  return lines.join("\n");
}

/**
 * After a successful LOGIN activity row is written: notify the user if
 * IP or browser/device fingerprint was not seen in recent successful logins.
 * Skips the very first login (nothing to compare).
 */
export async function notifyIfNewLogin(params: {
  userId: string;
  ip: string | null;
  userAgent: string | null;
  /** Exclude the ActivityLog id just created for this login. */
  excludeLogId?: string | null;
}) {
  const info = parseUserAgent(params.userAgent);
  const previous = await prisma.activityLog.findMany({
    where: {
      userId: params.userId,
      action: "LOGIN",
      result: "SUCCESS",
      ...(params.excludeLogId ? { id: { not: params.excludeLogId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { ip: true, userAgent: true, metadata: true },
  });

  if (previous.length === 0) return null;

  const seenIp = previous.some(
    (row) => row.ip && params.ip && row.ip === params.ip
  );
  const seenDevice = previous.some((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    const fp =
      typeof meta?.fingerprint === "string"
        ? meta.fingerprint
        : parseUserAgent(row.userAgent).fingerprint;
    return fp === info.fingerprint;
  });

  // New if IP is unfamiliar OR browser/device fingerprint is unfamiliar
  if (seenIp && seenDevice) return null;

  return notifyUser({
    userId: params.userId,
    type: NotificationType.SYSTEM,
    title: "notif.newLogin",
    message: formatLoginDetails({
      info,
      ip: params.ip,
    }),
    entityType: "User",
    entityId: params.userId,
  });
}

export async function notifyPasswordChanged(userId: string) {
  return notifyUser({
    userId,
    type: NotificationType.SYSTEM,
    title: "notif.passwordChanged",
    message: "",
    entityType: "User",
    entityId: userId,
  });
}

export async function notifyPasswordReset(userId: string) {
  return notifyUser({
    userId,
    type: NotificationType.SYSTEM,
    title: "notif.passwordReset",
    message: "",
    entityType: "User",
    entityId: userId,
  });
}
