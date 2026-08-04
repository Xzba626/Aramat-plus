import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/rbac";

/**
 * Session identity from Auth.js JWT, then **mutable fields from DB**.
 * Critical: storeId/role/isActive must not stay stale after Owner assigns a seller
 * to a store while the seller is already logged in.
 *
 * Wrapped in React `cache()` so layout + page share one DB hit per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      companyId: true,
      storeId: true,
      isActive: true,
    },
  });

  if (!dbUser || !dbUser.isActive) return null;

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: dbUser.role,
    companyId: dbUser.companyId,
    storeId: dbUser.storeId,
  };
});
