/**
 * TEMP debug sink for browser photo upload diagnostics.
 * Disabled in production — local/dev only.
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError, jsonError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return jsonError("NOT_FOUND", 404);
    }

    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = await req.json();
    // Cap payload to avoid disk fill
    const raw = JSON.stringify(body);
    if (raw.length > 64_000) {
      return jsonError("VALIDATION_ERROR", 400);
    }

    const payload = {
      at: new Date().toISOString(),
      body,
    };
    const dir = path.join(process.cwd(), "tmp");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "photo-upload-debug.json"),
      JSON.stringify(payload, null, 2)
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
