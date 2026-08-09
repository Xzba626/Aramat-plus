import { getSessionUser } from "@/lib/session";
import { requireOwner, requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
import { ensureDefaultCategories } from "@/lib/services/product-nomenclature.service";
import { scrubStoredLabel } from "@/lib/security/sanitize-text";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const url = new URL(req.url);
    if (url.searchParams.get("seedDefaults") === "1") {
      await ensureDefaultCategories(prisma, user!.companyId);
    }

    const archived = url.searchParams.get("archived");
    const items = await prisma.category.findMany({
      where: {
        companyId: user!.companyId,
        ...(archived === "1"
          ? { isArchived: true }
          : archived === "all"
            ? {}
            : { isArchived: false }),
      },
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: "asc" },
    });
    return jsonOk(
      items.map((c) => ({
        ...c,
        name: scrubStoredLabel(c.name),
        productCount: c._count.products,
        canDelete: c._count.products === 0,
      }))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = categorySchema.parse(await req.json());
    const item = await prisma.category.create({
      data: {
        name: body.name,
        companyId: user!.companyId,
        lowStockThreshold: body.lowStockThreshold ?? 50,
      },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "CATEGORY_CREATE",
      entityType: "Category",
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
    const denied = requireOwner(user);
    if (denied) return denied;

    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const body = categorySchema.partial().parse(data);

    const existing = await prisma.category.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("NOT_FOUND"));

    const item = await prisma.category.update({
      where: { id },
      data: {
        name: body.name,
        lowStockThreshold: body.lowStockThreshold,
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
        action: data.isArchived ? "CATEGORY_ARCHIVE" : "CATEGORY_RESTORE",
        entityType: "Category",
        entityId: id,
        comment: item.name,
      });
    }

    return jsonOk(item);
  } catch (err) {
    return handleApiError(err);
  }
}

/** Delete = soft-archive. force=1 = permanent (only if unused). */
export async function DELETE(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const url = new URL(req.url);
    const id =
      url.searchParams.get("id") ||
      ((await req.json().catch(() => ({}))) as { id?: string }).id;
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const force = url.searchParams.get("force") === "1";

    const existing = await prisma.category.findFirst({
      where: { id, companyId: user!.companyId },
      include: { _count: { select: { products: true } } },
    });
    if (!existing) return handleApiError(new Error("NOT_FOUND"));

    if (!force) {
      const item = await prisma.category.update({
        where: { id },
        data: { isArchived: true, archivedAt: new Date() },
      });
      await logActivity({
        userId: user!.id,
        companyId: user!.companyId,
        action: "CATEGORY_ARCHIVE",
        entityType: "Category",
        entityId: id,
        comment: item.name,
      });
      return jsonOk({ ok: true, archived: true });
    }

    if (existing._count.products > 0) {
      return handleApiError(new Error("CATEGORY_IN_USE"));
    }

    await prisma.category.delete({ where: { id } });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "CATEGORY_DELETE",
      entityType: "Category",
      entityId: id,
      comment: existing.name,
    });
    return jsonOk({ ok: true, purged: true });
  } catch (err) {
    return handleApiError(err);
  }
}
