import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { requireOwner } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/services/activity-log.service";

/** Owner resets another user's password (admin reset). */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = resetPasswordSchema.parse(await req.json());
    const target = await prisma.user.findFirst({
      where: { id: body.userId, companyId: user!.companyId },
    });
    if (!target) return handleApiError(new Error("Пользователь не найден"));

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash },
    });

    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "PASSWORD_RESET",
      entityType: "User",
      entityId: target.id,
      comment: `Сброс пароля для ${target.name}`,
    });

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
