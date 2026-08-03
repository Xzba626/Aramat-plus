/**
 * DIAG ONLY — find exact upload failure step. Does not change product logic.
 * Writes tmp/photo-upload-diag.json
 */
import { mkdirSync, writeFileSync, existsSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function upload(
  cookie: string,
  buf: Buffer,
  name: string,
  mime: string
) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type: mime }), name);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { http: res.status, ms, body: json };
}

async function main() {
  const out: Record<string, unknown> = { at: new Date().toISOString() };

  // A) sharp local
  try {
    const jpeg = await sharp({
      create: {
        width: 2000,
        height: 1500,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();
    const meta = await sharp(jpeg).metadata();
    const webp = await sharp(jpeg).webp({ quality: 82 }).toBuffer();
    const png = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 200, g: 50, b: 50 },
      },
    })
      .png()
      .toBuffer();
    out.sharpLocal = {
      ok: true,
      versions: sharp.versions,
      jpegBytes: jpeg.length,
      jpegMeta: { format: meta.format, w: meta.width, h: meta.height },
      webpBytes: webp.length,
      pngBytes: png.length,
    };
    (out as { _bufs?: Record<string, Buffer> })._bufs = { jpeg, webp, png };
  } catch (e) {
    out.sharpLocal = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    };
  }

  // B) filesystem
  const uploadDir = join(process.cwd(), "public", "uploads", "products");
  const fsCheck: Record<string, unknown> = {
    exists: existsSync(uploadDir),
    path: uploadDir,
  };
  try {
    accessSync(uploadDir, constants.W_OK);
    fsCheck.writable = true;
  } catch (e) {
    fsCheck.writable = false;
    fsCheck.writeError = e instanceof Error ? e.message : String(e);
  }
  out.filesystem = fsCheck;

  // C) HTTP uploads through Next route (same as UI)
  const cookie = await login("owner@aromat.plus", "owner1234");
  const bufs = (out as { _bufs?: Record<string, Buffer> })._bufs;
  delete (out as { _bufs?: unknown })._bufs;

  if (!bufs) {
    out.http = { skipped: true, reason: "sharpLocal failed" };
  } else {
    // Pad jpeg toward ~1.8MB
    let jpeg18 = bufs.jpeg;
    if (jpeg18.length < 1_800_000) {
      jpeg18 = await sharp({
        create: {
          width: 3200,
          height: 2400,
          channels: 3,
          noise: { type: "gaussian", mean: 110, sigma: 45 },
        },
      })
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    out.http = {
      jpeg_small_11kb: await upload(
        cookie,
        await sharp({
          create: {
            width: 80,
            height: 60,
            channels: 3,
            background: "#abc",
          },
        })
          .jpeg({ quality: 40 })
          .toBuffer(),
        "tiny.jpg",
        "image/jpeg"
      ),
      jpeg_1_8mb: await upload(
        cookie,
        jpeg18,
        "phone.jpg",
        "image/jpeg"
      ),
      png: await upload(cookie, bufs.png, "shot.png", "image/png"),
      webp_like_client_compress: await upload(
        cookie,
        bufs.webp,
        "compressed.webp",
        "image/webp"
      ),
      // Mimic Blob without File.name quirks — empty mime (Android-ish)
      jpeg_empty_mime: await upload(
        cookie,
        bufs.jpeg,
        "photo.jpg",
        ""
      ),
    };
  }

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "photo-upload-diag.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
