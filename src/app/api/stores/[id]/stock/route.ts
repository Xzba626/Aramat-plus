import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getStoreStockPaged, type StockRowStatus } from "@/lib/services/stores-detail.service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const { id } = await ctx.params;
    const sp = new URL(req.url).searchParams;

    const statusRaw = sp.get("status") ?? "ALL";
    const status =
      statusRaw === "OK" || statusRaw === "LOW" || statusRaw === "OUT" || statusRaw === "ALL"
        ? (statusRaw as StockRowStatus | "ALL")
        : "ALL";

    const sortRaw = sp.get("sort") ?? "name";
    const sort =
      sortRaw === "qty" || sortRaw === "price" || sortRaw === "status" || sortRaw === "name"
        ? sortRaw
        : "name";

    const data = await getStoreStockPaged(user!.companyId, id, {
      q: sp.get("q") ?? undefined,
      status,
      sort,
      order: sp.get("order") === "desc" ? "desc" : "asc",
      page: Number(sp.get("page") || 1),
      pageSize: Number(sp.get("pageSize") || 20),
      categoryId: sp.get("categoryId") ?? undefined,
      brandId: sp.get("brandId") ?? undefined,
    });
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
