/**
 * Browser-side image compress before upload.
 * Phone photos (2–12 MB) → typically 200–600 KB JPEG.
 * Prefer JPEG (not canvas WebP) — Android canvas WebP is unreliable and
 * caused IMAGE_PROCESS_FAILED on the server.
 */
export type CompressImageOptions = {
  maxEdge?: number;
  quality?: number;
};

export type CompressImageResult = {
  file: File;
  meta: {
    skipped: boolean;
    toBlobNull: boolean;
    bitmapFailed: boolean;
    outSize: number;
    outMime: string;
    outName: string;
  };
};

export async function compressImageFileDetailed(
  file: File,
  opts: CompressImageOptions = {}
): Promise<CompressImageResult> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.85;

  if (/\.heic$/i.test(file.name) || /\.heif$/i.test(file.name)) {
    throw new Error("IMAGE_HEIC_UNSUPPORTED");
  }
  const mime = (file.type || "").toLowerCase();
  if (mime === "image/heic" || mime === "image/heif") {
    throw new Error("IMAGE_HEIC_UNSUPPORTED");
  }

  // Already small non-PNG — skip
  if (file.size <= 350_000 && mime !== "image/png") {
    return {
      file,
      meta: {
        skipped: true,
        toBlobNull: false,
        bitmapFailed: false,
        outSize: file.size,
        outMime: file.type,
        outName: file.name,
      },
    };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
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
    return {
      file,
      meta: {
        skipped: true,
        toBlobNull: false,
        bitmapFailed: false,
        outSize: file.size,
        outMime: file.type,
        outName: file.name,
      },
    };
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });

  if (!blob || blob.size === 0) {
    return {
      file,
      meta: {
        skipped: true,
        toBlobNull: true,
        bitmapFailed: false,
        outSize: file.size,
        outMime: file.type,
        outName: file.name,
      },
    };
  }

  // If compression made it larger (rare), keep original when under 1.5MB
  if (blob.size >= file.size && file.size < 1_500_000) {
    return {
      file,
      meta: {
        skipped: true,
        toBlobNull: false,
        bitmapFailed: false,
        outSize: file.size,
        outMime: file.type,
        outName: file.name,
      },
    };
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  const out = new File([blob], `${name}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
  return {
    file: out,
    meta: {
      skipped: false,
      toBlobNull: false,
      bitmapFailed: false,
      outSize: out.size,
      outMime: out.type,
      outName: out.name,
    },
  };
}

export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<File> {
  const { file: out } = await compressImageFileDetailed(file, opts);
  return out;
}
