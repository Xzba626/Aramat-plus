import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import {
  getArchiveRetentionDays,
  purgeExpiredArchives,
  setArchiveRetentionDays,
} from "@/lib/services/archive-retention.service";
import { purgeExpiredNotifications } from "@/lib/services/notification-retention.service";

export async function GET() {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const days = await getArchiveRetentionDays(user!.companyId);
    const purged = await purgeExpiredArchives({
      companyId: user!.companyId,
      actorId: user!.id,
    });
    const notificationsPurged = await purgeExpiredNotifications({
      companyId: user!.companyId,
    });
    return jsonOk({ days, purged, notificationsPurged });
  } catch (err) {
    return handleApiError(err);
  }
}

const patchSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650),
});

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = patchSchema.parse(await req.json());
    const days = await setArchiveRetentionDays(user!.companyId, body.days);
    return jsonOk({ days });
  } catch (err) {
    return handleApiError(err);
  }
}
