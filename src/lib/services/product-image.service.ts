/**
 * Server-only product image processing (sharp + storage).
 * Do NOT import this from Client Components — use `@/lib/product-image-url`.
 *
 * Storage:
 * - Production (Vercel): Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set
 * - Local/dev: `public/uploads/products/` on disk
 */
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { Metadata as SharpMetadata } from "sharp";
import { del, put } from "@vercel/blob";
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

const UPLOAD_DIR = () =>
  path.join(process.cwd(), "public", "uploads", "products");

function useBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

function isBlobUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && /blob\.vercel-storage\.com/i.test(url);
}

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
  // TEMP RCA: keep original reason on Error.cause for upload route debug
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

async function saveToBlob(
  base: string,
  fullBuf: Buffer,
  mdBuf: Buffer,
  thumbBuf: Buffer
): Promise<Pick<ProductImageVariants, "imageUrl" | "variants">> {
  const fullName = `products/${base}.webp`;
  const mdName = `products/${base}-md.webp`;
  const thumbName = `products/${base}-thumb.webp`;

  try {
    const [full, md, thumb] = await Promise.all([
      put(fullName, fullBuf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      }),
      put(mdName, mdBuf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
      }),
      put(thumbName, thumbBuf, {
        access: "public",
        contentType: "image/webp",
        addRandomSuffix: false,
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
    console.error("[product-image] blob put failed", e);
    mapProcessError(e, "blob_put");
  }
}

async function saveToLocalDisk(
  base: string,
  fullBuf: Buffer,
  mdBuf: Buffer,
  thumbBuf: Buffer
): Promise<Pick<ProductImageVariants, "imageUrl" | "variants">> {
  const uploadDir = UPLOAD_DIR();
  const fullName = `${base}.webp`;
  const mdName = `${base}-md.webp`;
  const thumbName = `${base}-thumb.webp`;

  try {
    await mkdir(uploadDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(uploadDir, fullName), fullBuf),
      writeFile(path.join(uploadDir, mdName), mdBuf),
      writeFile(path.join(uploadDir, thumbName), thumbBuf),
    ]);
  } catch (e) {
    console.error("[product-image] local write failed", e);
    mapProcessError(e, "local_write");
  }

  return {
    imageUrl: `/uploads/products/${mdName}`,
    variants: {
      full: `/uploads/products/${fullName}`,
      medium: `/uploads/products/${mdName}`,
      thumb: `/uploads/products/${thumbName}`,
    },
  };
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

  const onVercel = Boolean(process.env.VERCEL);
  if (onVercel && !useBlobStorage()) {
    console.error(
      "[product-image] Vercel deploy missing BLOB_READ_WRITE_TOKEN — filesystem uploads are not writable"
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

  const stored = useBlobStorage()
    ? await saveToBlob(base, fullBuf, mdBuf, thumbBuf)
    : await saveToLocalDisk(base, fullBuf, mdBuf, thumbBuf);

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

  if (isBlobUrl(imageUrl) || useBlobStorage()) {
    const blobUrls = urls.filter(isBlobUrl);
    if (blobUrls.length) {
      try {
        await del(blobUrls);
      } catch {
        /* missing blob ok */
      }
    }
    return;
  }

  if (!imageUrl.startsWith("/uploads/products/")) return;
  await Promise.all(
    urls.map(async (rel) => {
      if (!rel.startsWith("/")) return;
      try {
        await unlink(path.join(process.cwd(), "public", rel.replace(/^\//, "")));
      } catch {
        /* missing file ok */
      }
    })
  );
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
