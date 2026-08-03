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
    console.error("[upload]", err);
    if (err instanceof Error) {
      return handleApiError(err);
    }
    return handleApiError(new Error("IMAGE_PROCESS_FAILED"));
  }
}
