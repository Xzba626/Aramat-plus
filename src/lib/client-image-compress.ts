/**
 * Browser-side image compress before upload.
 * Phone photos (2–12 MB) → typically 200–600 KB JPEG.
 * Prefer JPEG (not canvas WebP) — Android canvas WebP is unreliable and
 * caused IMAGE_PROCESS_FAILED on the server.
 *
 * TEMP: verbose [PHOTO_PROCESS] logs + step-coded errors for prod RCA.
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
    step?: string;
  };
};

function photoLog(
  step: string,
  file: File,
  extra?: Record<string, unknown>
): void {
  console.error("[PHOTO_PROCESS]", {
    step,
    fileName: file.name,
    mime: file.type || "(empty)",
    size: file.size,
    ...extra,
  });
}

function photoFail(
  step: string,
  file: File,
  error?: unknown
): never {
  const message = error instanceof Error ? error.message : String(error ?? step);
  const stack = error instanceof Error ? error.stack : undefined;
  photoLog(step, file, { error: message, stack });
  throw new Error(step);
}

export async function compressImageFileDetailed(
  file: File,
  opts: CompressImageOptions = {}
): Promise<CompressImageResult> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.85;

  try {
    if (/\.heic$/i.test(file.name) || /\.heif$/i.test(file.name)) {
      photoFail("heic_extension", file, new Error("IMAGE_HEIC_UNSUPPORTED"));
    }
    const mime = (file.type || "").toLowerCase();
    if (mime === "image/heic" || mime === "image/heif") {
      photoFail("heic_mime", file, new Error("IMAGE_HEIC_UNSUPPORTED"));
    }

    // Already small non-PNG — skip
    if (file.size <= 350_000 && mime !== "image/png") {
      photoLog("compress_skipped_small", file);
      return {
        file,
        meta: {
          skipped: true,
          toBlobNull: false,
          bitmapFailed: false,
          outSize: file.size,
          outMime: file.type,
          outName: file.name,
          step: "compress_skipped_small",
        },
      };
    }

    if (typeof createImageBitmap !== "function") {
      photoFail("createImageBitmap_undefined", file);
    }

    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      photoFail("createImageBitmap_failed", file, e);
    }

    if (!bitmap) {
      photoFail("createImageBitmap_null", file);
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
      photoLog("canvas_context_null", file, { w, h });
      return {
        file,
        meta: {
          skipped: true,
          toBlobNull: false,
          bitmapFailed: false,
          outSize: file.size,
          outMime: file.type,
          outName: file.name,
          step: "canvas_context_null",
        },
      };
    }

    try {
      ctx.drawImage(bitmap, 0, 0, w, h);
    } catch (e) {
      bitmap.close();
      photoFail("canvas_drawImage_failed", file, e);
    }
    bitmap.close();

    let blob: Blob | null;
    try {
      blob = await new Promise<Blob | null>((resolve, reject) => {
        try {
          canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
        } catch (e) {
          reject(e);
        }
      });
    } catch (e) {
      photoFail("canvas_toBlob_threw", file, e);
    }

    if (!blob || blob.size === 0) {
      photoLog("canvas_toBlob_null", file, { blobSize: blob?.size ?? null });
      return {
        file,
        meta: {
          skipped: true,
          toBlobNull: true,
          bitmapFailed: false,
          outSize: file.size,
          outMime: file.type,
          outName: file.name,
          step: "canvas_toBlob_null",
        },
      };
    }

    // If compression made it larger (rare), keep original when under 1.5MB
    if (blob.size >= file.size && file.size < 1_500_000) {
      photoLog("compress_skipped_no_gain", file, {
        blobSize: blob.size,
      });
      return {
        file,
        meta: {
          skipped: true,
          toBlobNull: false,
          bitmapFailed: false,
          outSize: file.size,
          outMime: file.type,
          outName: file.name,
          step: "compress_skipped_no_gain",
        },
      };
    }

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    const out = new File([blob], `${name}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    photoLog("compress_ok", file, {
      outSize: out.size,
      outMime: out.type,
      outName: out.name,
      w,
      h,
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
        step: "compress_ok",
      },
    };
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.startsWith("createImageBitmap_") ||
        e.message.startsWith("canvas_") ||
        e.message.startsWith("heic_") ||
        e.message === "IMAGE_HEIC_UNSUPPORTED" ||
        e.message === "INVALID_FILE_TYPE")
    ) {
      throw e;
    }
    photoFail("blob_generation_failed", file, e);
  }
}

export async function compressImageFile(
  file: File,
  opts: CompressImageOptions = {}
): Promise<File> {
  const { file: out } = await compressImageFileDetailed(file, opts);
  return out;
}
