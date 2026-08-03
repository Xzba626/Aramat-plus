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

/** Map stored URL → variant path (thumb / medium / full). */
export function productImageSrc(
  url: string | null | undefined,
  size: ProductImageSize | "card" = "medium"
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/uploads/")) return url;

  const normalized: ProductImageSize = size === "card" ? "medium" : size;

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

/** True if value is acceptable for Product.imageUrl column. */
export function isValidStoredImageUrl(v: string | null | undefined): boolean {
  if (v == null || v === "") return true;
  if (v.startsWith("/uploads/") && v.length <= 2048) return true;
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
