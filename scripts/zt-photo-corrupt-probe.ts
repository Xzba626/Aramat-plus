import { writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

async function login() {
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
      email: "owner@aromat.plus",
      password: "owner1234",
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function up(cookie: string, buf: Buffer, name: string, type: string) {
  const fd = new FormData();
  fd.append("file", new Blob([buf], { type }), name);
  const res = await fetch(`${BASE}/api/products/upload`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: fd,
  });
  const body = await res.json();
  const diag = JSON.parse(readFileSync("tmp/upload-diag-last.json", "utf8"));
  return {
    http: res.status,
    error: body.error ?? null,
    step: diag.step,
    meta: diag.meta ?? null,
    metaError: diag.metaError ?? null,
  };
}

async function main() {
  const cookie = await login();
  const good = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: "#f00",
    },
  })
    .webp()
    .toBuffer();
  const trunc = Buffer.from(good.subarray(0, 20));
  const emptyWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
  ]);
  const jpeg = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: "#0f0",
    },
  })
    .jpeg()
    .toBuffer();

  const results = {
    good_webp: await up(cookie, good, "a.webp", "image/webp"),
    trunc_webp: await up(cookie, trunc, "b.webp", "image/webp"),
    junk_webp: await up(cookie, emptyWebp, "c.webp", "image/webp"),
    jpeg_as_webp: await up(cookie, jpeg, "d.webp", "image/webp"),
  };
  writeFileSync("tmp/photo-corrupt-probe.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
