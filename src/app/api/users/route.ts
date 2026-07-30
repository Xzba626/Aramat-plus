import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { userCreateSchema, userUpdateSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    // Manager can list, Owner can manage
    const users = await prisma.user.findMany({
      where: { companyId: user!.companyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
        createdAt: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
    return jsonOk(users);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = userCreateSchema.parse(await req.json());
    if (body.role === Role.SELLER && !body.storeId) {
      return handleApiError(new Error("SELLER_NO_STORE"));
    }

    if (body.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, companyId: user!.companyId },
      });
      if (!store) return handleApiError(new Error("STORE_NOT_FOUND"));
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const created = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        role: body.role,
        storeId: body.storeId ?? null,
        companyId: user!.companyId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
      },
    });

    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "USER_CREATE",
      entityType: "User",
      entityId: created.id,
      comment: `${created.name} (${created.role})`,
    });

    return jsonOk(created, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const body = userUpdateSchema.parse(data);

    const existing = await prisma.user.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("USER_NOT_FOUND"));

    const passwordHash = body.password
      ? await bcrypt.hash(body.password, 10)
      : undefined;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: body.name,
        role: body.role,
        storeId: body.storeId === undefined ? undefined : body.storeId,
        isActive: body.isActive,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        storeId: true,
        isActive: true,
      },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "USER_UPDATE",
      entityType: "User",
      entityId: id,
      comment: updated.name,
      metadata: {
        old: {
          name: existing.name,
          role: existing.role,
          isActive: existing.isActive,
          storeId: existing.storeId,
        },
        new: {
          name: updated.name,
          role: updated.role,
          isActive: updated.isActive,
          storeId: updated.storeId,
        },
        passwordChanged: Boolean(passwordHash),
      },
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
