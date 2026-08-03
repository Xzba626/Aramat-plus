/**
 * Client-safe product image URL helpers (no Node / sharp).
 * Server processing lives in product-image.service.ts.
 */

export type ProductImageSize = "thumb" | "medium" | "full";

/** Prefer product photo; fall back to brand logo. */
export function resolveProductImageUrl(product: {
  imageUrl?: string | null;
  brand?: { imageUrl?: string | null; name?: string | null } | null;
}): string | null {
  const productUrl = product.imageUrl?.trim();
  if (productUrl) return productUrl;
  const brandUrl = product.brand?.imageUrl?.trim();
  if (brandUrl) return brandUrl;
  return null;
}

/**
 * Resolve display URL for a product at a given size.
 * Legacy data: URLs pass through unchanged (until migrated).
 */
export function getProductImageUrl(
  product: {
    imageUrl?: string | null;
    brand?: { imageUrl?: string | null; name?: string | null } | null;
  },
  size: ProductImageSize = "medium"
): string | null {
  const raw = resolveProductImageUrl(product);
  return productImageSrc(raw, size);
}

function isManagedProductImageUrl(url: string): boolean {
  if (url.startsWith("/uploads/")) return true;
  // Vercel Blob (and compatible absolute https image URLs)
  if (
    /^https:\/\//i.test(url) &&
    /\.(webp|jpe?g|png|gif)(\?.*)?$/i.test(url)
  ) {
    return true;
  }
  return false;
}

/** Map stored URL → variant path (thumb / medium / full). */
export function productImageSrc(
  url: string | null | undefined,
  size: ProductImageSize | "card" = "medium"
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!isManagedProductImageUrl(url)) return url;

  const normalized: ProductImageSize = size === "card" ? "medium" : size;

  // Strip query before suffix checks; re-attach if present
  const q = url.indexOf("?");
  const base = q >= 0 ? url.slice(0, q) : url;
  const query = q >= 0 ? url.slice(q) : "";

  const map = (next: string) => next + query;

  if (base.includes("-md.webp")) {
    if (normalized === "thumb")
      return map(base.replace("-md.webp", "-thumb.webp"));
    if (normalized === "full") return map(base.replace("-md.webp", ".webp"));
    return url;
  }
  if (base.endsWith("-thumb.webp")) {
    if (normalized === "medium")
      return map(base.replace("-thumb.webp", "-md.webp"));
    if (normalized === "full") return map(base.replace("-thumb.webp", ".webp"));
    return url;
  }
  if (
    base.endsWith(".webp") &&
    !base.includes("-thumb") &&
    !base.includes("-md")
  ) {
    if (normalized === "thumb")
      return map(base.replace(/\.webp$/, "-thumb.webp"));
    if (normalized === "medium")
      return map(base.replace(/\.webp$/, "-md.webp"));
    return url;
  }
  return url;
}

/** True if value is acceptable for Product.imageUrl column. */
export function isValidStoredImageUrl(v: string | null | undefined): boolean {
  if (v == null || v === "") return true;
  if (v.length > 2048) return false;
  if (v.startsWith("/uploads/")) return true;
  if (
    /^https:\/\//i.test(v) &&
    /\.(webp|jpe?g|png|gif)(\?.*)?$/i.test(v)
  ) {
    return true;
  }
  if (v.startsWith("data:image/") && v.length <= 12_000) return true;
  return false;
}

/**
 * Strip unusable imageUrl before Zod so product fields can still save.
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
