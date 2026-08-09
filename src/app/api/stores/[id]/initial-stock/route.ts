import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { requireOwner, requireStoreAccess } from "@/lib/rbac";
import { initialStoreStockSchema } from "@/lib/validators";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";
import {
  createInitialStoreStock,
  findSimilarProducts,
  type SimilarProductHit,
} from "@/lib/services/initial-store-stock.service";

type Ctx = { params: Promise<{ id: string }> };

/** GET ?q=&brandId=&categoryId=&accountingType= — soft duplicate search. */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id: storeId } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, storeId);
    if (scopeDenied) return scopeDenied;

    const sp = new URL(req.url).searchParams;
    const q = (sp.get("q") ?? "").trim();
    if (!q) return jsonOk({ similar: [] as SimilarProductHit[] });

    const similar = await findSimilarProducts({
      companyId: user!.companyId,
      name: q,
      brandId: sp.get("brandId"),
      categoryId: sp.get("categoryId"),
      accountingType: (sp.get("accountingType") as "PIECE" | "WEIGHT") || undefined,
    });
    return jsonOk({ similar });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST — restore initial store stock (OWNER only). */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id: storeId } = await ctx.params;
    const scopeDenied = await requireStoreAccess(user!, storeId);
    if (scopeDenied) return scopeDenied;

    const body = initialStoreStockSchema.parse(await req.json());
    const result = await createInitialStoreStock({
      companyId: user!.companyId,
      storeId,
      actorId: user!.id,
      quantity: body.quantity,
      productId: body.productId,
      newProduct: body.newProduct,
      forceCreate: body.forceCreate,
    });
    return jsonOk(result, 201);
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "PRODUCT_SIMILAR" &&
      "similar" in err
    ) {
      return NextResponse.json(
        {
          error: "PRODUCT_SIMILAR",
          similar: (err as Error & { similar: SimilarProductHit[] }).similar,
        },
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message === "INSUFFICIENT_STOCK") {
      return jsonError("INSUFFICIENT_STOCK", 409);
    }
    return handleApiError(err);
  }
}
