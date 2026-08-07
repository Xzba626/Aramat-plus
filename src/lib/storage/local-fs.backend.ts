import { mkdir, writeFile, unlink } from "fs/promises";
import type {
  ImageStorageBackend,
  SaveObjectInput,
  StoredObject,
} from "@/lib/storage/types";
import {
  PRODUCT_UPLOADS_PUBLIC_PREFIX,
  getUploadProductsDir,
  productFileNameFromUrlOrKey,
  publicUrlForProductFile,
  resolveSafeProductFile,
} from "@/lib/storage/upload-paths";

function toBuffer(body: SaveObjectInput["body"]): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error("LOCAL_STORAGE_BLOB_UNSUPPORTED");
}

/**
 * Local disk storage (dev + Contabo VPS).
 * Disk root: UPLOAD_DIR/products or cwd/public/uploads/products.
 * Public URLs stay /uploads/products/* (served by App Router).
 */
export function createLocalFsBackend(): ImageStorageBackend {
  return {
    id: "local",

    async save(input: SaveObjectInput): Promise<StoredObject> {
      const fileName = input.key.replace(/^products\//, "");
      const filePath = resolveSafeProductFile(fileName);
      if (!filePath) throw new Error("INVALID_UPLOAD_KEY");

      const dir = getUploadProductsDir();
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, toBuffer(input.body));

      return {
        key: `products/${fileName}`,
        url: publicUrlForProductFile(fileName),
      };
    },

    async delete(urlsOrKeys: string[]): Promise<void> {
      await Promise.all(
        urlsOrKeys.map(async (item) => {
          const name = productFileNameFromUrlOrKey(item);
          if (!name) return;
          const filePath = resolveSafeProductFile(name);
          if (!filePath) return;
          try {
            await unlink(filePath);
          } catch {
            /* missing ok */
          }
        })
      );
    },

    getUrl(key: string): string {
      const fileName = key.replace(/^products\//, "");
      return publicUrlForProductFile(fileName);
    },

    ownsUrl(url: string): boolean {
      return (
        url.startsWith(PRODUCT_UPLOADS_PUBLIC_PREFIX) ||
        url.includes("/uploads/products/")
      );
    },
  };
}
