import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  requireOwner,
  requireOwnerOrManager,
  requirePermission,
  requireStoreAccess,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  assignStoreStaff,
  getStoreStaff,
  listAssignableStaff,
  unassignStoreStaff,
} from "@/lib/services/stores-detail.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  userId: z.string().min(1),
});

/** List staff bound to this branch. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    const url = new URL(req.url);
    if (url.searchParams.get("candidates") === "1") {
      // OWNER: full candidates. MANAGER: sellers.assign → SELLER-only pool.
      if (user!.role === Role.MANAGER) {
        const permDenied = await requirePermission(user, "sellers.assign");
        if (permDenied) return permDenied;
        const rows = await listAssignableStaff(user!.companyId, id);
        return jsonOk(rows.filter((r) => r.role === Role.SELLER));
      }
      const ownerDenied = requireOwner(user);
      if (ownerDenied) return ownerDenied;
      return jsonOk(await listAssignableStaff(user!.companyId, id));
    }
    return jsonOk(await getStoreStaff(user!.companyId, id));
  } catch (err) {
    return handleApiError(err);
  }
}

/** Bind an existing user to this store. Never creates a user. */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;

    const body = assignSchema.parse(await req.json());

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "sellers.assign");
      if (permDenied) return permDenied;

      const target = await prisma.user.findFirst({
        where: { id: body.userId, companyId: user!.companyId },
        select: { id: true, role: true, storeId: true },
      });
      if (!target) return handleApiError(new Error("USER_NOT_FOUND"));
      if (target.role !== Role.SELLER) {
        return handleApiError(new Error("FORBIDDEN"));
      }
      // Cannot pull seller from a store outside manager scope
      if (target.storeId) {
        const fromDenied = await requireStoreAccess(user!, target.storeId);
        if (fromDenied) return fromDenied;
      }
    } else {
      const ownerDenied = requireOwner(user);
      if (ownerDenied) return ownerDenied;
    }

    const updated = await assignStoreStaff({
      companyId: user!.companyId,
      storeId: id,
      userId: body.userId,
      actorId: user!.id,
    });
    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}

/** Remove store binding for a user. */
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return handleApiError(new Error("ID_REQUIRED"));

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "sellers.assign");
      if (permDenied) return permDenied;
      const target = await prisma.user.findFirst({
        where: { id: userId, companyId: user!.companyId },
        select: { role: true, storeId: true },
      });
      if (!target) return handleApiError(new Error("USER_NOT_FOUND"));
      if (target.role !== Role.SELLER) {
        return handleApiError(new Error("FORBIDDEN"));
      }
      if (target.storeId !== id) {
        return handleApiError(new Error("FORBIDDEN"));
      }
    } else {
      const ownerDenied = requireOwner(user);
      if (ownerDenied) return ownerDenied;
    }

    const updated = await unassignStoreStaff({
      companyId: user!.companyId,
      storeId: id,
      userId,
      actorId: user!.id,
    });
    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
