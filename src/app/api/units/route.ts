import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { unitSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const items = await prisma.unit.findMany({
      where: { companyId: user!.companyId },
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
    const body = unitSchema.parse(await req.json());
    const item = await prisma.unit.create({
      data: { name: body.name, symbol: body.symbol, companyId: user!.companyId },
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "UNIT_CREATE",
      entityType: "Unit",
      entityId: item.id,
      comment: `${item.name} (${item.symbol})`,
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
    const body = unitSchema.partial().parse(data);
    const existing = await prisma.unit.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Единица не найдена"));
    const item = await prisma.unit.update({
      where: { id },
      data: { name: body.name, symbol: body.symbol },
    });
    return jsonOk(item);
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
    if (!id) return handleApiError(new Error("id обязателен"));
    const existing = await prisma.unit.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Единица не найдена"));
    await prisma.unit.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
