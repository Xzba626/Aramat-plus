/**
 * HTTP RBAC acceptance probe (read-only). Appends JSON for report merge.
 *   npx tsx scripts/zt-acceptance-http.ts
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Row = { id: string; status: "PASS" | "FAIL" | "NOT_TESTED"; detail: string };

const rows: Row[] = [];
const defects: Array<Record<string, string>> = [];

function record(id: string, status: Row["status"], detail: string) {
  rows.push({ id, status, detail });
  console.log(`[${status}] ${id}: ${detail}`);
}

function absorb(headers: Headers, jar: Map<string, string>) {
  const raw = headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}

function cookieHeader(jar: Map<string, string>) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfRes.headers, jar);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
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
  absorb(res.headers, jar);
  if (res.status !== 200 && res.status !== 302) {
    throw new Error(`login ${email} → ${res.status}`);
  }
  return cookieHeader(jar);
}

async function main() {
  console.log(`=== HTTP ACCEPTANCE BASE=${BASE} ===`);
  execSync("npx tsx scripts/zt-ensure-users.ts", {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  const ownerC = await login("owner@aromat.plus", "owner1234");
  const mgrC = await login("manager@aromat.plus", "manager1234");
  const sellerC = await login("seller@aromat.plus", "seller1234");

  const cases: Array<{
    id: string;
    cookie: string;
    path: string;
    method?: string;
    expect: number[];
  }> = [
    { id: "http.owner.dashboard_api", cookie: ownerC, path: "/api/dashboard", expect: [200] },
    {
      id: "http.owner.export_analytics",
      cookie: ownerC,
      path: "/api/export?type=analytics&period=today",
      expect: [200],
    },
    { id: "http.manager.dashboard_api", cookie: mgrC, path: "/api/dashboard", expect: [200] },
    {
      id: "http.manager.export_analytics_H4",
      cookie: mgrC,
      path: "/api/export?type=analytics&period=today",
      expect: [403],
    },
    {
      id: "http.seller.dashboard_api",
      cookie: sellerC,
      path: "/api/dashboard",
      expect: [401, 403],
    },
    {
      id: "http.seller.warehouse_stock",
      cookie: sellerC,
      path: "/api/warehouse/stock",
      expect: [401, 403],
    },
    {
      id: "http.seller.pos_catalog",
      cookie: sellerC,
      path: "/api/pos/catalog",
      expect: [200],
    },
    {
      id: "http.manager.wipe_post",
      cookie: mgrC,
      path: "/api/settings/wipe",
      method: "POST",
      expect: [401, 403, 405],
    },
  ];

  for (const c of cases) {
    const method = c.method ?? "GET";
    const res = await fetch(`${BASE}${c.path}`, {
      method,
      headers: { Cookie: c.cookie },
      redirect: "manual",
    });
    const ok = c.expect.includes(res.status);
    let body = "";
    try {
      body = (await res.text()).slice(0, 180);
    } catch {
      /* ignore */
    }
    record(
      c.id,
      ok ? "PASS" : "FAIL",
      `${method} ${c.path} → ${res.status} expected ${c.expect.join("|")}${body ? ` body=${body}` : ""}`
    );
    if (!ok && c.id.includes("H4") && res.status === 200) {
      defects.push({
        id: "H4-MANAGER-EXPORT-COGS",
        severity: "HIGH",
        scenario: "Manager GET /api/export?type=analytics → 200 (expected 403)",
        evidence: body.slice(0, 80),
      });
    }
    if (!ok && c.id.includes("pos_catalog")) {
      defects.push({
        id: "SELLER-POS-CATALOG",
        severity: "HIGH",
        scenario: `Seller GET /api/pos/catalog → ${res.status}`,
        evidence: body,
      });
    }
  }

  // IDOR probe
  const allStores = await (
    await fetch(`${BASE}/api/stores`, { headers: { Cookie: ownerC } })
  ).json();
  const mgrStores = await (
    await fetch(`${BASE}/api/stores`, { headers: { Cookie: mgrC } })
  ).json();
  const mgrId = Array.isArray(mgrStores) ? mgrStores[0]?.id : null;
  const foreign = Array.isArray(allStores)
    ? allStores.find(
        (s: { id: string; kind?: string }) => s.kind === "BRANCH" && s.id !== mgrId
      )
    : null;
  if (foreign?.id) {
    const r = await fetch(`${BASE}/api/stores/${foreign.id}/sales`, {
      headers: { Cookie: mgrC },
      redirect: "manual",
    });
    const ok = [401, 403, 404].includes(r.status);
    record("http.manager.idor_foreign_sales", ok ? "PASS" : "FAIL", `status=${r.status}`);
    if (!ok) {
      defects.push({
        id: "IDOR-MANAGER-SALES",
        severity: "CRITICAL",
        scenario: `Manager GET /api/stores/${foreign.id}/sales → ${r.status}`,
        evidence: String(r.status),
      });
    }
  } else {
    record("http.manager.idor_foreign_sales", "NOT_TESTED", "no foreign store");
  }

  mkdirSync("tmp", { recursive: true });
  const out = join("tmp", "acceptance-http-rbac.json");
  writeFileSync(
    out,
    JSON.stringify(
      {
        finishedAt: new Date().toISOString(),
        base: BASE,
        rows,
        defects,
        summary: {
          pass: rows.filter((r) => r.status === "PASS").length,
          fail: rows.filter((r) => r.status === "FAIL").length,
          notTested: rows.filter((r) => r.status === "NOT_TESTED").length,
        },
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${out}`);
  console.log(
    `HTTP summary pass=${rows.filter((r) => r.status === "PASS").length} fail=${rows.filter((r) => r.status === "FAIL").length}`
  );
  process.exit(rows.some((r) => r.status === "FAIL") ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
