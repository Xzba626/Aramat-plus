import type { ImageStorageBackend, StorageProviderId } from "@/lib/storage/types";
import { createLocalFsBackend } from "@/lib/storage/local-fs.backend";
import { createVercelBlobBackend } from "@/lib/storage/vercel-blob.backend";

/**
 * Resolve storage provider.
 *
 * - STORAGE_PROVIDER=local | vercel-blob (explicit)
 * - Else: vercel-blob when BLOB_READ_WRITE_TOKEN is set
 * - Else: local filesystem
 */
export function resolveStorageProvider(): StorageProviderId {
  const forced = process.env.STORAGE_PROVIDER?.trim().toLowerCase();
  if (forced === "local" || forced === "vercel-blob") return forced;
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "vercel-blob";
  return "local";
}

export function getImageStorage(): ImageStorageBackend {
  const provider = resolveStorageProvider();
  if (provider === "vercel-blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
      throw new Error("IMAGE_STORAGE_UNCONFIGURED");
    }
    return createVercelBlobBackend();
  }
  return createLocalFsBackend();
}

/** True when running on a read-only serverless FS without Blob configured. */
export function isStorageMisconfiguredForHost(): boolean {
  const onVercel = Boolean(process.env.VERCEL);
  if (!onVercel) return false;
  return resolveStorageProvider() === "local";
}
