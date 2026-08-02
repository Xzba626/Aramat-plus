import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { expenseTypeSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const items = await prisma.expenseType.findMany({
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
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = expenseTypeSchema.parse(await req.json());
    const item = await prisma.expenseType.create({
      data: { name: body.name, companyId: user!.companyId },
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
    const body = expenseTypeSchema.partial().parse(data);
    const existing = await prisma.expenseType.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("NOT_FOUND"));
    const item = await prisma.expenseType.update({
      where: { id },
      data: { name: body.name },
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
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const existing = await prisma.expenseType.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("NOT_FOUND"));
    await prisma.expenseType.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
