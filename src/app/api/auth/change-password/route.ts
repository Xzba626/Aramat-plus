import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema, resetPasswordSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireOwner } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/services/activity-log.service";
import { notifyPasswordChanged } from "@/lib/services/security-notify.service";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = changePasswordSchema.parse(await req.json());
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return handleApiError(new Error("USER_NOT_FOUND"));

    const ok = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
    if (!ok) return handleApiError(new Error("WRONG_PASSWORD"));

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await logActivity({
      userId: user.id,
      companyId: user.companyId,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
    });

    void notifyPasswordChanged(user.id).catch(() => undefined);

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
