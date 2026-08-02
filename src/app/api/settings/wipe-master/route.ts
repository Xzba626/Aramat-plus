import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  clearWipeMasterPassword,
  getWipeMasterMeta,
  setWipeMasterPassword,
} from "@/lib/services/wipe-master.service";

const setSchema = z.object({
  password: z.string().min(6),
  hint: z.string().max(200).optional().nullable(),
  currentOwnerPassword: z.string().optional(),
});

const clearSchema = z.object({
  ownerPassword: z.string().min(1),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const meta = await getWipeMasterMeta(user!.companyId);
    return jsonOk(meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = setSchema.parse(await req.json());
    await setWipeMasterPassword({
      companyId: user!.companyId,
      ownerId: user!.id,
      password: body.password,
      hint: body.hint,
      currentOwnerPassword: body.currentOwnerPassword,
    });
    const meta = await getWipeMasterMeta(user!.companyId);
    return jsonOk(meta);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = clearSchema.parse(await req.json());
    await clearWipeMasterPassword({
      companyId: user!.companyId,
      ownerId: user!.id,
      ownerPassword: body.ownerPassword,
    });
    return jsonOk({ configured: false, hint: null });
  } catch (err) {
    return handleApiError(err);
  }
}
