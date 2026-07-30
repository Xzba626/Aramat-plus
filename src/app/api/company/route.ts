import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  currency: z.string().min(3).max(8).optional(),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const company = await prisma.company.findUnique({
      where: { id: user!.companyId },
      select: { id: true, name: true, currency: true, createdAt: true },
    });
    if (!company) return handleApiError(new Error("NOT_FOUND"));
    return jsonOk(company);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = patchSchema.parse(await req.json());
    const company = await prisma.company.update({
      where: { id: user!.companyId },
      data: {
        ...(body.name != null ? { name: body.name.trim() } : {}),
        ...(body.currency != null
          ? { currency: body.currency.trim().toUpperCase() }
          : {}),
      },
      select: { id: true, name: true, currency: true, createdAt: true },
    });

    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "COMPANY_UPDATE",
      entityType: "Company",
      entityId: company.id,
      metadata: body,
    });

    return jsonOk(company);
  } catch (err) {
    return handleApiError(err);
  }
}
