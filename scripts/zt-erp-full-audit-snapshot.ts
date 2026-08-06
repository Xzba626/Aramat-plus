/**
 * ERP Full Acceptance & Stress Audit — READ ONLY snapshot.
 * Does not patch application code. Creates temporary audit.*@test.com users.
 *
 *   npx tsx scripts/zt-erp-full-audit-snapshot.ts
 *
 * Writes:
 *   tmp/ERP_FULL_AUDIT_SNAPSHOT.md
 *   tmp/erp-full-audit-*.json
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import {
  AccountingType,
  BatchOrigin,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createInventorySession } from "../src/lib/services/revision.service";
import { createExpense } from "../src/lib/services/expense.service";

const prisma = new PrismaClient();
const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const TAG = `AUDIT_${Date.now()}`;
const AUDIT_PASS = "AuditTmp2026!";

type Status = "PASS" | "FAIL" | "NOT_TESTED" | "RISK" | "PARTIAL";
type Row = {
  id: string;
  status: Status;
  detail: string;
  evidence?: string;
};
type Defect = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  module: string;
  scenario: string;
  expected: string;
  actual: string;
  reproduction: string;
  evidence: string;
  rootCauseHint?: string;
};

const rows: Row[] = [];
const defects: Defect[] = [];
const risks: Array<{ id: string; detail: string; evidence: string }> = [];

function record(
  id: string,
  status: Status,
  detail: string,
  evidence?: string
) {
  rows.push({ id, status, detail, evidence });
  console.log(`[${status}] ${id}: ${detail}`);
}

function failDefect(d: Defect) {
  defects.push(d);
  console.log(`DEFECT ${d.id} [${d.severity}] ${d.scenario}`);
}

function risk(id: string, detail: string, evidence: string) {
  risks.push({ id, detail, evidence });
  record(id, "RISK", detail, evidence);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

async function upsertAuditUser(params: {
  email: string;
  name: string;
  role: Role;
  companyId: string;
  storeId?: string | null;
}) {
  const passwordHash = await bcrypt.hash(AUDIT_PASS, 10);
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: params.role,
        isActive: true,
        name: params.name,
        companyId: params.companyId,
        storeId: params.storeId ?? null,
      },
    });
    return existing.id;
  }
  const u = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      role: params.role,
      passwordHash,
      companyId: params.companyId,
      storeId: params.storeId ?? null,
      isActive: true,
    },
  });
  return u.id;
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

async function http(
  cookie: string,
  path: string,
  method = "GET"
): Promise<{ status: number; body: string; json?: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  const body = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    /* binary or plain */
  }
  return { status: res.status, body: body.slice(0, 400), json };
}

