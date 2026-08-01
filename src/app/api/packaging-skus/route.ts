import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import {
  packagingSkuSchema,
  packagingSkuUpdateSchema,
} from "@/lib/validators";
import { jsonOk, handleApiError, jsonError } from "@/lib/api";
import {
  createPackagingSku,
  ensureDefaultPackagingSkus,
  listPackagingSkus,
  updatePackagingSku,
} from "@/lib/services/packaging.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const sp = new URL(req.url).searchParams;
    if (sp.get("seedDefaults") === "1") {
      await ensureDefaultPackagingSkus(user!.companyId, user!.id);
    }
    const archived = sp.get("archived");
    const items = await listPackagingSkus(user!.companyId, {
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
    const body = packagingSkuSchema.parse(await req.json());
    const { sku, product } = await createPackagingSku({
      companyId: user!.companyId,
      actorId: user!.id,
      data: body,
    });
    return jsonOk({ ...sku, productId: product.id }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const body = packagingSkuUpdateSchema.parse(await req.json());
    const { id, ...data } = body;
    if (!Object.keys(data).length) return jsonError("VALIDATION", 400);
    const sku = await updatePackagingSku({
      companyId: user!.companyId,
      actorId: user!.id,
      id,
      data,
    });
    return jsonOk(sku);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return jsonError("NOT_FOUND", 404);
    }
    return handleApiError(err);
  }
}
