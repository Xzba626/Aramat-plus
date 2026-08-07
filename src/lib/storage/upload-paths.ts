/**
 * Single source of truth for local product image paths.
 * Used by local-fs backend and /uploads/products route handler.
 *
 * UPLOAD_DIR (prod): absolute base, e.g. /var/www/aramat/uploads
 * Empty: cwd/public/uploads (dev)
 * On-disk files: <base>/products/<file>.webp
 * Public URL (DB): /uploads/products/<file>.webp — never change this contract.
 */
import path from "node:path";

/** Public URL prefix stored in Product.imageUrl (unchanged for S3/R2 swap later). */
export const PRODUCT_UPLOADS_PUBLIC_PREFIX = "/uploads/products";

export function getUploadProductsDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  const base = configured
    ? configured
    : path.join(process.cwd(), "public", "uploads");
  return path.join(base, "products");
}

/**
 * Resolve a safe absolute path under the products upload dir.
 * Rejects path traversal and non-.webp names.
 */
export function resolveSafeProductFile(fileName: string): string | null {
  if (!fileName || typeof fileName !== "string") return null;
  const safe = path.basename(fileName);
  if (safe !== fileName) return null;
  if (!safe.endsWith(".webp")) return null;
  if (safe.includes("..") || safe.includes("/") || safe.includes("\\")) {
    return null;
  }
  const dir = getUploadProductsDir();
  const full = path.join(dir, safe);
  // Extra guard: resolved path must stay inside upload dir
  const resolvedDir = path.resolve(dir);
  const resolvedFile = path.resolve(full);
  if (
    resolvedFile !== resolvedDir &&
    !resolvedFile.startsWith(resolvedDir + path.sep)
  ) {
    return null;
  }
  return resolvedFile;
}

/** Extract filename from public URL or storage key. */
export function productFileNameFromUrlOrKey(item: string): string | null {
  if (!item || /^https?:\/\//i.test(item)) return null;
  let name = item;
  if (name.startsWith(PRODUCT_UPLOADS_PUBLIC_PREFIX + "/")) {
    name = name.slice(PRODUCT_UPLOADS_PUBLIC_PREFIX.length + 1);
  } else if (name.startsWith("/uploads/products/")) {
    name = name.slice("/uploads/products/".length);
  } else if (name.startsWith("products/")) {
    name = name.slice("products/".length);
  } else if (name.includes("/") || name.includes("\\")) {
    name = path.basename(name);
  }
  // strip query if any
  const q = name.indexOf("?");
  if (q >= 0) name = name.slice(0, q);
  return name || null;
}

export function publicUrlForProductFile(fileName: string): string {
  const safe = path.basename(fileName);
  return `${PRODUCT_UPLOADS_PUBLIC_PREFIX}/${safe}`;
}
