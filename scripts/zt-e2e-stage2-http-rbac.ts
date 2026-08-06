/**
 * Stage-2 HTTP RBAC/IDOR matrix. Uses zt-ensure-users passwords.
 * Run with server up: npx tsx scripts/zt-e2e-stage2-http-rbac.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Row = {
  role: string;
  method: string;
  path: string;
  expected: number | number[];
  actual?: number;
  status: "PASS" | "FAIL" | "NOT_TESTED";
  detail?: string;
};

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie?.() ?? []) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfRes.headers);
  const { csrfToken } = await csrfRes.json();
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
  if (![200, 302].includes(res.status)) {
    throw new Error(`login failed ${email} status=${res.status}`);
  }
  return cookie();
}

function ok(expected: number | number[], actual: number) {
  return Array.isArray(expected)
    ? expected.includes(actual)
    : expected === actual;
}

async function hit(
  cookie: string,
  method: string,
  path: string
): Promise<number> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  return res.status;
}

async function main() {
  const rows: Row[] = [];
  const accounts = [
    { role: "OWNER", email: "owner@aromat.plus", password: "owner1234" },
    { role: "MANAGER", email: "manager@aromat.plus", password: "manager1234" },
    { role: "SELLER", email: "seller@aromat.plus", password: "seller1234" },
  ];

  // Probe server
  try {
    const r = await fetch(`${BASE}/api/auth/csrf`);
    if (!r.ok) throw new Error(`csrf ${r.status}`);
  } catch (e) {
    const report = {
      status: "NOT_TESTED",
      reason: e instanceof Error ? e.message : String(e),
      base: BASE,
    };
    mkdirSync("tmp", { recursive: true });
    writeFileSync(
      "tmp/e2e-stage2-http-rbac.json",
      JSON.stringify(report, null, 2)
    );
    console.log("HTTP_RBAC NOT_TESTED — server unreachable", report.reason);
    process.exit(0);
  }

  // Ensure users exist via note: caller should run zt-ensure-users first
  for (const acc of accounts) {
    let cookie = "";
    try {
      cookie = await login(acc.email, acc.password);
    } catch (e) {
      rows.push({
        role: acc.role,
        method: "LOGIN",
        path: "/api/auth/callback/credentials",
        expected: 200,
        status: "FAIL",
        detail: e instanceof Error ? e.message : String(e),
      });
      continue;
    }

    const matrix: Array<{
      method: string;
      path: string;
      expected: number | number[];
    }> =
      acc.role === "OWNER"
        ? [
            { method: "GET", path: "/dashboard", expected: [200, 307, 308] },
            { method: "GET", path: "/api/dashboard", expected: 200 },
            { method: "GET", path: "/api/analytics?period=today", expected: 200 },
            { method: "GET", path: "/api/export?type=analytics&period=today", expected: [200, 201] },
            { method: "GET", path: "/api/warehouse/stock", expected: 200 },
            { method: "GET", path: "/pos", expected: [307, 308, 403] },
            { method: "GET", path: "/api/pos/catalog", expected: [401, 403] },
          ]
        : acc.role === "MANAGER"
          ? [
              { method: "GET", path: "/dashboard", expected: [200, 307, 308] },
              { method: "GET", path: "/api/dashboard", expected: 200 },
              { method: "GET", path: "/api/analytics?period=today", expected: 200 },
              {
                method: "GET",
                path: "/api/export?type=analytics&period=today",
                expected: [200, 201, 403],
              },
              { method: "GET", path: "/api/warehouse/stock", expected: [200, 403] },
              { method: "GET", path: "/settings/wipe", expected: [307, 308, 403] },
              { method: "POST", path: "/api/settings/wipe", expected: [401, 403, 405] },
              { method: "GET", path: "/api/pos/catalog", expected: [401, 403] },
            ]
          : [
              { method: "GET", path: "/pos", expected: [200, 307, 308] },
              { method: "GET", path: "/api/pos/catalog", expected: 200 },
              { method: "GET", path: "/dashboard", expected: [307, 308, 403] },
              { method: "GET", path: "/api/dashboard", expected: [401, 403] },
              { method: "GET", path: "/api/warehouse/stock", expected: [401, 403] },
              { method: "GET", path: "/api/analytics?period=today", expected: [401, 403] },
              {
                method: "GET",
                path: "/api/export?type=analytics&period=today",
                expected: [401, 403],
              },
            ];

    for (const m of matrix) {
      try {
        const actual = await hit(cookie, m.method, m.path);
        const pass = ok(m.expected, actual);
        rows.push({
          role: acc.role,
          method: m.method,
          path: m.path,
          expected: m.expected,
          actual,
          status: pass ? "PASS" : "FAIL",
          detail: pass ? undefined : `expected ${JSON.stringify(m.expected)}`,
        });
        console.log(
          `${pass ? "PASS" : "FAIL"} ${acc.role} ${m.method} ${m.path} → ${actual}`
        );
      } catch (e) {
        rows.push({
          role: acc.role,
          method: m.method,
          path: m.path,
          expected: m.expected,
          status: "NOT_TESTED",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Manager IDOR: list stores then hit foreign store if possible
  try {
    const mgrCookie = await login("manager@aromat.plus", "manager1234");
    const storesRes = await fetch(`${BASE}/api/stores`, {
      headers: { Cookie: mgrCookie },
    });
    const stores = await storesRes.json();
    if (Array.isArray(stores) && stores.length >= 2) {
      // Manager may only see own store — try all ids from owner list
      const ownerCookie = await login("owner@aromat.plus", "owner1234");
      const allRes = await fetch(`${BASE}/api/stores`, {
        headers: { Cookie: ownerCookie },
      });
      const all = await allRes.json();
      const mgrStoreId = Array.isArray(stores) ? stores[0]?.id : null;
      const foreign = Array.isArray(all)
        ? all.find(
            (s: { id: string; kind?: string }) =>
              s.id !== mgrStoreId && s.kind === "BRANCH"
          )
        : null;
      if (foreign?.id) {
        const actual = await hit(
          mgrCookie,
          "GET",
          `/api/stores/${foreign.id}/sales`
        );
        const pass = [401, 403, 404].includes(actual);
        rows.push({
          role: "MANAGER",
          method: "GET",
          path: `/api/stores/${foreign.id}/sales`,
          expected: [401, 403, 404],
          actual,
          status: pass ? "PASS" : "FAIL",
          detail: pass ? "IDOR blocked" : "possible IDOR",
        });
        console.log(
          `${pass ? "PASS" : "FAIL"} MANAGER IDOR foreign sales → ${actual}`
        );
      } else {
        rows.push({
          role: "MANAGER",
          method: "GET",
          path: "/api/stores/{foreign}/sales",
          expected: [403],
          status: "NOT_TESTED",
          detail: "no foreign branch store found",
        });
      }
    }
  } catch (e) {
    rows.push({
      role: "MANAGER",
      method: "GET",
      path: "/api/stores/{foreign}/sales",
      expected: [403],
      status: "NOT_TESTED",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  const summary = {
    pass: rows.filter((r) => r.status === "PASS").length,
    fail: rows.filter((r) => r.status === "FAIL").length,
    notTested: rows.filter((r) => r.status === "NOT_TESTED").length,
  };
  mkdirSync("tmp", { recursive: true });
  writeFileSync(
    "tmp/e2e-stage2-http-rbac.json",
    JSON.stringify({ base: BASE, summary, rows }, null, 2)
  );
  console.log("HTTP_RBAC summary", summary);
  if (summary.fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
