import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { transferSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createStoreTransfer,
  createTransfer,
  listTransfers,
} from "@/lib/services/transfer.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const items = await listTransfers(user!.companyId);
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

    const body = transferSchema.parse(await req.json());

    if (body.fromStoreId) {
      const transfer = await createStoreTransfer({
        companyId: user!.companyId,
        fromStoreId: body.fromStoreId,
        toStoreId: body.toStoreId,
        createdById: user!.id,
        items: body.items,
        notes: body.notes ?? undefined,
      });
      return jsonOk(transfer, 201);
    }

    if (!body.fromWarehouseId) {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const transfer = await createTransfer({
      companyId: user!.companyId,
      fromWarehouseId: body.fromWarehouseId,
      toStoreId: body.toStoreId,
      createdById: user!.id,
      items: body.items,
      notes: body.notes ?? undefined,
    });
    return jsonOk(transfer, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
