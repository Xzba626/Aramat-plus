import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { isLocale } from "@/lib/i18n/types";
import { logActivity } from "@/lib/services/activity-log.service";

const patchSchema = z.object({
  preferredLocale: z.enum(["ru", "tj"]).optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        preferredLocale: true,
      },
    });
    if (!dbUser) return handleApiError(new Error("USER_NOT_FOUND"));

    return jsonOk({
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      preferredLocale: isLocale(dbUser.preferredLocale)
        ? dbUser.preferredLocale
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const body = patchSchema.parse(await req.json());
    if (body.preferredLocale == null && body.name == null) {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.preferredLocale != null
          ? { preferredLocale: body.preferredLocale }
          : {}),
        ...(body.name != null ? { name: body.name } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        preferredLocale: true,
      },
    });

    if (body.name != null) {
      await logActivity({
        userId: user.id,
        companyId: user.companyId,
        action: "USER_UPDATE",
        entityType: "User",
        entityId: user.id,
        metadata: { self: true, fields: ["name"] },
      });
    }

    return jsonOk({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      preferredLocale: isLocale(updated.preferredLocale)
        ? updated.preferredLocale
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
