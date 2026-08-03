/**
 * C1 HTTP-IDOR re-proof: Manager must get 403 on foreign store children.
 * Run: npx tsx scripts/zt-final-cert-idor2.ts
 */
import assert from "node:assert/strict";
import { PrismaClient, StoreKind } from "@prisma/client";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const prisma = new PrismaClient();

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
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  const hasSession =
    jar.has("authjs.session-token") ||
    jar.has("__Secure-authjs.session-token") ||
    [...jar.keys()].some((k) => k.includes("session-token"));
  assert.ok(
    hasSession,
    `login ${email} failed status=${res.status} cookies=${[...jar.keys()].join(",")}`
  );
  return cookie();
}

async function get(cookie: string, path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  return r.status;
}

async function main() {
  const mgr = await prisma.user.findFirst({
    where: { email: "manager@aromat.plus" },
  });
  if (!mgr?.storeId) throw new Error("no manager store");
  const other = await prisma.store.findFirst({
    where: {
      companyId: mgr.companyId,
      kind: StoreKind.BRANCH,
      id: { not: mgr.storeId },
    },
  });
  if (!other) throw new Error("no other store");

  const c = await login("manager@aromat.plus", "manager1234");

  const expect: Array<{ path: string; status: number }> = [
    { path: `/api/stores/${other.id}`, status: 403 },
    { path: `/api/stores/${other.id}/sales`, status: 403 },
    { path: `/api/stores/${other.id}/stock`, status: 403 },
    { path: `/api/stores/${other.id}/returns`, status: 403 },
    { path: `/api/stores/${other.id}/discounts`, status: 403 },
    { path: `/api/stores/${other.id}/revisions`, status: 403 },
    { path: `/api/stores/${other.id}/requests`, status: 403 },
    { path: `/api/stores/${mgr.storeId}/sales`, status: 200 },
    { path: `/api/stores/${mgr.storeId}/stock`, status: 200 },
    { path: `/api/users`, status: 403 },
    { path: `/api/journal`, status: 403 },
    { path: `/api/sales`, status: 200 },
    { path: `/api/transfers`, status: 200 },
    { path: `/api/notifications`, status: 200 },
  ];

  const rows: Array<{ path: string; expected: number; actual: number; ok: boolean }> =
    [];
  let fail = 0;
  for (const e of expect) {
    const actual = await get(c, e.path);
    const ok = actual === e.status;
    if (!ok) fail += 1;
    const row = { path: e.path, expected: e.status, actual, ok };
    rows.push(row);
    console.log(JSON.stringify(row));
  }

  // packaging cost PATCH must be owner-only
  const pack = await prisma.product.findFirst({
    where: { companyId: mgr.companyId, kind: "PACKAGING", isActive: true },
  });
  if (pack) {
    const r = await fetch(`${BASE}/api/products/${pack.id}`, {
      method: "PATCH",
      headers: {
        Cookie: c,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ defaultCostPerUnit: 1 }),
      signal: AbortSignal.timeout(60000),
    });
    const ok = r.status === 403;
    if (!ok) fail += 1;
    console.log(
      JSON.stringify({
        path: `PATCH /api/products/${pack.id}`,
        expected: 403,
        actual: r.status,
        ok,
      })
    );
  }

  console.log(
    JSON.stringify(
      {
        managerStoreId: mgr.storeId,
        otherStoreId: other.id,
        fail,
        c1: fail === 0 ? "PASS" : "FAIL",
      },
      null,
      2
    )
  );
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
