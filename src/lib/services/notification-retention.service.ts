import { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Ordinary notifications retention (months → days). */
export const NOTIF_RETENTION_DAYS_DEFAULT = 90;

/** Security / system notifications keep longer. */
export const NOTIF_RETENTION_DAYS_SECURITY = 365;

const SECURITY_TITLES = [
  "notif.newLogin",
  "notif.passwordChanged",
  "notif.passwordReset",
] as const;

/**
 * Purge old Notification rows by policy.
 * Call from background / opportunistic owner retention — never from inbox page render.
 */
export async function purgeExpiredNotifications(params?: {
  companyId?: string;
}): Promise<{ deletedDefault: number; deletedSecurity: number }> {
  const now = Date.now();
  const cutoffDefault = new Date(now - NOTIF_RETENTION_DAYS_DEFAULT * 86400000);
  const cutoffSecurity = new Date(now - NOTIF_RETENTION_DAYS_SECURITY * 86400000);

  const userFilter: Prisma.NotificationWhereInput = params?.companyId
    ? { user: { companyId: params.companyId } }
    : {};

  const deletedDefault = await prisma.notification.deleteMany({
    where: {
      ...userFilter,
      createdAt: { lt: cutoffDefault },
      NOT: {
        OR: [
          { type: NotificationType.SYSTEM, title: { in: [...SECURITY_TITLES] } },
        ],
      },
    },
  });

  const deletedSecurity = await prisma.notification.deleteMany({
    where: {
      ...userFilter,
      createdAt: { lt: cutoffSecurity },
      type: NotificationType.SYSTEM,
      title: { in: [...SECURITY_TITLES] },
    },
  });

  return {
    deletedDefault: deletedDefault.count,
    deletedSecurity: deletedSecurity.count,
  };
}
