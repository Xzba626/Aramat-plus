/**
 * Final cert: prove manager IDOR on store child APIs + scope leaks.
 * Read-mostly; no wipe. Run: npx tsx scripts/zt-final-cert-idor.ts
 */
import { PrismaClient, StoreKind } from "@prisma/client";

const BASE = process.env.ZT_BASE_URL || "http://127.0.0.1:3000";
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
  return cookie();
}

async function hit(c: string, path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Cookie: c },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: r.status, json, text: text.slice(0, 120) };
}

async function main() {
  const mgr = await prisma.user.findFirst({
    where: { email: "manager@aromat.plus" },
  });
  if (!mgr?.storeId) throw new Error("manager needs storeId — reseed");
  const other = await prisma.store.findFirst({
    where: {
      companyId: mgr.companyId,
      kind: StoreKind.BRANCH,
      id: { not: mgr.storeId },
    },
  });
  if (!other) throw new Error("need second branch for IDOR test");

  const c = await login("manager@aromat.plus", "manager1234");
  const findings: Array<{
    check: string;
    expect: string;
    status: number;
    verdict: "PASS" | "FAIL";
    note?: string;
  }> = [];

  const parent = await hit(c, `/api/stores/${other.id}`);
  findings.push({
    check: "GET /api/stores/{other}",
    expect: "403",
    status: parent.status,
    verdict: parent.status === 403 ? "PASS" : "FAIL",
  });

  for (const suffix of [
    "sales",
    "stock",
    "returns",
    "discounts",
    "revisions",
    "requests",
    "staff",
  ]) {
    const r = await hit(c, `/api/stores/${other.id}/${suffix}`);
    findings.push({
      check: `GET /api/stores/{other}/${suffix}`,
      expect: "403 (scoped)",
      status: r.status,
      verdict: r.status === 403 ? "PASS" : "FAIL",
      note: r.status === 200 ? "IDOR — companyId-only" : undefined,
    });
  }

  const salesAll = await hit(c, "/api/sales");
  const salesBody = salesAll.json as { length?: number } | unknown[];
  const salesLen = Array.isArray(salesBody)
    ? salesBody.length
    : Array.isArray((salesBody as { items?: unknown[] })?.items)
      ? (salesBody as { items: unknown[] }).items.length
      : -1;
  findings.push({
    check: "GET /api/sales (no storeId)",
    expect: "only own store or empty",
    status: salesAll.status,
    verdict: salesAll.status === 200 ? "PARTIAL" : "FAIL",
    note: `rows≈${salesLen} — verify if cross-store`,
  });

  const own = await hit(c, `/api/stores/${mgr.storeId}/sales`);
  findings.push({
    check: "GET /api/stores/{own}/sales",
    expect: "200",
    status: own.status,
    verdict: own.status === 200 ? "PASS" : "FAIL",
  });

  const users = await hit(c, "/api/users");
  findings.push({
    check: "GET /api/users",
    expect: "403",
    status: users.status,
    verdict: users.status === 403 ? "PASS" : "FAIL",
  });

  const journal = await hit(c, "/api/journal");
  findings.push({
    check: "GET /api/journal",
    expect: "403",
    status: journal.status,
    verdict: journal.status === 403 ? "PASS" : "FAIL",
  });

  const packCost = await hit(c, "/api/packaging-skus");
  // list ok; cost patch tested elsewhere
  findings.push({
    check: "GET /api/packaging-skus",
    expect: "200",
    status: packCost.status,
    verdict: packCost.status === 200 ? "PASS" : "FAIL",
  });

  const fail = findings.filter((f) => f.verdict === "FAIL");
  const partial = findings.filter((f) => f.verdict === "PARTIAL");
  console.log(
    JSON.stringify(
      {
        managerStoreId: mgr.storeId,
        otherStoreId: other.id,
        findings,
        summary: {
          fail: fail.length,
          partial: partial.length,
          pass: findings.filter((f) => f.verdict === "PASS").length,
        },
      },
      null,
      2
    )
  );
  if (fail.length) process.exitCode = 2;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
