/** Prefer resized public upload URLs for list cards (Y4 / photo pipeline). */
export function productImageSrc(
  url: string | null | undefined,
  size: "thumb" | "card" | "full" = "card"
): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (!url.startsWith("/uploads/")) return url;

  // New uploads: base-md.webp + base.webp + base-thumb.webp
  if (url.includes("-md.webp")) {
    if (size === "thumb") return url.replace("-md.webp", "-thumb.webp");
    if (size === "full") return url.replace("-md.webp", ".webp");
    return url;
  }
  if (url.endsWith("-thumb.webp")) {
    if (size === "card") return url.replace("-thumb.webp", "-md.webp");
    if (size === "full") return url.replace("-thumb.webp", ".webp");
    return url;
  }
  if (url.endsWith(".webp") && !url.includes("-thumb") && !url.includes("-md")) {
    if (size === "thumb") return url.replace(/\.webp$/, "-thumb.webp");
    if (size === "card") return url.replace(/\.webp$/, "-md.webp");
    return url;
  }
  return url;
}
