import { ManagerScopeMode, Role } from "@prisma/client";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  getManagerPermissionsState,
  saveManagerPermissions,
} from "@/lib/permissions/manager-permissions";
import { MANAGER_PERMISSION_KEYS } from "@/lib/permissions/keys";

type Ctx = { params: Promise<{ userId: string }> };

const putSchema = z.object({
  scopeMode: z.nativeEnum(ManagerScopeMode),
  storeIds: z.array(z.string()).default([]),
  permissions: z.record(z.string(), z.boolean()),
});

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const { userId } = await ctx.params;
    const state = await getManagerPermissionsState(user!.companyId, userId);
    if (!state) return handleApiError(new Error("NOT_FOUND"));
    return jsonOk({
      ...state,
      grantableKeys: MANAGER_PERMISSION_KEYS,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const { userId } = await ctx.params;

    const target = await (await import("@/lib/prisma")).prisma.user.findFirst({
      where: { id: userId, companyId: user!.companyId, role: Role.MANAGER },
      select: { id: true },
    });
    if (!target) return handleApiError(new Error("NOT_FOUND"));

    const body = putSchema.parse(await req.json());
    const state = await saveManagerPermissions({
      actorId: user!.id,
      companyId: user!.companyId,
      managerId: userId,
      scopeMode: body.scopeMode,
      storeIds: body.storeIds,
      permissions: body.permissions,
    });
    return jsonOk(state);
  } catch (err) {
    return handleApiError(err);
  }
}
