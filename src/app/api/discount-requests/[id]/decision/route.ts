import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { decideDiscountRequest } from "@/lib/services/discount-request.service";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const { id } = await ctx.params;
    const body = await req.json();
    const decision = body.decision as "APPROVE" | "REJECT";
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return handleApiError(new Error("VALIDATION_ERROR"));
    }

    const updated = await decideDiscountRequest({
      companyId: user!.companyId,
      requestId: id,
      reviewerId: user!.id,
      decision,
      note: body.note ? String(body.note) : undefined,
    });

    return jsonOk(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
