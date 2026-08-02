import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getSessionUser } from "@/lib/session";
import { requireOwnerOrManager } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Product photo upload.
 * Prefer durable data-URL in DB (works on serverless / Neon without blob).
 * Also mirrors to public/uploads when local disk is writable (dev).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return handleApiError(new Error("FILE_REQUIRED"));
    }
    if (!ALLOWED.has(file.type)) {
      return handleApiError(new Error("INVALID_FILE_TYPE"));
    }
    if (file.size > MAX_BYTES) {
      return handleApiError(new Error("FILE_TOO_LARGE"));
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString("base64")}`;

    // Best-effort local mirror for browsing via /uploads/… in long-lived hosts
    try {
      const ext =
        path.extname(file.name).toLowerCase() ||
        (file.type === "image/png"
          ? ".png"
          : file.type === "image/webp"
            ? ".webp"
            : file.type === "image/gif"
              ? ".gif"
              : ".jpg");
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
      await mkdir(uploadDir, { recursive: true });
      await writeFile(path.join(uploadDir, filename), bytes);
    } catch {
      // ignore disk errors — dataUrl is the source of truth
    }

    return jsonOk({ imageUrl: dataUrl }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
