import { readFile, stat } from "fs/promises";
import { resolveSafeProductFile } from "@/lib/storage/upload-paths";

type Ctx = { params: Promise<{ path: string[] }> };

const CACHE_CONTROL = "public, max-age=31536000, immutable";

function fileNameFromPathSegments(segments: string[] | undefined): string | null {
  if (!segments?.length) return null;
  // Only a single file name under /uploads/products/<file>.webp
  if (segments.length !== 1) return null;
  return segments[0] ?? null;
}

function resolveOrError(ctxPath: string[] | undefined): {
  status: 400 | 404;
  filePath?: undefined;
} | {
  status: 200;
  filePath: string;
} {
  const name = fileNameFromPathSegments(ctxPath);
  if (!name) return { status: 400 };
  const filePath = resolveSafeProductFile(name);
  if (!filePath) return { status: 400 };
  return { status: 200, filePath };
}

export async function GET(_req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const resolved = resolveOrError(segments);
  if (resolved.status !== 200) {
    return new Response(null, { status: resolved.status });
  }

  try {
    const body = await readFile(resolved.filePath);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": CACHE_CONTROL,
        "Content-Length": String(body.length),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}

/** Explicit HEAD so curl -I matches GET (avoid 405). */
export async function HEAD(_req: Request, ctx: Ctx) {
  const { path: segments } = await ctx.params;
  const resolved = resolveOrError(segments);
  if (resolved.status !== 200) {
    return new Response(null, { status: resolved.status });
  }

  try {
    const st = await stat(resolved.filePath);
    if (!st.isFile()) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": CACHE_CONTROL,
        "Content-Length": String(st.size),
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
