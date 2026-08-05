import { getSessionUser } from "@/lib/session";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  deviceMetaForLog,
  parseUserAgent,
} from "@/lib/security/client-fingerprint";
import {
  enrichLocationExternal,
  locationMetaForLog,
  resolveClientLocation,
} from "@/lib/security/client-location";

/**
 * Enrich the latest LOGIN ActivityLog with real request UA / IP / geo.
 * Auth.js authorize() sometimes lacks client headers; this Route Handler
 * always sees the browser request after the session is established.
 *
 * Geo comes from the portable client-location service (headers first).
 * External Geo-IP is opt-in only (GEO_IP_EXTERNAL=1) and never blocks login.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    let location = resolveClientLocation(req.headers);
    // Opt-in enrichment — skipped unless env explicitly enables it
    location = await enrichLocationExternal(location);

    const userAgent = req.headers.get("user-agent");
    const deviceInfo = parseUserAgent(userAgent);
    const deviceMeta = deviceMetaForLog(deviceInfo);
    const locationMeta = locationMetaForLog(location);

    const since = new Date(Date.now() - 10 * 60 * 1000);
    const recent = await prisma.activityLog.findFirst({
      where: {
        userId: user.id,
        action: "LOGIN",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!recent) {
      return Response.json({ ok: true, updated: false });
    }

    const prevMeta =
      recent.metadata &&
      typeof recent.metadata === "object" &&
      !Array.isArray(recent.metadata)
        ? (recent.metadata as Record<string, unknown>)
        : {};

    const metadata: Record<string, unknown> = {
      ...prevMeta,
      ...deviceMeta,
      ...locationMeta,
    };

    await prisma.activityLog.update({
      where: { id: recent.id },
      data: {
        ip: location.ip || recent.ip,
        userAgent: userAgent || recent.userAgent,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });

    return Response.json({
      ok: true,
      updated: true,
      ip: location.ip || recent.ip,
      hasUa: Boolean(userAgent || recent.userAgent),
      hasGeo: Boolean(location.country || location.city),
      geoSource: location.geoSource,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
