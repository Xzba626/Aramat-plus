import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import sharp from "sharp";

export const PRODUCT_IMAGE_MAX_INPUT_BYTES = 20 * 1024 * 1024;

export type ProductImageSize = "thumb" | "medium" | "full";

/** Prefer product photo; fall back to brand logo. */
export function resolveProductImageUrl(product: {
  imageUrl?: string | null;
  brand?: { imageUrl?: string | null } | null;
}): string | null {
  const productUrl = product.imageUrl?.trim();
  if (productUrl) return productUrl;
  const brandUrl = product.brand?.imageUrl?.trim();
  if (brandUrl) return brandUrl;
  return null;
}

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
  // HEIC explicitly rejected upstream with clear error
  if (mime === "image/heic" || mime === "image/heif") return false;

  const name = file.name || "";
  const extOk = /\.(jpe?g|png|webp|gif)$/i.test(name);
  // Android / FormData often sends empty or application/octet-stream
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

/**
 * Resolve display URL for a product at a given size.
 * Legacy data: URLs pass through unchanged (until migrated).
 */
export function getProductImageUrl(
  product: {
    imageUrl?: string | null;
    brand?: { imageUrl?: string | null } | null;
  },
  size: ProductImageSize = "medium"
): string | null {
  const raw = resolveProductImageUrl(product);
  return productImageSrc(raw, size);
}

/** Map stored URL → variant path (thumb / medium / full). */
export function productImageSrc(
  url: string | null | undefined,
  size: ProductImageSize | "card" = "medium"
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/uploads/")) return url;

  const normalized: ProductImageSize =
    size === "card" ? "medium" : size;

  if (url.includes("-md.webp")) {
    if (normalized === "thumb") return url.replace("-md.webp", "-thumb.webp");
    if (normalized === "full") return url.replace("-md.webp", ".webp");
    return url;
  }
  if (url.endsWith("-thumb.webp")) {
    if (normalized === "medium") return url.replace("-thumb.webp", "-md.webp");
    if (normalized === "full") return url.replace("-thumb.webp", ".webp");
    return url;
  }
  if (url.endsWith(".webp") && !url.includes("-thumb") && !url.includes("-md")) {
    if (normalized === "thumb") return url.replace(/\.webp$/, "-thumb.webp");
    if (normalized === "medium") return url.replace(/\.webp$/, "-md.webp");
    return url;
  }
  return url;
}

function pipeline(input: Buffer, edge: number, quality: number) {
  return sharp(input, { failOn: "none" })
    .rotate() // honour EXIF orientation, then strip
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

  let meta: sharp.Metadata;
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
 * Returns null if not a data URL or decode fails.
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

/** True if value is acceptable for Product.imageUrl column. */
export function isValidStoredImageUrl(v: string | null | undefined): boolean {
  if (v == null || v === "") return true;
  if (v.startsWith("/uploads/") && v.length <= 2048) return true;
  if (v.startsWith("data:image/") && v.length <= 12_000) return true;
  return false;
}

/**
 * Strip unusable imageUrl before Zod so product fields can still save.
 * Returns { imageUrl, stripped }.
 */
export function sanitizeIncomingImageUrl(
  imageUrl: unknown
): { imageUrl: string | null | undefined; stripped: boolean } {
  if (imageUrl === undefined) return { imageUrl: undefined, stripped: false };
  if (imageUrl === null || imageUrl === "")
    return { imageUrl: null, stripped: false };
  if (typeof imageUrl !== "string")
    return { imageUrl: null, stripped: true };
  if (isValidStoredImageUrl(imageUrl))
    return { imageUrl, stripped: false };
  return { imageUrl: null, stripped: true };
}
