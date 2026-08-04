/**
 * Server-only product image processing (sharp + storage).
 * Do NOT import this from Client Components — use `@/lib/product-image-url`.
 *
 * Storage goes through ImageStorageBackend (local FS / Vercel Blob / future S3).
 */
import sharp from "sharp";
import type { Metadata as SharpMetadata } from "sharp";
import {
  getImageStorage,
  isStorageMisconfiguredForHost,
} from "@/lib/storage";
import { isVercelBlobUrl } from "@/lib/storage/vercel-blob.backend";
import {
  productImageSrc,
  type ProductImageSize,
} from "@/lib/product-image-url";

export const PRODUCT_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024;

export type { ProductImageSize };
export {
  resolveProductImageUrl,
  getProductImageUrl,
  productImageSrc,
  isValidStoredImageUrl,
  sanitizeIncomingImageUrl,
} from "@/lib/product-image-url";

export type ProductImageVariants = {
  /** Primary DB value — medium path/URL */
  imageUrl: string;
  variants: {
    full: string;
    medium: string;
    thumb: string;
  };
  bytes: {
    input: number;
    full: number;
    medium: number;
    thumb: number;
  };
};

/** Magic-byte / MIME / extension gate for phone cameras (incl. octet-stream). */
export function isAllowedProductImage(file: {
  type?: string;
  name?: string;
}): boolean {
  const mime = (file.type || "").toLowerCase();
  if (
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    mime === "image/png" ||
    mime === "image/webp" ||
    mime === "image/gif"
  ) {
    return true;
  }
  if (mime === "image/heic" || mime === "image/heif") return false;

  const name = file.name || "";
  const extOk = /\.(jpe?g|png|webp|gif)$/i.test(name);
  if (
    (!mime ||
      mime === "application/octet-stream" ||
      mime === "application/download") &&
    extOk
  ) {
    return true;
  }
  return false;
}

export function isHeicLike(file: { type?: string; name?: string }): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/heic" || mime === "image/heif") return true;
  return /\.heic$/i.test(file.name || "") || /\.heif$/i.test(file.name || "");
}

function pipeline(input: Buffer, edge: number, quality: number) {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: edge,
      height: edge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality });
}

function mapProcessError(e: unknown, step?: string): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (
    msg === "FILE_REQUIRED" ||
    msg === "IMAGE_HEIC_UNSUPPORTED" ||
    msg === "INVALID_FILE_TYPE" ||
    msg === "IMAGE_PROCESS_FAILED" ||
    msg === "IMAGE_STORAGE_UNCONFIGURED"
  ) {
    throw e instanceof Error ? e : new Error(msg);
  }
  if (/heif|heic/i.test(msg)) throw new Error("IMAGE_HEIC_UNSUPPORTED");
  if (/unsupported|Input buffer|VipsJpeg|corrupt/i.test(msg)) {
    throw new Error("INVALID_FILE_TYPE");
  }
  if (/ENOENT|EACCES|EROFS|read-only|EPERM/i.test(msg)) {
    throw new Error("IMAGE_STORAGE_UNCONFIGURED");
  }
  const wrapped = new Error("IMAGE_PROCESS_FAILED");
  (wrapped as Error & { detail?: string }).detail = `${step ?? "process"}:${msg}`.slice(
    0,
    400
  );
  console.error("[PHOTO_PROCESS] mapProcessError", {
    step,
    msg,
    detail: (wrapped as Error & { detail?: string }).detail,
  });
  throw wrapped;
}

async function saveVariants(
  base: string,
  fullBuf: Buffer,
  mdBuf: Buffer,
  thumbBuf: Buffer
): Promise<Pick<ProductImageVariants, "imageUrl" | "variants">> {
  const storage = getImageStorage();
  const contentType = "image/webp";
  try {
    const [full, md, thumb] = await Promise.all([
      storage.save({
        key: `products/${base}.webp`,
        body: fullBuf,
        contentType,
      }),
      storage.save({
        key: `products/${base}-md.webp`,
        body: mdBuf,
        contentType,
      }),
      storage.save({
        key: `products/${base}-thumb.webp`,
        body: thumbBuf,
        contentType,
      }),
    ]);
    return {
      imageUrl: md.url,
      variants: {
        full: full.url,
        medium: md.url,
        thumb: thumb.url,
      },
    };
  } catch (e) {
    console.error("[product-image] storage save failed", storage.id, e);
    mapProcessError(e, `${storage.id}_save`);
  }
}

/**
 * Encode buffer → WebP variants.
 * Returns medium URL/path as primary imageUrl (API contract unchanged).
 */
export async function processAndSaveProductImage(
  input: Buffer,
  opts?: { baseName?: string }
): Promise<ProductImageVariants> {
  if (!input.length) throw new Error("FILE_REQUIRED");

  if (isStorageMisconfiguredForHost()) {
    console.error(
      "[product-image] Host has read-only FS and no Blob token — set STORAGE_PROVIDER=vercel-blob + BLOB_READ_WRITE_TOKEN"
    );
    throw new Error("IMAGE_STORAGE_UNCONFIGURED");
  }

  let meta: SharpMetadata;
  try {
    meta = await sharp(input, { failOn: "none" }).metadata();
  } catch (e) {
    mapProcessError(e, "sharp_metadata");
  }

  if (!meta.width || !meta.height) {
    mapProcessError(
      new Error("missing_width_or_height"),
      "sharp_metadata"
    );
  }

  const base =
    opts?.baseName ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let fullBuf: Buffer;
  let mdBuf: Buffer;
  let thumbBuf: Buffer;
  try {
    [fullBuf, mdBuf, thumbBuf] = await Promise.all([
      pipeline(input, 1600, 82).toBuffer(),
      pipeline(input, 800, 80).toBuffer(),
      pipeline(input, 300, 78).toBuffer(),
    ]);
  } catch (e) {
    mapProcessError(e, "sharp_pipeline");
  }

  const stored = await saveVariants(base, fullBuf, mdBuf, thumbBuf);

  return {
    ...stored,
    bytes: {
      input: input.length,
      full: fullBuf.length,
      medium: mdBuf.length,
      thumb: thumbBuf.length,
    },
  };
}

/** Best-effort delete of variant trio for a medium/full/thumb URL. */
export async function deleteProductImageFiles(
  imageUrl: string | null | undefined
): Promise<void> {
  if (!imageUrl) return;

  const medium = productImageSrc(imageUrl, "medium");
  const thumb = productImageSrc(imageUrl, "thumb");
  const full = productImageSrc(imageUrl, "full");
  const urls = [medium, thumb, full].filter(Boolean) as string[];

  try {
    const storage = getImageStorage();
    if (isVercelBlobUrl(imageUrl) || storage.id === "vercel-blob") {
      const blobUrls = urls.filter(isVercelBlobUrl);
      if (blobUrls.length) await storage.delete(blobUrls);
      return;
    }
    if (storage.ownsUrl(imageUrl) || imageUrl.startsWith("/uploads/products/")) {
      await storage.delete(urls);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Decode data: URL → processAndSave. Used by legacy migration.
 */
export async function migrateDataUrlToUploads(
  dataUrl: string,
  opts?: { baseName?: string }
): Promise<ProductImageVariants | null> {
  if (!dataUrl.startsWith("data:image/")) return null;
  const m = /^data:image\/[\w+.-]+;base64,(.+)$/i.exec(dataUrl);
  if (!m?.[1]) return null;
  let buf: Buffer;
  try {
    buf = Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
  if (!buf.length) return null;
  return processAndSaveProductImage(buf, opts);
}
