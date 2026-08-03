import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getSessionUser } from "@/lib/session";
import { requireOwner } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";

/** Accept phone camera originals; we always re-encode smaller. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

function isAllowedImage(file: File): boolean {
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
  // Android sometimes sends empty Content-Type with .jpg name
  if (!mime && /\.(jpe?g|png|webp|gif)$/i.test(file.name)) return true;
  return false;
}

/**
 * Product photo upload.
 * - Accepts up to 20 MB phone originals
 * - Re-encodes with sharp → WebP variants (thumb / md / full)
 * - Stores under /uploads/products/ (never giant data-URLs in DB)
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return handleApiError(new Error("FILE_REQUIRED"));
    }
    if (file.size === 0) {
      return handleApiError(new Error("FILE_REQUIRED"));
    }
    if (!isAllowedImage(file)) {
      return handleApiError(new Error("INVALID_FILE_TYPE"));
    }
    if (file.size > MAX_INPUT_BYTES) {
      return handleApiError(new Error("FILE_TOO_LARGE"));
    }

    const input = Buffer.from(await file.arrayBuffer());
    const base = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "products");
    await mkdir(uploadDir, { recursive: true });

    const meta = await sharp(input, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) {
      return handleApiError(new Error("IMAGE_PROCESS_FAILED"));
    }

    const [fullBuf, mdBuf, thumbBuf] = await Promise.all([
      sharp(input, { failOn: "none" })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer(),
      sharp(input, { failOn: "none" })
        .rotate()
        .resize({
          width: 800,
          height: 800,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer(),
      sharp(input, { failOn: "none" })
        .rotate()
        .resize({
          width: 300,
          height: 300,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer(),
    ]);

    const fullName = `${base}.webp`;
    const mdName = `${base}-md.webp`;
    const thumbName = `${base}-thumb.webp`;

    await Promise.all([
      writeFile(path.join(uploadDir, fullName), fullBuf),
      writeFile(path.join(uploadDir, mdName), mdBuf),
      writeFile(path.join(uploadDir, thumbName), thumbBuf),
    ]);

    const imageUrl = `/uploads/products/${mdName}`;

    return jsonOk(
      {
        imageUrl,
        variants: {
          full: `/uploads/products/${fullName}`,
          medium: `/uploads/products/${mdName}`,
          thumb: `/uploads/products/${thumbName}`,
        },
        bytes: {
          input: file.size,
          full: fullBuf.length,
          medium: mdBuf.length,
          thumb: thumbBuf.length,
        },
      },
      201
    );
  } catch (err) {
    console.error("[upload]", err);
    if (err instanceof Error && /unsupported|Input buffer|VipsJpeg/i.test(err.message)) {
      return handleApiError(new Error("INVALID_FILE_TYPE"));
    }
    return handleApiError(new Error("IMAGE_PROCESS_FAILED"));
  }
}
