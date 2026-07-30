import { NotificationType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Notify all active owners (and optionally managers) in a company. */
export async function notifyCompanyRoles(params: {
  companyId: string;
  roles?: Role[];
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  const roles = params.roles ?? [Role.OWNER];
  const users = await prisma.user.findMany({
    where: {
      companyId: params.companyId,
      isActive: true,
      role: { in: roles },
    },
    select: { id: true },
  });

  if (!users.length) return [];

  await prisma.notification.createMany({
    data: users.map((u) => ({
      userId: u.id,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    })),
  });

  return users.map((u) => u.id);
}

export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
    },
  });
}
