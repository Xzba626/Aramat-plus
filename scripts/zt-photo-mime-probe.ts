/** MIME edge-case probe for upload (diag only). */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
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

async function main() {
  const cookie = await login();
  const jpeg = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: "#336699",
    },
  })
    .jpeg({ quality: 85 })
    .toBuffer();

  const cases: [string, string][] = [
    ["octet-stream.jpg", "application/octet-stream"],
    ["photo.JPG", "application/octet-stream"],
    ["noext", "application/octet-stream"],
    ["photo.heic", "image/heic"],
    ["photo.jpg", "image/jpg"],
    ["photo.jpeg", "image/jpeg"],
  ];

  const rows = [];
  for (const [name, type] of cases) {
    const fd = new FormData();
    fd.append("file", new Blob([jpeg], { type }), name);
    const res = await fetch(`${BASE}/api/products/upload`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: fd,
    });
    const body = await res.json();
    let last: Record<string, unknown> = {};
    try {
      last = JSON.parse(readFileSync("tmp/upload-diag-last.json", "utf8"));
    } catch {
      /* */
    }
    rows.push({
      name,
      type,
      http: res.status,
      error: body.error ?? null,
      diagStep: last.step,
      diagMime: last.mimetype,
      diagAllowed: last.allowed,
    });
  }

  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/photo-mime-probe.json", JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
