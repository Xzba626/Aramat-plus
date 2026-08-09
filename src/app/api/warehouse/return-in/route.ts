import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import {
  requireOwnerOrManager,
  requireStoreAccess,
  resolveScopedStoreFilter,
} from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  createStoreReturnIn,
  listStoreReturnIns,
} from "@/lib/services/warehouse-return.service";
import { optionalPlainText } from "@/lib/validators";
import { stripExactStockForManager } from "@/lib/permissions/manager-response";
import { stripFinanceForRole } from "@/lib/finance-visibility";

const returnInSchema = z.object({
  storeId: z.string().min(1),
  reason: optionalPlainText(500),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
});

function metaStoreId(row: { metadata?: unknown }): string | null {
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const sid = (meta as { storeId?: unknown }).storeId;
    return typeof sid === "string" ? sid : null;
  }
  return null;
}

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const scope = await resolveScopedStoreFilter(user!);
    if (!scope.all && scope.storeIds.length === 0) {
      return jsonOk([]);
    }

    const rows = await listStoreReturnIns(user!.companyId, {
      storeId:
        !scope.all && scope.storeIds.length === 1
          ? scope.storeIds[0]
          : undefined,
      limit: scope.all ? 20 : 200,
    });

    const filtered =
      scope.all || scope.storeIds.length === 1
        ? rows
        : rows
            .filter((r) => {
              const sid = metaStoreId(r);
              return sid != null && scope.storeIds.includes(sid);
            })
            .slice(0, 20);

    return jsonOk(
      stripExactStockForManager(user!, stripFinanceForRole(user!, filtered))
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const body = returnInSchema.parse(await req.json());
    const scopeDenied = await requireStoreAccess(user!, body.storeId);
    if (scopeDenied) return scopeDenied;

    const result = await createStoreReturnIn({
      companyId: user!.companyId,
      storeId: body.storeId,
      createdById: user!.id,
      reason: body.reason ?? undefined,
      items: body.items,
    });

    return jsonOk(
      stripExactStockForManager(user!, stripFinanceForRole(user!, result)),
      201
    );
  } catch (err) {
    return handleApiError(err);
  }
}
