import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validators";
import { jsonOk, handleApiError } from "@/lib/api";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/services/activity-log.service";
import { notifyPasswordChanged } from "@/lib/services/security-notify.service";
import {
  clearPasswordChangeFailures,
  isPasswordChangeBlocked,
  recordPasswordChangeFailure,
} from "@/lib/security/password-change-rate-limit";
import { recordIpLoginFailure, isIpLoginBlocked } from "@/lib/security/login-rate-limit";
import { clientIpFromHeaders } from "@/lib/security/client-fingerprint";

/** Same-origin gate — /api/auth/* bypasses middleware CSRF. */
function assertSameOriginMutation(req: Request) {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const fetchSite = (req.headers.get("sec-fetch-site") || "").toLowerCase();
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        throw new Error("FORBIDDEN");
      }
      return;
    } catch (err) {
      if (err instanceof Error && err.message === "FORBIDDEN") throw err;
      throw new Error("FORBIDDEN");
    }
  }
  if (fetchSite === "same-origin" || fetchSite === "same-site") return;
  throw new Error("FORBIDDEN");
}

export async function POST(req: Request) {
  try {
    assertSameOriginMutation(req);

    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    const ip = clientIpFromHeaders(req.headers);
    if (isIpLoginBlocked(ip) || isPasswordChangeBlocked(user.id)) {
      return handleApiError(new Error("ACCOUNT_LOCKED"));
    }

    const body = changePasswordSchema.parse(await req.json());
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser) return handleApiError(new Error("USER_NOT_FOUND"));

    const ok = await bcrypt.compare(body.currentPassword, dbUser.passwordHash);
    if (!ok) {
      recordPasswordChangeFailure(user.id);
      recordIpLoginFailure(ip);
      return handleApiError(new Error("WRONG_PASSWORD"));
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    clearPasswordChangeFailures(user.id);

    await logActivity({
      userId: user.id,
      companyId: user.companyId,
      action: "PASSWORD_CHANGE",
      entityType: "User",
      entityId: user.id,
    });

    void notifyPasswordChanged(user.id).catch(() => undefined);

    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
