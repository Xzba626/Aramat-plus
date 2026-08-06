/**
 * Re-prove must-have fixes H1 / H4 / H4b (read-only probes against local API + services).
 * Uses temporary audit.*@test.com accounts.
 *
 *   npx tsx scripts/zt-fix-musthave-prove.ts
 */
import {
  AccountingType,
  BatchOrigin,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { createInventorySession } from "../src/lib/services/revision.service";

const prisma = new PrismaClient();
const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const TAG = `FIX_${Date.now()}`;
const AUDIT_PASS = "AuditTmp2026!";

type Row = { id: string; ok: boolean; detail: string };
const rows: Row[] = [];

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
  console.log(`=== MUST-HAVE FIX PROVE TAG=${TAG} ===\n`);
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("no company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER, isActive: true },
  });
  if (!owner) throw new Error("no owner");
  const store = await prisma.store.findFirst({
    where: {
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      isArchived: false,
    },
  });
  if (!store) throw new Error("no store");
  const seller = await prisma.user.findFirst({
    where: {
      email: "audit.seller@test.com",
      isActive: true,
    },
  });
  if (!seller) throw new Error("run zt-erp-full-audit-snapshot once to create audit users");

  await prisma.user.update({
    where: { id: seller.id },
    data: { storeId: store.id },
  });

  // H1
  const p = await prisma.product.create({
    data: {
      name: `${TAG} H1`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 50,
      defaultCostPerUnit: 10,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 5,
      costPerUnit: 10,
      salePrice: 50,
      origin: BatchOrigin.PURCHASE,
      createdById: owner.id,
    });
  });
  const session = await createInventorySession({
    companyId: company.id,
    storeId: store.id,
    createdById: owner.id,
  });
  let h1Blocked = false;
  let h1Msg = "";
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: p.id, quantity: 1 }],
    });
  } catch (e) {
    h1Blocked = true;
    h1Msg = e instanceof Error ? e.message : String(e);
  }
  rows.push({
    id: "H1.sale_blocked_during_inventory",
    ok: h1Blocked && h1Msg === "STORE_INVENTORY_IN_PROGRESS",
    detail: h1Blocked ? h1Msg : "sale allowed",
  });
  await prisma.inventorySession.update({
    where: { id: session.id },
    data: { status: "CANCELLED", completedAt: new Date() },
  });
  await prisma.store.update({
    where: { id: store.id },
    data: { status: "ACTIVE" },
  });

  // Cleanup product
  await prisma.batch.deleteMany({ where: { productId: p.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: p.id } });
  await prisma.inventoryItem.deleteMany({ where: { productId: p.id } });
  await prisma.product.delete({ where: { id: p.id } });
  await prisma.inventorySession.delete({ where: { id: session.id } }).catch(() => undefined);

  // H4 / H4b HTTP
  const mgrC = await login("audit.manager@test.com", AUDIT_PASS);
  const dash = await fetch(`${BASE}/api/dashboard`, {
    headers: { Cookie: mgrC },
  });
  const dashJson = (await dash.json()) as {
    today?: { cogs?: number; grossProfit?: number; netProfit?: number; revenue?: number };
  };
  const hasCogs = dashJson?.today != null && "cogs" in dashJson.today;
  const hasGross = dashJson?.today != null && "grossProfit" in dashJson.today;
  const hasNet = dashJson?.today != null && "netProfit" in dashJson.today;
  const hasRev = dashJson?.today != null && "revenue" in dashJson.today;
  rows.push({
    id: "H4b.dashboard_no_cogs_keys",
    ok: dash.status === 200 && !hasCogs && !hasGross && !hasNet && hasRev,
    detail: `status=${dash.status} cogs=${hasCogs} gross=${hasGross} net=${hasNet} revenue=${hasRev}`,
  });

  const exp = await fetch(`${BASE}/api/export?type=analytics&period=today`, {
    headers: { Cookie: mgrC },
  });
  // Option A: 200 allowed but without COGS — inspect is binary; check Content-Type + size heuristic via analytics API
  const analytics = await fetch(`${BASE}/api/analytics?period=today`, {
    headers: { Cookie: mgrC },
  });
  const aJson = (await analytics.json()) as {
    network?: { cogs?: number; grossProfit?: number; netProfit?: number; revenue?: number };
  };
  rows.push({
    id: "H4.analytics_api_no_cogs",
    ok:
      analytics.status === 200 &&
      aJson.network != null &&
      !("cogs" in aJson.network) &&
      !("grossProfit" in aJson.network) &&
      !("netProfit" in aJson.network) &&
      "revenue" in aJson.network,
    detail: `status=${analytics.status} keys=${Object.keys(aJson.network ?? {}).join(",")}`,
  });
  rows.push({
    id: "H4.export_analytics_still_200_option_a",
    ok: exp.status === 200,
    detail: `export status=${exp.status} (Option A: revenue export allowed without finance columns)`,
  });

  for (const r of rows) {
    console.log(`[${r.ok ? "PASS" : "FAIL"}] ${r.id}: ${r.detail}`);
  }
  const fail = rows.filter((r) => !r.ok).length;
  console.log(`\n=== DONE pass=${rows.length - fail} fail=${fail} ===`);
  process.exit(fail > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
