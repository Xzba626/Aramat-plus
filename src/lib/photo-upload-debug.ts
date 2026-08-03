/**
 * Instrument Create Product photo pick — posts diagnostics to
 * /api/debug/photo-upload-client → tmp/photo-upload-debug.json
 * TEMP for UI RCA; keep until browser PASS proven.
 */
export type PhotoUploadDebug = {
  fileName?: string;
  originalSize?: number;
  mime?: string;
  compressedSize?: number | null;
  compressedMime?: string | null;
  compressedName?: string | null;
  compressSkipped?: boolean;
  compressError?: string | null;
  toBlobNull?: boolean;
  uploadStatus?: number | null;
  response?: unknown;
  errorStep?: string | null;
  uiErrorShown?: string | null;
  note?: string;
};

export async function reportPhotoUploadDebug(
  payload: PhotoUploadDebug
): Promise<void> {
  try {
    await fetch("/api/debug/photo-upload-client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* never block upload UX on debug */
  }
}
