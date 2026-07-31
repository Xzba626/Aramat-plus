import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { supplierSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createSupplier,
  listSuppliers,
  updateSupplier,
} from "@/lib/services/supplier.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const archived = new URL(req.url).searchParams.get("archived");
    const items = await listSuppliers(user!.companyId, {
      includeInactive: archived === "1" || archived === "all",
    });
    const rows =
      archived === "1"
        ? items.filter((s) => !s.isActive)
        : archived === "all"
          ? items
          : items.filter((s) => s.isActive);
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const body = supplierSchema.parse(await req.json());
    const item = await createSupplier({
      companyId: user!.companyId,
      actorId: user!.id,
      name: body.name,
      phone: body.phone,
      notes: body.notes,
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
    const body = supplierSchema.partial().parse(data);
    const item = await updateSupplier({
      companyId: user!.companyId,
      actorId: user!.id,
      id,
      name: body.name,
      phone: body.phone,
      notes: body.notes,
      isActive: body.isActive ?? data.isActive,
    });
    return jsonOk(item);
  } catch (err) {
    return handleApiError(err);
  }
}
