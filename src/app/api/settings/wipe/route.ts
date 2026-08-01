import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  CRM_WIPE_PHRASE,
  wipeCompanyOperationalData,
} from "@/lib/services/crm-wipe.service";
import { z } from "zod";

const wipeSchema = z.object({
  password: z.string().min(1),
  confirmPhrase: z.string().min(1),
  acknowledge: z.literal(true),
});

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    return jsonOk({
      phrase: CRM_WIPE_PHRASE,
      keeps: [
        "owner",
        "company",
        "warehouse",
        "settings",
        "units",
        "productTypes",
        "operationTypes",
        "expenseTypes",
        "ownerDirectStore",
      ],
      wipes: [
        "products",
        "batches",
        "stock",
        "sales",
        "transfers",
        "returns",
        "expenses",
        "journals",
        "branches",
        "nonOwnerUsers",
        "suppliers",
        "brands",
        "categories",
      ],
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = wipeSchema.parse(await req.json());
    const result = await wipeCompanyOperationalData({
      companyId: user!.companyId,
      ownerId: user!.id,
      ownerPassword: body.password,
      confirmPhrase: body.confirmPhrase,
    });
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
