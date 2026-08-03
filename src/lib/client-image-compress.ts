/**
 * Browser-side image compress before upload.
 * Phone photos (2–12 MB) → typically 150–500 KB JPEG/WebP.
 */
export type CompressImageOptions = {
  maxEdge?: number;
  quality?: number;
  /** Prefer webp when supported */
  preferWebp?: boolean;
};

export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;
  const preferWebp = opts.preferWebp ?? true;

  // Already tiny — skip
  if (file.size <= 350_000 && file.type !== "image/png") {
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    // Unsupported in browser (e.g. HEIC) — let server reject with clear error
    throw new Error("INVALID_FILE_TYPE");
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const tryWebp =
    preferWebp &&
    typeof canvas.toBlob === "function" &&
    (await canvasSupportsWebp());

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob(
      (b) => resolve(b),
      tryWebp ? "image/webp" : "image/jpeg",
      quality
    );
  });

  if (!blob || blob.size === 0) return file;

  // If compression made it larger (rare), keep original when under 1.5MB
  if (blob.size >= file.size && file.size < 1_500_000) return file;

  const ext = tryWebp ? "webp" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.${ext}`, {
    type: tryWebp ? "image/webp" : "image/jpeg",
    lastModified: Date.now(),
  });
}

async function canvasSupportsWebp(): Promise<boolean> {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  return c.toDataURL("image/webp").startsWith("data:image/webp");
}
