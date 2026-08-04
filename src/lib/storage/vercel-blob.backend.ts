import { del, put } from "@vercel/blob";
import type {
  ImageStorageBackend,
  SaveObjectInput,
  StoredObject,
} from "@/lib/storage/types";

/**
 * sharp Buffer may sit on SharedArrayBuffer; undici/fetch rejects that on Vercel.
 */
function toBlobBody(body: SaveObjectInput["body"], contentType: string): Blob {
  if (body instanceof Blob) return body;
  let source: Uint8Array;
  if (Buffer.isBuffer(body)) {
    source = body;
  } else if (body instanceof ArrayBuffer) {
    source = new Uint8Array(body);
  } else if (body instanceof Uint8Array) {
    source = body;
  } else {
    throw new Error("BLOB_BODY_UNSUPPORTED");
  }
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return new Blob([copy.buffer], { type: contentType });
}

export function isVercelBlobUrl(url: string): boolean {
  return /^https:\/\//i.test(url) && /blob\.vercel-storage\.com/i.test(url);
}

export function createVercelBlobBackend(): ImageStorageBackend {
  return {
    id: "vercel-blob",

    async save(input: SaveObjectInput): Promise<StoredObject> {
      const key = input.key.startsWith("products/")
        ? input.key
        : `products/${input.key}`;
      const result = await put(
        key,
        toBlobBody(input.body, input.contentType),
        {
          access: "public",
          contentType: input.contentType,
          addRandomSuffix: false,
        }
      );
      return { key, url: result.url };
    },

    async delete(urlsOrKeys: string[]): Promise<void> {
      const blobUrls = urlsOrKeys.filter(isVercelBlobUrl);
      if (!blobUrls.length) return;
      try {
        await del(blobUrls);
      } catch {
        /* missing ok */
      }
    },

    getUrl(key: string): string {
      // Public Blob URLs are assigned at put-time; callers should keep stored URL.
      return key;
    },

    ownsUrl(url: string): boolean {
      return isVercelBlobUrl(url);
    },
  };
}
