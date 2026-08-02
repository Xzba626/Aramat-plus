import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import { giftRuleSchema } from "@/lib/validators";
import {
  createGiftRule,
  deleteGiftRule,
  listGiftRules,
  updateGiftRule,
} from "@/lib/services/gift-rule.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const items = await listGiftRules(user!.companyId);
    return jsonOk(items);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = giftRuleSchema.parse(await req.json());
    const item = await createGiftRule(user!.companyId, body);
    return jsonOk(item, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const data = await req.json();
    const id = data.id as string;
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const body = giftRuleSchema.partial().parse(data);
    const item = await updateGiftRule(user!.companyId, id, body);
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
    if (!id) return handleApiError(new Error("ID_REQUIRED"));
    const result = await deleteGiftRule(user!.companyId, id);
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
