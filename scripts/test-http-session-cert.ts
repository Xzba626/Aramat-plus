/**
 * HTTP login + role home + products API proof (commercial cert).
 * Run: npx tsx scripts/test-http-session-cert.ts
 */
import { PrismaClient, Role } from "@prisma/client";

const BASE = process.env.CERT_BASE_URL ?? "http://127.0.0.1:3000";
const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function login(email: string, password: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const jar = new Map<string, string>();
  const absorb = (headers: Headers) => {
    const list =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [];
    for (const raw of list) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  };
  absorb(csrfRes.headers);
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  absorb(res.headers);

  const sessionCookie = cookieHeader();
  return {
    status: res.status,
    sessionCookie,
    jarKeys: [...jar.keys()],
    body: await res.text().catch(() => ""),
  };
}

async function main() {
  console.log("=== CERT: HTTP session + products API ===\n");
  console.log("BASE", BASE);

  for (const [email, password, role] of [
    ["owner@aromat.plus", "owner1234", Role.OWNER],
    ["manager@aromat.plus", "manager1234", Role.MANAGER],
    ["seller@aromat.plus", "seller1234", Role.SELLER],
  ] as const) {
    const { status, sessionCookie, jarKeys, body } = await login(email, password);
    console.log(`  cookies: ${jarKeys.join(", ") || "(none)"}`);
    if (!sessionCookie || jarKeys.length === 0) {
      console.log("  body", body.slice(0, 200));
    }
    assert(jarKeys.some((k) => /session-token|authjs\.session/i.test(k)), `${email} session cookie keys=${jarKeys}`);
    console.log(`✓ login ${role} HTTP ${status}`);

    const sessionRes = await fetch(`${BASE}/api/auth/session`, {
      headers: { Cookie: sessionCookie },
    });
    const session = await sessionRes.json();
    console.log(`  session`, JSON.stringify(session)?.slice(0, 120));
    assert(session?.user?.email === email, `${email} session email`);
    assert(session?.user?.role === role, `${email} session role`);

    if (role === Role.OWNER || role === Role.MANAGER) {
      const prod = await fetch(`${BASE}/api/products?status=active`, {
        headers: { Cookie: sessionCookie },
      });
      const data = await prod.json();
      assert(prod.status === 200, `${role} products status ${prod.status}`);
      assert(Array.isArray(data) && data.length > 0, `${role} products non-empty`);
      console.log(`✓ ${role} GET /api/products → ${data.length} rows`);
    }

    if (role === Role.MANAGER) {
      const wipe = await fetch(`${BASE}/api/settings/wipe`, {
        headers: { Cookie: sessionCookie },
      });
      assert(wipe.status === 403, "manager wipe GET 403");
      const wo = await fetch(`${BASE}/api/warehouse/write-offs`, {
        headers: { Cookie: sessionCookie },
      });
      assert(wo.status === 403, "manager write-offs GET 403");
      console.log("✓ Manager blocked wipe + write-offs API");
    }

    if (role === Role.SELLER) {
      const cat = await fetch(`${BASE}/api/pos/catalog`, {
        headers: { Cookie: sessionCookie },
      });
      const data = await cat.json();
      assert(cat.status === 200, `seller catalog ${cat.status} ${JSON.stringify(data)}`);
      console.log(`✓ Seller POS catalog → ${data.items?.length ?? 0} items`);
    }
  }

  const users = await prisma.user.count();
  assert(users >= 3, "seed users present");
  console.log("\nPASS: HTTP session cert");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
