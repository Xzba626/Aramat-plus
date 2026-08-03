/**
 * Smoke: PWA manifest + SW + notifications count reachable.
 * Run: npx tsx scripts/zt-pwa-shell-proof.ts
 */
import assert from "node:assert/strict";

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

async function main() {
  const man = await fetch(`${BASE}/manifest.webmanifest`);
  assert.equal(man.status, 200, "manifest");
  const mj = await man.json();
  assert.equal(mj.display, "standalone");
  assert.ok(Array.isArray(mj.icons) && mj.icons.length >= 1);

  const sw = await fetch(`${BASE}/sw.js`);
  assert.equal(sw.status, 200, "sw.js");
  const swText = await sw.text();
  assert.ok(swText.includes("CACHE_VERSION"));

  const off = await fetch(`${BASE}/offline`);
  assert.ok(off.status === 200 || off.status === 307 || off.status === 302, `offline ${off.status}`);

  const c = await login("seller@aromat.plus", "seller1234");
  const count = await fetch(`${BASE}/api/notifications/count`, {
    headers: { Cookie: c },
  });
  assert.equal(count.status, 200);
  const cj = await count.json();
  assert.ok(typeof cj.unread === "number");

  console.log(JSON.stringify({ ok: true, pwa: "PASS", unread: cj.unread }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