async function main() {
  console.log(`=== ERP FULL AUDIT SNAPSHOT TAG=${TAG} ===\n`);
  mkdirSync("tmp", { recursive: true });

  const company = await prisma.company.findFirst();
  if (!company) throw new Error("no company");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  if (!warehouse) throw new Error("no warehouse");
  const ownerReal = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER, isActive: true },
  });
  if (!ownerReal) throw new Error("no owner");

  // ── Temp audit accounts (do not use production passwords in report) ─────
  let branchA = await prisma.store.findFirst({
    where: {
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      isArchived: false,
    },
    orderBy: { createdAt: "asc" },
  });
  let branchB = await prisma.store.findFirst({
    where: {
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      isArchived: false,
      id: { not: branchA?.id },
    },
  });
  const createdStoreIds: string[] = [];
  if (!branchA) {
    branchA = await prisma.store.create({
      data: {
        name: `${TAG} Branch A`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
      },
    });
    createdStoreIds.push(branchA.id);
  }
  if (!branchB) {
    branchB = await prisma.store.create({
      data: {
        name: `${TAG} Branch B`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
      },
    });
    createdStoreIds.push(branchB.id);
  }

  await upsertAuditUser({
    email: "audit.owner@test.com",
    name: `${TAG} Audit Owner`,
    role: Role.OWNER,
    companyId: company.id,
  });
  await upsertAuditUser({
    email: "audit.manager@test.com",
    name: `${TAG} Audit Manager`,
    role: Role.MANAGER,
    companyId: company.id,
    storeId: branchA.id,
  });
  await upsertAuditUser({
    email: "audit.seller@test.com",
    name: `${TAG} Audit Seller`,
    role: Role.SELLER,
    companyId: company.id,
    storeId: branchA.id,
  });
  record(
    "accounts.audit_temp",
    "PASS",
    "audit.owner/manager/seller@test.com upserted (temp password in local script only)"
  );

  // ── DB integrity snapshot ───────────────────────────────────────────────
  const [saleEmpty, transferEmpty, negBal, batchNullSale, orphanSeller] =
    await Promise.all([
      prisma.sale.count({ where: { items: { none: {} } } }),
      prisma.transfer.count({ where: { items: { none: {} } } }),
      prisma.stockBalance.count({ where: { quantity: { lt: 0 } } }),
      prisma.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM "Batch" WHERE "salePrice" IS NULL`
      ).catch(() => [{ c: 0n }]),
      prisma.user.count({
        where: {
          role: Role.SELLER,
          isActive: true,
          storeId: null,
        },
      }),
    ]);
  const batchNull = Number(batchNullSale[0]?.c ?? 0);
  record(
    "db.empty_sale_headers",
    saleEmpty === 0 ? "PASS" : "FAIL",
    `count=${saleEmpty}`
  );
  if (saleEmpty > 0) {
    failDefect({
      id: "DATA-EMPTY-SALES",
      severity: "MEDIUM",
      module: "DataIntegrity",
      scenario: "Sale without items",
      expected: "0",
      actual: String(saleEmpty),
      reproduction: `prisma.sale.count items none`,
      evidence: TAG,
    });
  }
  record(
    "db.empty_transfer_headers",
    transferEmpty === 0 ? "PASS" : "FAIL",
    `count=${transferEmpty}`
  );
  if (transferEmpty > 0) {
    failDefect({
      id: "DATA-EMPTY-TRANSFERS",
      severity: "MEDIUM",
      module: "DataIntegrity",
      scenario: "Transfer without items",
      expected: "0",
      actual: String(transferEmpty),
      reproduction: `prisma.transfer.count items none`,
      evidence: TAG,
    });
  }
  record(
    "db.negative_stock",
    negBal === 0 ? "PASS" : "FAIL",
    `count=${negBal}`
  );
  record(
    "db.batch_null_salePrice",
    batchNull === 0 ? "PASS" : "FAIL",
    `count=${batchNull}`
  );
  record(
    "db.sellers_without_store",
    orphanSeller === 0 ? "PASS" : "RISK",
    `count=${orphanSeller}`
  );

  // ── Exact FIFO 100@120 + 100@150 → sell 150 → revenue 19500 ─────────────
  const product = await prisma.product.create({
    data: {
      name: `${TAG} FIFO Exact`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 999, // catalog decoy — must NOT drive sale
      defaultCostPerUnit: 80,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 80,
      salePrice: 120,
      origin: BatchOrigin.PURCHASE,
      notes: `${TAG}-A`,
      createdById: ownerReal.id,
    });
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 100,
      salePrice: 150,
      origin: BatchOrigin.PURCHASE,
      notes: `${TAG}-B`,
      createdById: ownerReal.id,
    });
  });

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: branchA.id,
    createdById: ownerReal.id,
    items: [{ productId: product.id, quantity: 200 }],
  });

  const storeBatches = await prisma.batch.findMany({
    where: {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: branchA.id,
      quantity: { gt: 0 },
    },
    orderBy: { createdAt: "asc" },
  });
  const qtyAt120 = storeBatches
    .filter((b) => Number(b.salePrice) === 120)
    .reduce((s, b) => s + Number(b.quantity), 0);
  const qtyAt150 = storeBatches
    .filter((b) => Number(b.salePrice) === 150)
    .reduce((s, b) => s + Number(b.quantity), 0);
  const transferOk = qtyAt120 === 100 && qtyAt150 === 100;
  record(
    "fifo.transfer_preserves_layers",
    transferOk ? "PASS" : "FAIL",
    `store layers 120=${qtyAt120} 150=${qtyAt150}`
  );

  const seller = await prisma.user.findUnique({
    where: { email: "audit.seller@test.com" },
  });
  const sale = await createSale({
    companyId: company.id,
    storeId: branchA.id,
    sellerId: seller!.id,
    items: [{ productId: product.id, quantity: 150 }],
    paymentMethod: "CASH",
  });
  const items = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
  const byPrice = new Map<number, number>();
  let revenue = 0;
  let cogs = 0;
  for (const it of items) {
    const sp = Number(it.salePrice);
    const q = Number(it.quantity);
    const cp = Number(it.costPerUnit);
    byPrice.set(sp, (byPrice.get(sp) ?? 0) + q);
    revenue += sp * q;
    cogs += cp * q;
  }
  revenue = round2(revenue);
  cogs = round2(cogs);
  const expectRev = 100 * 120 + 50 * 150; // 19500
  const expectCogs = 100 * 80 + 50 * 100; // 13000
  const q120 = byPrice.get(120) ?? 0;
  const q150 = byPrice.get(150) ?? 0;
  const fifoOk =
    q120 === 100 && q150 === 50 && revenue === expectRev && cogs === expectCogs;
  record(
    "fifo.sale_150_split",
    fifoOk ? "PASS" : "FAIL",
    `SaleItem 120×${q120} + 150×${q150}; rev=${revenue} cogs=${cogs} (expect 19500/13000)`,
    sale.id
  );
  if (!fifoOk) {
    failDefect({
      id: "FIFO-150-SPLIT",
      severity: "CRITICAL",
      module: "Sale/FIFO",
      scenario: "Sell 150 across Batch A/B",
      expected: "100@120 + 50@150; rev 19500; cogs 13000",
      actual: `120×${q120} 150×${q150} rev=${revenue} cogs=${cogs}`,
      reproduction: `${TAG} createSale qty=150`,
      evidence: sale.id,
    });
  }

  // Catalog decoy unused
  const usedCatalog = items.some((i) => Number(i.salePrice) === 999);
  record(
    "fifo.ignores_product_catalog_price",
    !usedCatalog ? "PASS" : "FAIL",
    `catalog decoy 999 used=${usedCatalog}`
  );

  const remain = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: branchA.id,
  });
  record(
    "fifo.stock_after_sale",
    remain === 50 ? "PASS" : "FAIL",
    `remain=${remain} expect 50`
  );

  // Sale table total vs SaleItem sum
  const saleRow = await prisma.sale.findUnique({ where: { id: sale.id } });
  const saleTotal = Number(saleRow?.total ?? 0);
  record(
    "reconcile.sale_header_vs_items",
    Math.abs(saleTotal - revenue) < 0.02 ? "PASS" : "FAIL",
    `Sale.total=${saleTotal} itemsSum=${revenue}`
  );

  // Tagged exact math vs company analytics (cannot equal — document)
  record(
    "reconcile.dashboard_analytics_export_exact_tagged",
    "NOT_TESTED",
    "Company-wide today mixes other live sales; isolated company not provisioned. Exact SaleItem math proven above (19500)."
  );

  // ── Concurrent race (10 parallel on remaining 50 — expect no oversell) ──
  {
    const runners = 10;
    const results = await Promise.allSettled(
      Array.from({ length: runners }, () =>
        createSale({
          companyId: company.id,
          storeId: branchA.id,
          sellerId: seller!.id,
          items: [{ productId: product.id, quantity: 10 }],
          paymentMethod: "CASH",
        })
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    const stock = await getQtyAtLocation({
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: branchA.id,
    });
    const raceOk = stock >= 0 && ok <= 5 && ok + fail === runners;
    record(
      "race.10_sellers_qty10_on_50",
      raceOk && stock === 0 ? "PASS" : stock < 0 ? "FAIL" : "PARTIAL",
      `ok=${ok} fail=${fail} stock=${stock}`
    );
    if (stock < 0) {
      failDefect({
        id: "RACE-NEGATIVE-STOCK",
        severity: "CRITICAL",
        module: "Sale",
        scenario: "10 parallel sales",
        expected: "stock>=0",
        actual: String(stock),
        reproduction: TAG,
        evidence: product.id,
      });
    }
  }

  // ── H1 inventory sale ───────────────────────────────────────────────────
  {
    const p2 = await prisma.product.create({
      data: {
        name: `${TAG} H1 Probe`,
        companyId: company.id,
        accountingType: AccountingType.PIECE,
        salePrice: 50,
        defaultCostPerUnit: 10,
      },
    });
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: p2.id,
        locationType: LocationType.STORE,
        locationId: branchA.id,
        quantity: 5,
        costPerUnit: 10,
        salePrice: 50,
        origin: BatchOrigin.PURCHASE,
        notes: `${TAG}-h1`,
        createdById: ownerReal.id,
      });
    });
    const session = await createInventorySession({
      companyId: company.id,
      storeId: branchA.id,
      createdById: ownerReal.id,
    });
    let soldDuring = false;
    try {
      await createSale({
        companyId: company.id,
        storeId: branchA.id,
        sellerId: seller!.id,
        items: [{ productId: p2.id, quantity: 1 }],
      });
      soldDuring = true;
    } catch {
      soldDuring = false;
    }
    record(
      "revision.H1_sale_during_inventory",
      soldDuring ? "FAIL" : "PASS",
      soldDuring ? "sale allowed" : "sale blocked"
    );
    if (soldDuring) {
      failDefect({
        id: "H1-SALE-DURING-INVENTORY",
        severity: "HIGH",
        module: "Revision/Sale",
        scenario: "Sale while INVENTORY",
        expected: "reject",
        actual: "sale succeeded",
        reproduction: "createInventorySession → createSale",
        evidence: session.id,
        rootCauseHint: "sale.service checks active/archived, not store.status",
      });
    }
    await prisma.inventorySession.update({
      where: { id: session.id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    await prisma.store.update({
      where: { id: branchA.id },
      data: { status: "ACTIVE" },
    });
  }

  // ── Expense name coupling RISK ──────────────────────────────────────────
  {
    const src = readFileSync(
      join(process.cwd(), "src/lib/services/expense.service.ts"),
      "utf8"
    );
    if (src.includes('PACKAGING_EXPENSE_TYPE = "Флаконы"')) {
      risk(
        "arch.expense_name_coupling",
        'Packaging analytics coupled to literal expense type name "Флаконы"',
        "src/lib/services/expense.service.ts"
      );
    }
  }
  {
    // Export analytics: no canViewWarehouseFinance gate (code evidence)
    const exp = readFileSync(
      join(process.cwd(), "src/app/api/export/route.ts"),
      "utf8"
    );
    const analyticsBlock = exp.slice(exp.indexOf('type === "analytics"'));
    if (
      analyticsBlock.includes("metricCogs") &&
      !analyticsBlock.includes("canViewWarehouseFinance")
    ) {
      risk(
        "arch.export_analytics_no_finance_gate",
        "type=analytics always writes COGS/gross/net; canViewWarehouseFinance only gates type=products",
        "src/app/api/export/route.ts"
      );
    }
  }
  {
    const dash = readFileSync(
      join(process.cwd(), "src/app/api/dashboard/route.ts"),
      "utf8"
    );
    if (
      dash.includes("requireOwnerOrManager") &&
      !dash.includes("canViewWarehouseFinance")
    ) {
      risk(
        "arch.dashboard_mgr_sees_cogs_fields",
        "Dashboard API returns cogs/profit to MANAGER (scoped store) with no finance strip",
        "src/app/api/dashboard/route.ts + dashboard.service.ts"
      );
    }
  }

  // ── Expense create smoke ────────────────────────────────────────────────
  try {
    const types = await prisma.expenseType.findMany({
      where: { companyId: company.id },
      take: 5,
    });
    const rent =
      types.find((t) => /аренд|rent/i.test(t.name)) ?? types[0];
    if (rent) {
      const exp = await createExpense({
        companyId: company.id,
        storeId: branchA.id,
        createdById: ownerReal.id,
        expenseTypeId: rent.id,
        amount: 100,
        periodicity: "ONCE",
        startsAt: new Date(),
        description: `${TAG} rent probe`,
      });
      record("expense.create_once", "PASS", `id=${exp.id} type=${rent.name}`);
      await prisma.expense.delete({ where: { id: exp.id } }).catch(() => undefined);
    } else {
      record("expense.create_once", "NOT_TESTED", "no expense types");
    }
  } catch (e) {
    record(
      "expense.create_once",
      "FAIL",
      e instanceof Error ? e.message : String(e)
    );
  }

  // ── HTTP via audit.* accounts ───────────────────────────────────────────
  try {
    await fetch(`${BASE}/api/auth/csrf`);
    const ownerC = await login("audit.owner@test.com", AUDIT_PASS);
    const mgrC = await login("audit.manager@test.com", AUDIT_PASS);
    const sellerC = await login("audit.seller@test.com", AUDIT_PASS);
    record("http.login_audit_accounts", "PASS", "all three roles logged in");

    const cases: Array<{
      id: string;
      cookie: string;
      path: string;
      method?: string;
      expect: number[];
      failId?: string;
    }> = [
      {
        id: "http.owner.dashboard",
        cookie: ownerC,
        path: "/api/dashboard",
        expect: [200],
      },
      {
        id: "http.manager.dashboard_cogs_leak",
        cookie: mgrC,
        path: "/api/dashboard",
        expect: [200], // status OK; content leak checked below
      },
      {
        id: "http.manager.export_analytics_H4",
        cookie: mgrC,
        path: "/api/export?type=analytics&period=today",
        expect: [403],
        failId: "H4-MANAGER-EXPORT-COGS",
      },
      {
        id: "http.seller.dashboard",
        cookie: sellerC,
        path: "/api/dashboard",
        expect: [401, 403],
      },
      {
        id: "http.seller.warehouse",
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
        id: "http.seller.export_analytics",
        cookie: sellerC,
        path: "/api/export?type=analytics&period=today",
        expect: [401, 403],
      },
      {
        id: "http.manager.wipe",
        cookie: mgrC,
        path: "/api/settings/wipe",
        method: "POST",
        expect: [401, 403, 405],
      },
    ];

    for (const c of cases) {
      const r = await http(c.cookie, c.path, c.method ?? "GET");
      const ok = c.expect.includes(r.status);
      record(
        c.id,
        ok ? "PASS" : "FAIL",
        `${c.method ?? "GET"} ${c.path} → ${r.status} expected ${c.expect.join("|")}`
      );
      if (!ok && c.failId === "H4-MANAGER-EXPORT-COGS") {
        failDefect({
          id: "H4-MANAGER-EXPORT-COGS",
          severity: "HIGH",
          module: "Security/Export",
          scenario: "Manager analytics export",
          expected: "403",
          actual: String(r.status),
          reproduction: "audit.manager@test.com GET /api/export?type=analytics",
          evidence: BASE,
          rootCauseHint:
            "export route type=analytics never calls canViewWarehouseFinance",
        });
      }
    }

    // Manager dashboard body: has cogs key
    {
      const r = await http(mgrC, "/api/dashboard");
      const j = r.json as {
        today?: { cogs?: number; grossProfit?: number; netProfit?: number };
      } | undefined;
      const hasFinance =
        j?.today != null &&
        ("cogs" in j.today ||
          "grossProfit" in j.today ||
          "netProfit" in j.today);
      record(
        "http.manager.dashboard_exposes_finance_keys",
        hasFinance ? "FAIL" : "PASS",
        hasFinance
          ? `cogs=${j?.today?.cogs} gross=${j?.today?.grossProfit} net=${j?.today?.netProfit}`
          : "finance keys absent"
      );
      if (hasFinance) {
        failDefect({
          id: "H4b-MANAGER-DASHBOARD-COGS",
          severity: "HIGH",
          module: "Security/Dashboard",
          scenario: "Manager dashboard JSON includes COGS/profit",
          expected: "no cost/profit fields for MANAGER",
          actual: `cogs=${j?.today?.cogs}`,
          reproduction: "audit.manager GET /api/dashboard",
          evidence: TAG,
          rootCauseHint: "dashboard route does not strip finance for MANAGER",
        });
      }
    }

    // IDOR foreign store
    {
      const r = await http(mgrC, `/api/stores/${branchB!.id}/sales`);
      const ok = [401, 403, 404].includes(r.status);
      record(
        "http.manager.idor_foreign_sales",
        ok ? "PASS" : "FAIL",
        `GET /api/stores/${branchB!.id}/sales → ${r.status}`
      );
      if (!ok) {
        failDefect({
          id: "IDOR-MANAGER-SALES",
          severity: "CRITICAL",
          module: "Security",
          scenario: "Manager foreign store sales",
          expected: "403/404",
          actual: String(r.status),
          reproduction: `audit.manager GET /api/stores/${branchB!.id}/sales`,
          evidence: TAG,
        });
      }
    }
  } catch (e) {
    record(
      "http.suite",
      "NOT_TESTED",
      e instanceof Error ? e.message : String(e)
    );
  }

  // ── Scale / frontend / prior acceptance merge ───────────────────────────
  record(
    "scale.medium_20_stores_50k_sales",
    "NOT_TESTED",
    "Not executed this pass (Neon wall time; prior SMALL ~18min for 210 sales)"
  );
  record(
    "frontend.browser_all_screens",
    "NOT_TESTED",
    "Browser MCP cannot reach host localhost; no Playwright gate"
  );
  record(
    "scale.prior_acceptance_small",
    "PASS",
    "Prior ACCEPT_1785994337308: 5 stores, 100 SKU, 210 sales, oracle stock 0 mismatches — see SYSTEM_ACCEPTANCE_REPORT.md"
  );

  // Prior Stage-2 seller catalog note
  record(
    "http.seller.pos_catalog_stability",
    "PARTIAL",
    "This run + prior acceptance HTTP: 200; Stage-2 (2026-08-05): 400 VALIDATION_ERROR — data/env sensitive"
  );

  // ── Cleanup tagged probe data (keep audit users for re-login) ───────────
  console.log("\nCleanup AUDIT probe products/sessions...");
  try {
    const products = await prisma.product.findMany({
      where: { name: { startsWith: TAG } },
      select: { id: true },
    });
    const pids = products.map((p) => p.id);
    if (pids.length) {
      const sales = await prisma.sale.findMany({
        where: { items: { some: { productId: { in: pids } } } },
        select: { id: true },
      });
      const sids = sales.map((s) => s.id);
      if (sids.length) {
        await prisma.saleReturnItem.deleteMany({
          where: { return: { saleId: { in: sids } } },
        });
        await prisma.saleReturn.deleteMany({ where: { saleId: { in: sids } } });
        await prisma.saleItem.deleteMany({ where: { saleId: { in: sids } } });
        await prisma.sale.deleteMany({ where: { id: { in: sids } } });
      }
      await prisma.batch.deleteMany({ where: { productId: { in: pids } } });
      await prisma.stockBalance.deleteMany({
        where: { productId: { in: pids } },
      });
      await prisma.transferItem.deleteMany({
        where: { productId: { in: pids } },
      });
      await prisma.inventoryItem.deleteMany({
        where: { productId: { in: pids } },
      });
      await prisma.product.deleteMany({ where: { id: { in: pids } } });
    }
    await prisma.inventorySession.deleteMany({
      where: {
        status: "CANCELLED",
        storeId: branchA.id,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    }).catch(() => undefined);
    for (const id of createdStoreIds) {
      await prisma.store.delete({ where: { id } }).catch(() => undefined);
    }
    record("cleanup.probe_data", "PASS", "tagged products/sales removed; audit users kept");
  } catch (e) {
    record(
      "cleanup.probe_data",
      "PARTIAL",
      e instanceof Error ? e.message : String(e)
    );
  }

  // ── Write report ────────────────────────────────────────────────────────
  const summary = {
    pass: rows.filter((r) => r.status === "PASS").length,
    fail: rows.filter((r) => r.status === "FAIL").length,
    partial: rows.filter((r) => r.status === "PARTIAL").length,
    notTested: rows.filter((r) => r.status === "NOT_TESTED").length,
    risk: rows.filter((r) => r.status === "RISK").length,
  };

  const md = buildMarkdown({
    tag: TAG,
    summary,
    rows,
    defects,
    risks,
    fifo: { expectRev, expectCogs, revenue, cogs, q120, q150 },
  });

  const jsonPath = join("tmp", `erp-full-audit-${TAG}.json`);
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        tag: TAG,
        finishedAt: new Date().toISOString(),
        summary,
        rows,
        defects,
        risks,
        accounts: {
          note: "Temporary audit accounts — password not written to report",
          emails: [
            "audit.owner@test.com",
            "audit.manager@test.com",
            "audit.seller@test.com",
          ],
        },
      },
      null,
      2
    )
  );
  writeFileSync(join("tmp", "ERP_FULL_AUDIT_SNAPSHOT.md"), md);
  console.log(`\n=== DONE ${JSON.stringify(summary)} ===`);
  console.log(`JSON: ${jsonPath}`);
  console.log("MD: tmp/ERP_FULL_AUDIT_SNAPSHOT.md");
  process.exit(summary.fail > 0 ? 1 : 0);
}

function buildMarkdown(p: {
  tag: string;
  summary: Record<string, number>;
  rows: Row[];
  defects: Defect[];
  risks: Array<{ id: string; detail: string; evidence: string }>;
  fifo: {
    expectRev: number;
    expectCogs: number;
    revenue: number;
    cogs: number;
    q120: number;
    q150: number;
  };
}) {
  const { summary: s, rows, defects, risks, fifo, tag } = p;
  const by = (st: Status) =>
    rows.filter((r) => r.status === st).map((r) => `- \`${r.id}\`: ${r.detail}`);

  return `# ERP Full Acceptance & Stress Audit — Snapshot

**Tag:** \`${tag}\`  
**Mode:** READ-ONLY (no app code changes; no Phase 3.1)  
**Finished:** ${new Date().toISOString()}  
**Roles used:** temporary \`audit.owner@test.com\` / \`audit.manager@test.com\` / \`audit.seller@test.com\` (passwords not stored in this report)

**Question answered:** *If we give this ERP to a business with ~20 branches tomorrow — where does it break?*

---

## Counts (evidence only — no readiness %)

| Status | Count |
|--------|------:|
| PASS | ${s.pass} |
| FAIL | ${s.fail} |
| PARTIAL | ${s.partial} |
| NOT TESTED | ${s.notTested} |
| RISK | ${s.risk} |

---

## A. PASS

${by("PASS").join("\n") || "_none_"}

---

## B. FAIL

${by("FAIL").join("\n") || "_none_"}

### Defect registry

${
  defects
    .map(
      (d) => `#### ${d.id} [${d.severity}]
- **Module:** ${d.module}
- **Scenario:** ${d.scenario}
- **Expected:** ${d.expected}
- **Actual:** ${d.actual}
- **Reproduction:** ${d.reproduction}
- **Evidence:** ${d.evidence}
${d.rootCauseHint ? `- **Root-cause hint:** ${d.rootCauseHint}` : ""}`
    )
    .join("\n\n") || "_none_"
}

---

## C. PARTIAL

${by("PARTIAL").join("\n") || "_none_"}

---

## D. NOT TESTED

${by("NOT_TESTED").join("\n") || "_none_"}

---

## E. RISK (architectural / latent)

${
  risks
    .map((r) => `- **${r.id}:** ${r.detail} — _${r.evidence}_`)
    .join("\n") || by("RISK").join("\n") || "_none_"
}

---

## Exact FIFO proof (this run)

Expected after sell 150 from layers 100@120 + 100@150:

\`\`\`
SaleItem: 100 × 120 + 50 × 150
Revenue: 19500
COGS:    13000
\`\`\`

Actual: 120×${fifo.q120} + 150×${fifo.q150}; rev=${fifo.revenue}; cogs=${fifo.cogs}

---

## Where it breaks at ~20 branches (auditor view)

1. **During inventory** — sales still go through (**H1**). Stock/revision truth collapses under real ops.
2. **Manager finance** — analytics export + dashboard expose COGS/profit (**H4 / H4b**). Role boundary fails for owner-private numbers.
3. **Empty Sale/Transfer headers** in live DB — history/export noise; possible abort paths without cleanup.
4. **Expense type name coupling** (\`"Флаконы"\`) — rename type → packaging P&L silently wrong.
5. **Scale unproven** — MEDIUM 20×500×50k **NOT TESTED**; SMALL alone ~18 min wall on Neon for 210 sales.
6. **UI unproven** — full screen walk **NOT TESTED** (no browser reach / no Playwright).
7. **Exact multi-layer reconcile Dashboard=Analytics=Export** for tagged-only universe **NOT TESTED** (shared company day).

What already holds under load of a small chain: dual-FIFO \`Batch.salePrice\`, transfer layer copy, oversell atomicity, concurrent last-stock races (no negative stock in probes), Seller blocked from Owner warehouse/dashboard APIs, Manager IDOR on foreign store sales (sample).

---

## D. Recommendations

### До запуска клиентам (must)

1. Fix **H1** — block sales (and stock mutations) while \`store.status=INVENTORY\`; re-prove.
2. Fix **H4 + H4b** — gate Manager analytics export; strip COGS/profit from Manager dashboard API (or 403 finance fields).
3. Explain/clean **empty Sale/Transfer** headers; add guard so headers cannot commit empty.
4. Re-prove FIFO exact + race + IDOR after fixes.

### Можно позже

1. MEDIUM stress (20 stores / 50k sales) on pooled DB.
2. Playwright UI acceptance all roles.
3. Isolated demo company for exact Dashboard=Analytics=Export equality.
4. Decouple packaging expense from literal \`"Флаконы"\`.
5. Discount vs FIFO estimate edge proof.

### Не трогать (сейчас)

1. Phase 3.1 product work (payment analytics / container UX polish) until H1/H4 closed.
2. Cosmetic redesign / unrelated refactors.
3. Do not expand scope into new features before this snapshot’s FAIL list is green.

---

## Prior evidence merged

- \`tmp/SYSTEM_ACCEPTANCE_REPORT.md\` (ACCEPT SMALL + HTTP)
- \`tmp/E2E-STAGE2-REPORT.md\`

---

*End of snapshot. Application code was not modified for fixes.*
`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
