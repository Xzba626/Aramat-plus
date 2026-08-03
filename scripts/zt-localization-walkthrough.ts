/**
 * Wave F browser/API walkthrough: scrape visible text risks by role + locale.
 * Uses credentials from env or CLI:
 *   ZT_OWNER_EMAIL / ZT_OWNER_PASSWORD
 *   ZT_MANAGER_EMAIL / ZT_MANAGER_PASSWORD
 *   ZT_SELLER_EMAIL / ZT_SELLER_PASSWORD
 *   BASE_URL (default http://127.0.0.1:3000)
 *
 * Run: npx tsx scripts/zt-localization-walkthrough.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";

type RoleKey = "owner" | "manager" | "seller";

const CREDS: Record<
  RoleKey,
  { email?: string; password?: string; paths: string[] }
> = {
  owner: {
    email: process.env.ZT_OWNER_EMAIL || "owner@aromat.plus",
    password: process.env.ZT_OWNER_PASSWORD,
    paths: [
      "/dashboard",
      "/warehouse",
      "/warehouse/products",
      "/warehouse/packaging",
      "/stores",
      "/analytics",
      "/reports",
      "/revision",
      "/discounts",
      "/returns",
      "/journal",
      "/notifications",
      "/users",
      "/settings",
      "/reservations",
      "/sales",
    ],
  },
  manager: {
    email: process.env.ZT_MANAGER_EMAIL,
    password: process.env.ZT_MANAGER_PASSWORD,
    paths: [
      "/dashboard",
      "/warehouse",
      "/warehouse/products",
      "/stores",
      "/revision",
      "/discounts",
      "/returns",
      "/notifications",
    ],
  },
  seller: {
    email: process.env.ZT_SELLER_EMAIL,
    password: process.env.ZT_SELLER_PASSWORD,
    paths: ["/pos", "/pos/cart", "/pos/history", "/pos/notifications", "/pos/profile"],
  },
};

const RAW_ENUM =
  /\b(REVISION_(?:CREATE|COUNT|APPROVE|CANCEL)|LOGIN_FAIL|LOGIN_LOCKED|bad_password|SALE_CREATE|TRANSFER_CREATE|OWNER_DIRECT|IN_PROGRESS|PENDING_APPROVAL|COMPLETED|CANCELLED|UNAUTHORIZED|FORBIDDEN|VALIDATION_ERROR)\b/;

async function login(
  email: string,
  password: string
): Promise<{ cookie: string } | { error: string }> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { Accept: "application/json" },
  });
  const csrfJson = (await csrfRes.json()) as { csrfToken?: string };
  const csrf = csrfJson.csrfToken;
  if (!csrf) return { error: "no csrf" };
  const setCookie1 = csrfRes.headers.getSetCookie?.() ?? [];
  const jar = new Map<string, string>();
  for (const c of setCookie1) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }

  const body = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });

  const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
      Accept: "application/json",
    },
    body,
    redirect: "manual",
  });
  const setCookie2 = loginRes.headers.getSetCookie?.() ?? [];
  for (const c of setCookie2) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const sessionCookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (loginRes.status >= 400) {
    return { error: `login HTTP ${loginRes.status}` };
  }
  // Verify session
  const sess = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: sessionCookie },
  });
  const sessJson = (await sess.json()) as { user?: { email?: string } };
  if (!sessJson?.user?.email) return { error: "session empty after login" };
  return { cookie: sessionCookie };
}

async function pageText(
  cookie: string,
  pathName: string,
  locale: "ru" | "tj"
): Promise<string> {
  const res = await fetch(`${BASE}${pathName}`, {
    headers: {
      Cookie: `${cookie}; aromat_locale=${locale}`,
      Accept: "text/html",
    },
  });
  const html = await res.text();
  // Strip scripts/styles
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const findings: Array<{
    role: string;
    locale: string;
    path: string;
    hit: string;
  }> = [];
  const roleResults: Record<string, "PASS" | "PARTIAL" | "FAIL" | "SKIP"> = {};

  for (const role of Object.keys(CREDS) as RoleKey[]) {
    const cfg = CREDS[role];
    if (!cfg.password || !cfg.email) {
      roleResults[role] = "SKIP";
      console.log(`SKIP ${role}: credentials not set in env`);
      continue;
    }
    const auth = await login(cfg.email, cfg.password);
    if ("error" in auth) {
      roleResults[role] = "FAIL";
      console.log(`FAIL ${role}: ${auth.error}`);
      continue;
    }
    let roleFail = false;
    for (const locale of ["ru", "tj"] as const) {
      for (const p of cfg.paths) {
        const text = await pageText(auth.cookie, p, locale);
        const m = text.match(RAW_ENUM);
        if (m) {
          roleFail = true;
          findings.push({ role, locale, path: p, hit: m[0] });
        }
      }
    }
    roleResults[role] = roleFail ? "FAIL" : "PASS";
    console.log(`${roleResults[role]} ${role}`);
  }

  const out = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    roleResults,
    findings,
  };
  const outPath = path.join(process.cwd(), "tmp", "wave-f-walkthrough.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);

  const attempted = Object.values(roleResults).filter((v) => v !== "SKIP");
  const passed = attempted.filter((v) => v === "PASS");
  if (attempted.length === 0) {
    console.log("WALKTHROUGH: PARTIAL (no role credentials available)");
    process.exit(0);
  }
  if (passed.length === attempted.length && findings.length === 0) {
    console.log("WALKTHROUGH: PASS");
    process.exit(0);
  }
  console.log("WALKTHROUGH: PARTIAL/FAIL — see tmp/wave-f-walkthrough.json");
  process.exit(findings.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
