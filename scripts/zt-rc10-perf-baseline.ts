/**
 * RC10 — Performance baseline (HTTP timings). Compare later after Phase X polish.
 * Run: npx tsx scripts/zt-rc10-perf-baseline.ts
 * Writes: tmp/rc10-perf-baseline.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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

async function timed(
  cookie: string,
  path: string,
  n = 3
): Promise<{ path: string; samplesMs: number[]; p50: number; p95: number }> {
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    const r = await fetch(`${BASE}${path}`, {
      headers: { Cookie: cookie, Accept: "text/html,application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    // consume body
    await r.arrayBuffer();
    samples.push(Date.now() - t0);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const p50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
  const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
  return { path, samplesMs: samples, p50, p95 };
}

async function main() {
  const owner = await login("owner@aromat.plus", "owner1234");
  const seller = await login("seller@aromat.plus", "seller1234");

  const ownerPaths = [
    "/dashboard",
    "/api/dashboard",
    "/warehouse",
    "/api/warehouse/stock",
    "/notifications",
    "/api/notifications",
    "/api/notifications/count",
  ];
  const sellerPaths = ["/pos", "/api/pos/catalog", "/api/notifications/count"];

  const results: unknown[] = [];
  for (const p of ownerPaths) {
    results.push(await timed(owner, p));
    console.log(JSON.stringify(results[results.length - 1]));
  }
  for (const p of sellerPaths) {
    results.push(await timed(seller, p));
    console.log(JSON.stringify(results[results.length - 1]));
  }

  const out = {
    at: new Date().toISOString(),
    base: BASE,
    note: "HTTP round-trip baseline (not browser TTI). Re-run after Phase X to compare.",
    results,
  };
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "rc10-perf-baseline.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify({ rc10: "PASS", file: "tmp/rc10-perf-baseline.json" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
