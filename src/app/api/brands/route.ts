import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { brandSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { scrubStoredLabel } from "@/lib/security/sanitize-text";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const archived = new URL(req.url).searchParams.get("archived");
    const items = await prisma.brand.findMany({
      where: {
        companyId: user!.companyId,
        ...(archived === "1"
          ? { isArchived: true }
          : archived === "all"
            ? {}
            : { isArchived: false }),
      },
      orderBy: { name: "asc" },
    });
    // Defense in depth: never serve raw markup leftovers from old rows
    return jsonOk(
      items.map((b) => ({
        ...b,
        name: scrubStoredLabel(b.name),
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const body = brandSchema.parse(await req.json());
    const item = await prisma.brand.create({
      data: {
        name: body.name,
        companyId: user!.companyId,
        imageUrl: body.imageUrl ?? null,
      },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "BRAND_CREATE",
      entityType: "Brand",
      entityId: item.id,
      comment: item.name,
    });
    return jsonOk(item, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const body = brandSchema.partial().parse(data);
    const existing = await prisma.brand.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("BRAND_NOT_FOUND"));
    const item = await prisma.brand.update({
      where: { id },
      data: {
        name: body.name,
        imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl,
        ...(typeof data.isArchived === "boolean"
          ? {
              isArchived: data.isArchived,
              archivedAt: data.isArchived ? new Date() : null,
            }
          : {}),
      },
    });
    if (typeof data.isArchived === "boolean") {
      await logActivity({
        userId: user!.id,
        companyId: user!.companyId,
        action: data.isArchived ? "BRAND_ARCHIVE" : "BRAND_RESTORE",
        entityType: "Brand",
        entityId: id,
        comment: item.name,
      });
    }
    return jsonOk(item);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const force = new URL(req.url).searchParams.get("force") === "1";
    const existing = await prisma.brand.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("BRAND_NOT_FOUND"));
    if (force) {
      const used = await prisma.product.count({ where: { brandId: id } });
      if (used > 0) return handleApiError(new Error("ARCHIVE_ONLY"));
      await prisma.brand.delete({ where: { id } });
      return jsonOk({ ok: true, purged: true });
    }
    const item = await prisma.brand.update({
      where: { id },
      data: { isArchived: true, archivedAt: new Date() },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "BRAND_ARCHIVE",
      entityType: "Brand",
      entityId: id,
      comment: item.name,
    });
    return jsonOk({ ok: true, archived: true });
  } catch (err) {
    return handleApiError(err);
  }
}
