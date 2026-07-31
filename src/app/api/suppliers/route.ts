import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { supplierSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import { logActivity } from "@/lib/services/activity-log.service";
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
    const active = new URL(req.url).searchParams.get("active");
    const items = await listSuppliers(user!.companyId, {
      activeOnly: active === "1",
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
    const body = supplierSchema.parse(await req.json());
    const item = await createSupplier(user!.companyId, {
      name: body.name,
      phone: body.phone,
      comment: body.comment,
    });
    await logActivity({
      userId: user!.id,
      companyId: user!.companyId,
      action: "SUPPLIER_CREATE",
      entityType: "Supplier",
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
    const body = supplierSchema.partial().parse(data);
    const item = await updateSupplier(user!.companyId, id, {
      name: body.name,
      phone: body.phone,
      comment: body.comment,
      isActive: typeof data.isActive === "boolean" ? data.isActive : body.isActive,
    });
    if (typeof data.isActive === "boolean") {
      await logActivity({
        userId: user!.id,
        companyId: user!.companyId,
        action: data.isActive ? "SUPPLIER_RESTORE" : "SUPPLIER_DEACTIVATE",
        entityType: "Supplier",
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
  return handleApiError(new Error("ARCHIVE_ONLY"));
}
