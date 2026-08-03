/**
 * TEMP debug sink for browser photo upload diagnostics.
 * Writes tmp/photo-upload-debug.json — remove after RCA closed.
 */
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const body = await req.json();
    const payload = {
      at: new Date().toISOString(),
      ...body,
    };
    const dir = path.join(process.cwd(), "tmp");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "photo-upload-debug.json"),
      JSON.stringify(payload, null, 2)
    );
    // Also append to history for multi-file repro
    await writeFile(
      path.join(dir, `photo-upload-debug-${Date.now()}.json`),
      JSON.stringify(payload, null, 2)
    );
    return jsonOk({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
