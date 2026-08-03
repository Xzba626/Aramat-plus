import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  PRODUCT_IMAGE_MAX_INPUT_BYTES,
  isAllowedProductImage,
  isHeicLike,
  processAndSaveProductImage,
} from "@/lib/services/product-image.service";

/**
 * Product photo upload — thin auth wrapper around ProductImageService.
 * API contract unchanged: { imageUrl, variants?, bytes? }
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const formData = await req.formData();
    const raw = formData.get("file");
    if (!(raw instanceof File)) {
      return handleApiError(new Error("FILE_REQUIRED"));
    }
    if (raw.size === 0) {
      return handleApiError(new Error("FILE_REQUIRED"));
    }
    if (isHeicLike(raw)) {
      return handleApiError(new Error("IMAGE_HEIC_UNSUPPORTED"));
    }
    if (!isAllowedProductImage(raw)) {
      return handleApiError(new Error("INVALID_FILE_TYPE"));
    }
    if (raw.size > PRODUCT_IMAGE_MAX_INPUT_BYTES) {
      return handleApiError(new Error("FILE_TOO_LARGE"));
    }

    const input = Buffer.from(await raw.arrayBuffer());
    const result = await processAndSaveProductImage(input);
    return jsonOk(result, 201);
  } catch (err) {
    // TEMP RCA: log + attach cause so UI can show PHOTO_DEBUG (prod-only evidence)
    const detail =
      err instanceof Error &&
      typeof (err as Error & { detail?: string }).detail === "string"
        ? (err as Error & { detail?: string }).detail
        : undefined;
    const cause =
      detail || (err instanceof Error ? err.message : String(err));
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[PHOTO_PROCESS] upload route", {
      cause,
      stack,
      vercel: Boolean(process.env.VERCEL),
      hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
    });
    if (err instanceof Error) {
      const res = handleApiError(err);
      try {
        const body = await res.clone().json();
        return Response.json(
          {
            ...body,
            cause,
            hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
          },
          { status: res.status }
        );
      } catch {
        return res;
      }
    }
    return Response.json(
      {
        error: "IMAGE_PROCESS_FAILED",
        cause,
        hasBlobToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()),
      },
      { status: 400 }
    );
  }
}
