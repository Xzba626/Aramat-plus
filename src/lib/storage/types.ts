/**
 * Portable image/object storage — business code must not import Vercel Blob directly.
 *
 * Providers today: `local` | `vercel-blob`
 * Future: `s3` / R2 without changing callers.
 */

export type StorageProviderId = "local" | "vercel-blob";

export type StoredObject = {
  /** Storage key / relative path (e.g. products/foo-md.webp) */
  key: string;
  /** Public URL or app-relative path (/uploads/...) */
  url: string;
};

export type SaveObjectInput = {
  key: string;
  body: Buffer | Blob | ArrayBuffer | Uint8Array;
  contentType: string;
};

export interface ImageStorageBackend {
  readonly id: StorageProviderId;
  /** Persist one object; returns public URL/path. */
  save(input: SaveObjectInput): Promise<StoredObject>;
  /** Best-effort delete by public URL or key. */
  delete(urlsOrKeys: string[]): Promise<void>;
  /** Resolve public URL for a key (no network). */
  getUrl(key: string): string;
  /** Whether this backend owns the given URL. */
  ownsUrl(url: string): boolean;
}
