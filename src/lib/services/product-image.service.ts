/**
 * Server-only product image processing (sharp + filesystem).
 * Do NOT import this from Client Components — use `@/lib/product-image-url`.
 */
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { Metadata as SharpMetadata } from "sharp";
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
  /** Primary DB value — medium path */
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

/**
 * Encode buffer → WebP variants under /uploads/products/.
 * Returns medium path as primary imageUrl (API contract unchanged).
 */
export async function processAndSaveProductImage(
  input: Buffer,
  opts?: { baseName?: string }
): Promise<ProductImageVariants> {
  if (!input.length) throw new Error("FILE_REQUIRED");

  let meta: SharpMetadata;
  try {
    meta = await sharp(input, { failOn: "none" }).metadata();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/heif|heic/i.test(msg)) throw new Error("IMAGE_HEIC_UNSUPPORTED");
    if (/unsupported|Input buffer|VipsJpeg|corrupt/i.test(msg)) {
      throw new Error("INVALID_FILE_TYPE");
    }
    throw new Error("IMAGE_PROCESS_FAILED");
  }

  if (!meta.width || !meta.height) {
    throw new Error("IMAGE_PROCESS_FAILED");
  }

  const base =
    opts?.baseName ??
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const uploadDir = UPLOAD_DIR();
  await mkdir(uploadDir, { recursive: true });

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
    const msg = e instanceof Error ? e.message : String(e);
    if (/heif|heic/i.test(msg)) throw new Error("IMAGE_HEIC_UNSUPPORTED");
    if (/unsupported|Input buffer|VipsJpeg|corrupt/i.test(msg)) {
      throw new Error("INVALID_FILE_TYPE");
    }
    throw new Error("IMAGE_PROCESS_FAILED");
  }

  const fullName = `${base}.webp`;
  const mdName = `${base}-md.webp`;
  const thumbName = `${base}-thumb.webp`;

  await Promise.all([
    writeFile(path.join(uploadDir, fullName), fullBuf),
    writeFile(path.join(uploadDir, mdName), mdBuf),
    writeFile(path.join(uploadDir, thumbName), thumbBuf),
  ]);

  return {
    imageUrl: `/uploads/products/${mdName}`,
    variants: {
      full: `/uploads/products/${fullName}`,
      medium: `/uploads/products/${mdName}`,
      thumb: `/uploads/products/${thumbName}`,
    },
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
  if (!imageUrl?.startsWith("/uploads/products/")) return;
  const medium = productImageSrc(imageUrl, "medium");
  const thumb = productImageSrc(imageUrl, "thumb");
  const full = productImageSrc(imageUrl, "full");
  const rels = [medium, thumb, full].filter(Boolean) as string[];
  await Promise.all(
    rels.map(async (rel) => {
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
