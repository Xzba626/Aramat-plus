/** Prefer product photo; fall back to brand logo if product has none. */
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
