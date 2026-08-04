import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import type {
  ImageStorageBackend,
  SaveObjectInput,
  StoredObject,
} from "@/lib/storage/types";

const PUBLIC_PREFIX = "/uploads/products";

function uploadRoot() {
  return path.join(process.cwd(), "public", "uploads", "products");
}

function toBuffer(body: SaveObjectInput["body"]): Buffer {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new Error("LOCAL_STORAGE_BLOB_UNSUPPORTED");
}

function toPublicPath(item: string): string | null {
  if (/^https?:\/\//i.test(item)) return null;
  if (item.startsWith("products/")) {
    return `${PUBLIC_PREFIX}/${item.slice("products/".length)}`;
  }
  if (item.startsWith(PUBLIC_PREFIX)) return item;
  if (item.startsWith("/uploads/products/")) return item;
  return null;
}

/**
 * Dev / VPS disk storage under public/uploads/products.
 * Keys: `products/<name>.webp` or bare `<name>.webp`.
 */
export function createLocalFsBackend(): ImageStorageBackend {
  return {
    id: "local",

    async save(input: SaveObjectInput): Promise<StoredObject> {
      const fileName = input.key.replace(/^products\//, "");
      const dir = uploadRoot();
      await mkdir(dir, { recursive: true });
      const buf = toBuffer(input.body);
      await writeFile(path.join(dir, fileName), buf);
      const url = `${PUBLIC_PREFIX}/${fileName}`;
      return { key: `products/${fileName}`, url };
    },

    async delete(urlsOrKeys: string[]): Promise<void> {
      await Promise.all(
        urlsOrKeys.map(async (item) => {
          const publicPath = toPublicPath(item);
          if (!publicPath) return;
          const publicRel = publicPath.replace(/^\//, "");
          try {
            await unlink(path.join(process.cwd(), "public", publicRel));
          } catch {
            /* missing ok */
          }
        })
      );
    },

    getUrl(key: string): string {
      const fileName = key.replace(/^products\//, "");
      return `${PUBLIC_PREFIX}/${fileName}`;
    },

    ownsUrl(url: string): boolean {
      return (
        url.startsWith(PUBLIC_PREFIX) || url.includes("/uploads/products/")
      );
    },
  };
}
