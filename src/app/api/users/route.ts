import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { userCreateSchema, userUpdateSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import bcrypt from "bcryptjs";

/** Only true OWNER may create/manage ADMIN accounts. Never assign OWNER via API. */
function assertAssignableRole(
  actorRole: Role,
  targetRole: Role | undefined
): void {
  if (!targetRole) return;
  if (targetRole === Role.OWNER) throw new Error("FORBIDDEN");
  if (targetRole === Role.ADMIN && actorRole !== Role.OWNER) {
    throw new Error("FORBIDDEN");
  }
}

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const archived = new URL(req.url).searchParams.get("archived");
    const users = await prisma.user.findMany({
      where: {
        companyId: user!.companyId,
        ...(archived === "1"
          ? { isActive: false }
          : archived === "all"
            ? {}
            : { isActive: true }),
      },
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
    assertAssignableRole(user!.role, body.role);
    // Sellers may be created without a store, then assigned from store card / users page.
    if (body.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, companyId: user!.companyId },
      });
      if (!store) return handleApiError(new Error("STORE_NOT_FOUND"));
      if (store.kind === "OWNER_DIRECT") {
        return handleApiError(new Error("VALIDATION_ERROR"));
      }
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

    // ADMIN cannot mutate OWNER accounts; only OWNER may change ADMIN role/password/status
    if (existing.role === Role.OWNER && user!.role !== Role.OWNER) {
      return handleApiError(new Error("FORBIDDEN"));
    }
    if (
      existing.role === Role.ADMIN &&
      user!.role !== Role.OWNER &&
      (body.role !== undefined ||
        body.password !== undefined ||
        body.isActive !== undefined)
    ) {
      return handleApiError(new Error("FORBIDDEN"));
    }
    assertAssignableRole(user!.role, body.role);

    if (body.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: body.storeId, companyId: user!.companyId },
      });
      if (!store) return handleApiError(new Error("STORE_NOT_FOUND"));
      if (store.kind === "OWNER_DIRECT") {
        return handleApiError(new Error("VALIDATION_ERROR"));
      }
    }
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

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const { hardDeleteUser } = await import(
      "@/lib/services/store-lifecycle.service"
    );
    return jsonOk(
      await hardDeleteUser({
        companyId: user!.companyId,
        userId: id,
        actorId: user!.id,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
