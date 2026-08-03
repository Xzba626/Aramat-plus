import { getSessionUser } from "@/lib/session";
import {
  requireOwner,
  requireOwnerOrManager,
  requireStoreAccess,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  assignStoreStaff,
  getStoreStaff,
  listAssignableStaff,
  unassignStoreStaff,
} from "@/lib/services/stores-detail.service";
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
    const scopeDenied = requireStoreAccess(user!, id);
    if (scopeDenied) return scopeDenied;
    const url = new URL(req.url);
    if (url.searchParams.get("candidates") === "1") {
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
    const denied = requireOwner(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const body = assignSchema.parse(await req.json());
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
    const denied = requireOwner(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return handleApiError(new Error("ID_REQUIRED"));
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
