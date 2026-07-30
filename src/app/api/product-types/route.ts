import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager, requireOwner } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { productTypeSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { ensureDefaultProductTypes } from "@/lib/services/product-nomenclature.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    await ensureDefaultProductTypes(prisma, user!.companyId);
    const items = await prisma.productType.findMany({
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
    const body = productTypeSchema.parse(await req.json());
    const item = await prisma.productType.create({
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
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("id обязателен"));
    const body = productTypeSchema.partial().parse(data);
    const existing = await prisma.productType.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Тип товара не найден"));
    const item = await prisma.productType.update({
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
    if (!id) return handleApiError(new Error("id обязателен"));
    const existing = await prisma.productType.findFirst({
      where: { id, companyId: user!.companyId },
    });
    if (!existing) return handleApiError(new Error("Тип товара не найден"));
    await prisma.productType.delete({ where: { id } });
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
