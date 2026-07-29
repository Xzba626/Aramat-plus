import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { categorySchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const archived = new URL(req.url).searchParams.get("archived");
    const items = await prisma.category.findMany({
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
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("id обязателен"));
    const body = categorySchema.partial().parse(data);

    const existing = await prisma.category.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Категория не найдена"));

    const item = await prisma.category.update({
      where: { id },
      data: {
        name: body.name,
        lowStockThreshold: body.lowStockThreshold,
        ...(typeof data.isArchived === "boolean"
          ? { isArchived: data.isArchived }
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

/** Hard delete запрещён спецификацией — только архив */
export async function DELETE() {
  return handleApiError(
    new Error("Удаление категорий запрещено. Используйте архивацию.")
  );
}
