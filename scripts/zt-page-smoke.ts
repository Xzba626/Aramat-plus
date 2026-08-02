/**
 * HTTP page smoke: login as role, GET critical routes, assert status + no crash HTML.
 * Run: npx tsx scripts/zt-page-smoke.ts
 */
import assert from "node:assert/strict";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

const OWNER_ROUTES = [
  "/dashboard",
  "/analytics",
  "/reports",
  "/stores",
  "/warehouse",
  "/warehouse/packaging",
  "/warehouse/receive",
  "/warehouse/stock",
  "/warehouse/transfers",
  "/warehouse/history",
  "/warehouse/products",
  "/warehouse/batches",
  "/revision",
  "/returns",
  "/discounts",
  "/reservations",
  "/users",
  "/journal",
  "/notifications",
  "/settings",
  "/settings/company",
  "/settings/password",
  "/settings/wipe",
  "/more",
  "/attention",
];

const MANAGER_BLOCKED = ["/users", "/settings/wipe", "/warehouse/write-offs"];
const MANAGER_OK = OWNER_ROUTES.filter((r) => !MANAGER_BLOCKED.includes(r));

const SELLER_ROUTES = [
  "/pos",
  "/pos/cart",
  "/pos/history",
  "/pos/notifications",
  "/pos/profile",
  "/pos/reservations",
];

type Jar = Map<string, string>;

function parseSetCookie(headers: Headers, jar: Jar) {
  const raw = headers.getSetCookie?.() ?? [];
  const list =
    raw.length > 0
      ? raw
      : (() => {
          const single = headers.get("set-cookie");
          return single ? [single] : [];
        })();
  for (const c of list) {
    const part = c.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { Cookie: cookieHeader(jar) },
  });
  parseSetCookie(csrfRes.headers, jar);
  const csrf = (await csrfRes.json()).csrfToken as string;
  assert.ok(csrf, "csrf");

  const body = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/`,
    json: "true",
  });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(jar),
    },
    body,
    redirect: "manual",
  });
  parseSetCookie(res.headers, jar);
  assert.ok(
    jar.has("authjs.session-token") ||
      jar.has("__Secure-authjs.session-token") ||
      [...jar.keys()].some((k) => k.includes("session-token")),
    `login failed for ${email} status=${res.status} cookies=${[...jar.keys()].join(",")}`
  );
  return jar;
}

async function getPage(jar: Jar, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookieHeader(jar), Accept: "text/html" },
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  const text =
    res.status >= 200 && res.status < 400 && res.headers.get("content-type")?.includes("text")
      ? await res.text()
      : "";
  return { status: res.status, location: loc, text };
}

async function assertOk(jar: Jar, path: string, role: string) {
  const r = await getPage(jar, path);
  if (r.status >= 300 && r.status < 400 && r.location) {
    // follow one hop
    const next = r.location.startsWith("http")
      ? new URL(r.location).pathname + new URL(r.location).search
      : r.location;
    const r2 = await getPage(jar, next);
    assert.ok(
      r2.status === 200,
      `${role} ${path} → ${next} status ${r2.status}`
    );
    assert.ok(
      !r2.text.includes("Application error"),
      `${role} ${path} application error`
    );
    console.log(`  OK ${path} → ${next}`);
    return;
  }
  assert.equal(r.status, 200, `${role} ${path} status ${r.status}`);
  assert.ok(!r.text.includes("Application error"), `${role} ${path} crash`);
  console.log(`  OK ${path}`);
}

async function assertRedirects(
  jar: Jar,
  path: string,
  expectPrefix: string,
  role: string
) {
  const r = await getPage(jar, path);
  assert.ok(
    r.status >= 300 && r.status < 400 && r.location,
    `${role} ${path} expected redirect, got ${r.status}`
  );
  assert.ok(
    r.location!.includes(expectPrefix),
    `${role} ${path} → ${r.location} expected ${expectPrefix}`
  );
  console.log(`  REDIR ${path} → ${r.location}`);
}

async function main() {
  console.log("=== ZT page smoke ===\n");
  console.log("BASE", BASE);

  console.log("\nOWNER");
  const owner = await login("owner@aromat.plus", "owner1234");
  for (const p of OWNER_ROUTES) await assertOk(owner, p, "OWNER");
  await assertRedirects(owner, "/pos", "/dashboard", "OWNER");

  console.log("\nMANAGER");
  const manager = await login("manager@aromat.plus", "manager1234");
  for (const p of MANAGER_OK) await assertOk(manager, p, "MANAGER");
  for (const p of MANAGER_BLOCKED) {
    await assertRedirects(manager, p, "/dashboard", "MANAGER");
  }
  await assertRedirects(manager, "/pos", "/dashboard", "MANAGER");

  console.log("\nSELLER");
  const seller = await login("seller@aromat.plus", "seller1234");
  for (const p of SELLER_ROUTES) await assertOk(seller, p, "SELLER");
  await assertRedirects(seller, "/dashboard", "/pos", "SELLER");
  await assertRedirects(seller, "/revision", "/pos", "SELLER");
  await assertRedirects(seller, "/returns", "/pos", "SELLER");

  console.log("\nPASS: ZT page smoke Owner/Manager/Seller routes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
