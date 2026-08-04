import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  journalInputFromSearchParams,
  queryJournal,
} from "@/lib/services/journal.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const sp = new URL(req.url).searchParams;
    const result = await queryJournal(
      journalInputFromSearchParams(user!.companyId, sp)
    );
    return jsonOk(result);
  } catch (err) {
    return handleApiError(err);
  }
}
