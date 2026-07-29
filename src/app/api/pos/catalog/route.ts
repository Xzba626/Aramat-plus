import { getSessionUser } from "@/lib/session";
import { requireSeller } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { getPosCatalog } from "@/lib/services/pos-catalog.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireSeller(user);
    if (denied) return denied;

    if (!user!.storeId) {
      return handleApiError(new Error("Продавцу не назначен магазин"));
    }

    const sp = new URL(req.url).searchParams;
    const data = await getPosCatalog({
      companyId: user!.companyId,
      storeId: user!.storeId,
      q: sp.get("q") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
    });
    return jsonOk(data);
  } catch (err) {
    return handleApiError(err);
  }
}
