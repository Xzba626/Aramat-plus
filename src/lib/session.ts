import { auth } from "@/lib/auth";
import type { SessionUser } from "@/lib/rbac";

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    companyId: session.user.companyId,
    storeId: session.user.storeId,
  };
}
