import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { brandSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";

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
    return jsonOk(items);
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
    if (!id) return handleApiError(new Error("id обязателен"));
    const body = brandSchema.partial().parse(data);
    const existing = await prisma.brand.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Бренд не найден"));
    const item = await prisma.brand.update({
      where: { id },
      data: {
        name: body.name,
        imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl,
        ...(typeof data.isArchived === "boolean"
          ? { isArchived: data.isArchived }
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

export async function DELETE() {
  return handleApiError(
    new Error("Удаление брендов запрещено. Используйте архивацию.")
  );
}
