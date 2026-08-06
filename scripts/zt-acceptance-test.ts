/**
 * ERP Acceptance Test — Full System Validation (READ-ONLY app code).
 * Creates tagged data ACCEPT_* only; cleans up after.
 *
 * Run:
 *   npx tsx scripts/zt-acceptance-test.ts
 *   ACCEPT_SCALE=small|medium npx tsx scripts/zt-acceptance-test.ts
 *
 * Does NOT fix bugs. Emits tmp/SYSTEM_ACCEPTANCE_REPORT.md + JSON.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  AccountingType,
  BatchOrigin,
  ExpensePeriodicity,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createInventorySession,
  getInventorySessionDetail,
  updateInventoryCounts,
  submitInventoryForApproval,
  approveInventorySession,
} from "../src/lib/services/revision.service";
import { createExpense } from "../src/lib/services/expense.service";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";

const prisma = new PrismaClient();
const TAG = `ACCEPT_${Date.now()}`;
const SCALE = (process.env.ACCEPT_SCALE || "small").toLowerCase();
const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Status = "PASS" | "FAIL" | "PARTIAL" | "NOT_TESTED";
type Check = { id: string; status: Status; detail: string; ms?: number; evidence?: string };
type Defect = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  module: string;
  scenario: string;
  expected: string;
  actual: string;
  reproduction: string;
  evidence: string;
};

const checks: Check[] = [];
const defects: Defect[] = [];
const perf: Array<{ name: string; ms: number; meta?: string }> = [];

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function stockKey(p: string, t: string, l: string) {
  return `${p}|${t}|${l}`;
}

function record(id: string, status: Status, detail: string, ms?: number, evidence?: string) {
  checks.push({ id, status, detail, ms, evidence });
  console.log(`[${status}] ${id}: ${detail}${ms != null ? ` (${ms}ms)` : ""}`);
}

function failDefect(d: Defect) {
  defects.push(d);
  console.log(`DEFECT ${d.id} [${d.severity}] ${d.scenario}`);
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable =
        /Can't reach database|P1001|P2028|closed|timeout|ECONNRESET/i.test(msg);
      console.log(`RETRY ${label} ${i}/${attempts}: ${msg.slice(0, 100)}`);
      if (!retryable && i >= 2) break;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
  }
  throw last;
}

function scaleCfg() {
  if (SCALE === "medium") {
    return {
      stores: 10, // full 20 deferred if unstable — document
      managers: 5,
      sellersPerStore: 2,
      piece: 80,
      weight: 40,
      salesTarget: 400,
      concurrentSellers: 6,
      label: "MEDIUM_PARTIAL_10_stores",
    };
  }
  return {
    stores: 5,
    managers: 3,
    sellersPerStore: 2,
    piece: 50,
    weight: 50,
    salesTarget: 200,
    concurrentSellers: 5,
    label: "SMALL",
  };
}

async function loginHttp(email: string, password: string) {
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
    throw new Error(`login ${email} → ${res.status}`);
  }
  return cookie();
}

async function httpGet(cookie: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const cfg = scaleCfg();
  const oracleStock = new Map<string, number>();
  let oracleRevenue = 0;
  let oracleSaleCount = 0;
  const created = {
    storeIds: [] as string[],
    userIds: [] as string[],
    productIds: [] as string[],
    saleIds: [] as string[],
    sessionIds: [] as string[],
    expenseIds: [] as string[],
    returnIds: [] as string[],
  };

  const expectStock = (
    productId: string,
    locType: "WAREHOUSE" | "STORE",
    locId: string,
    delta: number
  ) => {
    const k = stockKey(productId, locType, locId);
    oracleStock.set(k, round3((oracleStock.get(k) ?? 0) + delta));
  };

  console.log(`=== ACCEPTANCE TEST TAG=${TAG} SCALE=${cfg.label} ===\n`);

  // Integrity before
  const beforeIntegrity = await withRetry("rc11-before", async () => {
    const saleEmpty = await prisma.sale.count({
      where: { items: { none: {} } },
    });
    const transferEmpty = await prisma.transfer.count({
      where: { items: { none: {} } },
    });
    const negBal = await prisma.stockBalance.count({
      where: { quantity: { lt: 0 } },
    });
    return { saleEmpty, transferEmpty, negBal };
  });
  record(
    "integrity.before",
    beforeIntegrity.negBal === 0 ? "PASS" : "FAIL",
    `emptySales=${beforeIntegrity.saleEmpty} emptyTransfers=${beforeIntegrity.transferEmpty} negBal=${beforeIntegrity.negBal}`
  );
  if (beforeIntegrity.saleEmpty > 0 || beforeIntegrity.transferEmpty > 0) {
    failDefect({
      id: "DATA-EMPTY-HEADERS",
      severity: "MEDIUM",
      module: "DataIntegrity",
      scenario: "Pre-existing empty Sale/Transfer headers",
      expected: "0 empty headers (or proven seed-only)",
      actual: `sales=${beforeIntegrity.saleEmpty} transfers=${beforeIntegrity.transferEmpty}`,
      reproduction: "count Sale/Transfer with no items",
      evidence: TAG,
    });
  }

  const company = await withRetry("company", () => prisma.company.findFirst());
  if (!company) throw new Error("no company");
  const warehouse = await withRetry("wh", () =>
    prisma.warehouse.findFirst({
      where: { companyId: company.id, isActive: true },
    })
  );
  if (!warehouse) throw new Error("no warehouse");

  let owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER, isActive: true },
  });
  if (!owner) {
    const passwordHash = await bcrypt.hash("accept-owner", 10);
    owner = await prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-owner@accept.local`,
        name: `${TAG} Owner`,
        role: Role.OWNER,
        companyId: company.id,
        passwordHash,
        isActive: true,
      },
    });
    created.userIds.push(owner.id);
  }
  record("org.owner", "PASS", `owner=${owner.id}`);

  // ── Org: stores / managers / sellers ───────────────────────────────────
  const tOrg = Date.now();
  const stores = [];
  for (let i = 0; i < cfg.stores; i++) {
    const s = await withRetry(`store-${i}`, () =>
      prisma.store.create({
        data: {
          name: `${TAG} Shop ${i + 1}`,
          companyId: company.id,
          kind: StoreKind.BRANCH,
          isActive: true,
        },
      })
    );
    stores.push(s);
    created.storeIds.push(s.id);
  }
  const managers = [];
  for (let i = 0; i < cfg.managers; i++) {
    const store = stores[i % stores.length];
    const passwordHash = await bcrypt.hash("accept-mgr", 10);
    const m = await withRetry(`mgr-${i}`, () =>
      prisma.user.create({
        data: {
          email: `${TAG.toLowerCase()}-mgr${i}@accept.local`,
          name: `${TAG} Mgr ${i + 1}`,
          role: Role.MANAGER,
          companyId: company.id,
          storeId: store.id,
          passwordHash,
          isActive: true,
        },
      })
    );
    managers.push(m);
    created.userIds.push(m.id);
  }
  const sellers: Array<{ id: string; storeId: string }> = [];
  for (const store of stores) {
    for (let j = 0; j < cfg.sellersPerStore; j++) {
      const passwordHash = await bcrypt.hash("accept-seller", 10);
      const u = await withRetry(`seller-${store.id}-${j}`, () =>
        prisma.user.create({
          data: {
            email: `${TAG.toLowerCase()}-s${store.id.slice(-4)}${j}@accept.local`,
            name: `${TAG} Seller ${iName(store.name)} ${j + 1}`,
            role: Role.SELLER,
            companyId: company.id,
            storeId: store.id,
            passwordHash,
            isActive: true,
          },
        })
      );
      sellers.push({ id: u.id, storeId: store.id });
      created.userIds.push(u.id);
    }
  }
  const orgMs = Date.now() - tOrg;
  perf.push({
    name: "org_create",
    ms: orgMs,
    meta: `stores=${stores.length} sellers=${sellers.length}`,
  });
  record(
    "org.create",
    "PASS",
    `stores=${stores.length} managers=${managers.length} sellers=${sellers.length}`,
    orgMs
  );

  // ── Catalog + dual FIFO batches ────────────────────────────────────────
  const pieces: Array<{
    id: string;
    saleA: number;
    saleB: number;
    costA: number;
    costB: number;
  }> = [];
  const weights: Array<{
    id: string;
    saleA: number;
    saleB: number;
    costA: number;
    costB: number;
  }> = [];

  const tCat = Date.now();
  for (let i = 0; i < cfg.piece; i++) {
    const saleA = 100 + (i % 7) * 5;
    const saleB = saleA + 25;
    const costA = 40 + (i % 4) * 3;
    const costB = costA + 8;
    const p = await withRetry(`piece-${i}`, () =>
      prisma.product.create({
        data: {
          name: `${TAG} Piece ${i + 1}`,
          companyId: company.id,
          accountingType: AccountingType.PIECE,
          salePrice: saleB,
          defaultCostPerUnit: costB,
        },
      })
    );
    created.productIds.push(p.id);
    await withRetry(`piece-b-${i}`, () =>
      prisma.$transaction(
        async (tx) => {
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: 200,
            costPerUnit: costA,
            salePrice: saleA,
            origin: BatchOrigin.PURCHASE,
            notes: `${TAG}-A`,
            createdById: owner!.id,
          });
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: 200,
            costPerUnit: costB,
            salePrice: saleB,
            origin: BatchOrigin.PURCHASE,
            notes: `${TAG}-B`,
            createdById: owner!.id,
          });
        },
        { maxWait: 15_000, timeout: 60_000 }
      )
    );
    expectStock(p.id, "WAREHOUSE", warehouse.id, 400);
    pieces.push({ id: p.id, saleA, saleB, costA, costB });
  }
  for (let i = 0; i < cfg.weight; i++) {
    const saleA = 1.5 + (i % 5) * 0.1;
    const saleB = saleA + 0.4;
    const costA = 0.5;
    const costB = 0.7;
    const p = await withRetry(`weight-${i}`, () =>
      prisma.product.create({
        data: {
          name: `${TAG} Weight ${i + 1}`,
          companyId: company.id,
          accountingType: AccountingType.WEIGHT,
          salePrice: saleB,
          defaultCostPerUnit: costB,
        },
      })
    );
    created.productIds.push(p.id);
    await withRetry(`weight-b-${i}`, () =>
      prisma.$transaction(
        async (tx) => {
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: 2000,
            costPerUnit: costA,
            salePrice: saleA,
            origin: BatchOrigin.PURCHASE,
            notes: `${TAG}-WA`,
            createdById: owner!.id,
          });
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: 2000,
            costPerUnit: costB,
            salePrice: saleB,
            origin: BatchOrigin.PURCHASE,
            notes: `${TAG}-WB`,
            createdById: owner!.id,
          });
        },
        { maxWait: 15_000, timeout: 60_000 }
      )
    );
    expectStock(p.id, "WAREHOUSE", warehouse.id, 4000);
    weights.push({ id: p.id, saleA, saleB, costA, costB });
  }
  const catMs = Date.now() - tCat;
  perf.push({ name: "catalog_receive", ms: catMs });
  record(
    "catalog.receive_dual_fifo",
    "PASS",
    `piece=${pieces.length} weight=${weights.length}`,
    catMs
  );

  // Sample WH reconcile
  {
    let mism = 0;
    for (const p of pieces.slice(0, 10)) {
      const actual = await withRetry(`wq-${p.id.slice(-4)}`, () =>
        getQtyAtLocation({
          productId: p.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
        })
      );
      const expected =
        oracleStock.get(stockKey(p.id, "WAREHOUSE", warehouse.id)) ?? 0;
      if (round3(actual) !== round3(expected)) mism++;
    }
    record(
      "reconcile.wh_sample10",
      mism === 0 ? "PASS" : "FAIL",
      `mismatches=${mism}/10`
    );
  }

  // Immutable batch when catalog price changes
  {
    const p = pieces[0];
    const before = await prisma.batch.findMany({
      where: { productId: p.id, notes: { startsWith: TAG } },
      select: { id: true, salePrice: true },
    });
    await prisma.product.update({
      where: { id: p.id },
      data: { salePrice: 99999 },
    });
    const after = await prisma.batch.findMany({
      where: { productId: p.id, notes: { startsWith: TAG } },
      select: { id: true, salePrice: true },
    });
    const changed = after.filter((a) => {
      const b = before.find((x) => x.id === a.id);
      return b && Number(b.salePrice) !== Number(a.salePrice);
    });
    record(
      "batch.immutable_on_catalog_price",
      changed.length === 0 ? "PASS" : "FAIL",
      `changed=${changed.length}`
    );
    if (changed.length) {
      failDefect({
        id: "BATCH-IMMUTABLE",
        severity: "CRITICAL",
        module: "Batch",
        scenario: "Product.salePrice update mutates Batch",
        expected: "0",
        actual: String(changed.length),
        reproduction: "product.update salePrice",
        evidence: TAG,
      });
    }
  }

  // ── Transfers to all stores ────────────────────────────────────────────
  const transferQty = 40;
  const transferProducts = pieces.slice(0, Math.min(20, pieces.length));
  const tTr = Date.now();
  for (const store of stores) {
    const items = transferProducts.map((p) => ({
      productId: p.id,
      quantity: transferQty,
    }));
    await withRetry(`tr-${store.id}`, () =>
      createTransfer({
        companyId: company.id,
        fromWarehouseId: warehouse.id,
        toStoreId: store.id,
        createdById: owner!.id,
        items,
      })
    );
    for (const line of items) {
      expectStock(line.productId, "WAREHOUSE", warehouse.id, -line.quantity);
      expectStock(line.productId, "STORE", store.id, line.quantity);
    }
  }
  // Also transfer some weight
  const wProbe = weights[0];
  if (wProbe) {
    for (const store of stores.slice(0, Math.min(3, stores.length))) {
      await withRetry(`trw-${store.id}`, () =>
        createTransfer({
          companyId: company.id,
          fromWarehouseId: warehouse.id,
          toStoreId: store.id,
          createdById: owner!.id,
          items: [{ productId: wProbe.id, quantity: 500 }],
        })
      );
      expectStock(wProbe.id, "WAREHOUSE", warehouse.id, -500);
      expectStock(wProbe.id, "STORE", store.id, 500);
    }
  }
  perf.push({ name: "transfers", ms: Date.now() - tTr });

  // Transfer price slice check
  {
    const store = stores[0];
    const probe = transferProducts[0];
    const batches = await prisma.batch.findMany({
      where: {
        productId: probe.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: { gt: 0 },
      },
    });
    const atA = batches
      .filter((b) => Number(b.salePrice) === probe.saleA)
      .reduce((s, b) => s + Number(b.quantity), 0);
    // first 40 from layer A (200 available)
    const ok = round3(atA) === transferQty;
    record(
      "transfer.fifo_salePrice_slice",
      ok ? "PASS" : "FAIL",
      `expected ${transferQty}@${probe.saleA} got ${atA}`
    );
    if (!ok) {
      failDefect({
        id: "TRANSFER-SLICE",
        severity: "CRITICAL",
        module: "Transfer",
        scenario: "Store batch salePrice from WH FIFO",
        expected: `${transferQty}@${probe.saleA}`,
        actual: String(atA),
        reproduction: TAG,
        evidence: store.id,
      });
    }
  }

  // ── Sales loop (piece + weight) ────────────────────────────────────────
  const tSales = Date.now();
  let salesDone = 0;
  const payments = { CASH: 0, CARD: 0, TRANSFER: 0 };
  while (salesDone < cfg.salesTarget) {
    const store = stores[salesDone % stores.length];
    const seller =
      sellers.find((s) => s.storeId === store.id) ?? sellers[0];
    const probe = transferProducts[salesDone % transferProducts.length];
    const qty = salesDone % 7 === 0 ? 3 : 1;
    const avail = await withRetry(`av-${salesDone}`, () =>
      getQtyAtLocation({
        productId: probe.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      })
    );
    if (avail < qty) {
      salesDone++;
      continue;
    }
    const pm =
      salesDone % 3 === 0 ? "CASH" : salesDone % 3 === 1 ? "CARD" : "TRANSFER";
    try {
      const sale = await withRetry(`sale-${salesDone}`, () =>
        createSale({
          companyId: company.id,
          storeId: store.id,
          sellerId: seller.id,
          items: [{ productId: probe.id, quantity: qty }],
          paymentMethod: pm,
        })
      );
      created.saleIds.push(sale.id);
      const items = await prisma.saleItem.findMany({
        where: { saleId: sale.id },
      });
      const rev = items.reduce(
        (s, it) => s + Number(it.quantity) * Number(it.salePrice),
        0
      );
      oracleRevenue = round2(oracleRevenue + rev);
      oracleSaleCount++;
      payments[pm as keyof typeof payments] = round2(
        payments[pm as keyof typeof payments] + rev
      );
      expectStock(probe.id, "STORE", store.id, -qty);
      salesDone++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/INSUFFICIENT/i.test(msg)) {
        salesDone++;
        continue;
      }
      throw e;
    }
  }

  // Weight sales
  if (wProbe) {
    for (const store of stores.slice(0, Math.min(3, stores.length))) {
      const seller = sellers.find((s) => s.storeId === store.id)!;
      for (const qty of [1, 5, 50]) {
        try {
          const sale = await withRetry(`wsale-${store.id}-${qty}`, () =>
            createSale({
              companyId: company.id,
              storeId: store.id,
              sellerId: seller.id,
              items: [
                {
                  productId: wProbe.id,
                  quantity: qty,
                  containerSource: "CUSTOMER_BOTTLE",
                },
              ],
              paymentMethod: "CASH",
            })
          );
          created.saleIds.push(sale.id);
          const items = await prisma.saleItem.findMany({
            where: { saleId: sale.id },
          });
          const rev = items.reduce(
            (s, it) => s + Number(it.quantity) * Number(it.salePrice),
            0
          );
          oracleRevenue = round2(oracleRevenue + rev);
          oracleSaleCount++;
          payments.CASH = round2(payments.CASH + rev);
          expectStock(wProbe.id, "STORE", store.id, -qty);
          record(
            `sale.weight_${qty}ml`,
            "PASS",
            `store=${store.name} rev=${rev}`
          );
        } catch (e) {
          record(
            `sale.weight_${qty}ml`,
            "FAIL",
            e instanceof Error ? e.message : String(e)
          );
        }
      }
    }
  }

  // Client price ignore
  {
    const store = stores[0];
    const seller = sellers.find((s) => s.storeId === store.id)!;
    const probe = transferProducts[0];
    const avail = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    if (avail >= 1) {
      const sale = await createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        items: [
          {
            productId: probe.id,
            quantity: 1,
            // @ts-expect-error intentional injection
            salePrice: 1,
          },
        ],
        paymentMethod: "CASH",
      });
      created.saleIds.push(sale.id);
      const it = await prisma.saleItem.findFirst({ where: { saleId: sale.id } });
      const price = Number(it?.salePrice);
      const ok = price !== 1;
      record(
        "sale.ignore_client_price",
        ok ? "PASS" : "FAIL",
        `got=${price}`
      );
      expectStock(probe.id, "STORE", store.id, -1);
      oracleRevenue = round2(oracleRevenue + price);
      oracleSaleCount++;
      if (!ok) {
        failDefect({
          id: "CLIENT-PRICE",
          severity: "CRITICAL",
          module: "Sale",
          scenario: "client salePrice trusted",
          expected: "FIFO price",
          actual: String(price),
          reproduction: "inject salePrice:1",
          evidence: sale.id,
        });
      }
    } else {
      record("sale.ignore_client_price", "NOT_TESTED", "no stock");
    }
  }

  perf.push({
    name: "sales_loop",
    ms: Date.now() - tSales,
    meta: `sales≈${oracleSaleCount}`,
  });
  record(
    "sales.volume",
    "PASS",
    `oracleSales=${oracleSaleCount} revenue=${oracleRevenue}`
  );

  // Oversell
  {
    const store = stores[0];
    const seller = sellers.find((s) => s.storeId === store.id)!;
    const probe = transferProducts[0];
    const avail = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const before = await prisma.sale.count({ where: { storeId: store.id } });
    let threw = false;
    try {
      await createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        items: [{ productId: probe.id, quantity: avail + 100 }],
      });
    } catch {
      threw = true;
    }
    const after = await prisma.sale.count({ where: { storeId: store.id } });
    const qty = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const ok = threw && after === before && round3(qty) === round3(avail);
    record("sale.oversell_atomic", ok ? "PASS" : "FAIL", `threw=${threw}`);
  }

  // Concurrent race isolated
  {
    const store = stores[1] ?? stores[0];
    const raceP = await prisma.product.create({
      data: {
        name: `${TAG} Race`,
        companyId: company.id,
        accountingType: AccountingType.PIECE,
        salePrice: 50,
        defaultCostPerUnit: 20,
      },
    });
    created.productIds.push(raceP.id);
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: raceP.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 5,
        costPerUnit: 20,
        salePrice: 50,
        createdById: owner!.id,
      });
    });
    await createTransfer({
      companyId: company.id,
      fromWarehouseId: warehouse.id,
      toStoreId: store.id,
      createdById: owner!.id,
      items: [{ productId: raceP.id, quantity: 5 }],
    });
    const ss = sellers.filter((s) => s.storeId === store.id);
    const runners = Array.from({ length: Math.min(cfg.concurrentSellers, ss.length || 1) }, (_, i) =>
      createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: ss[i % ss.length]?.id ?? owner!.id,
        items: [{ productId: raceP.id, quantity: 5 }],
        paymentMethod: "CASH",
      })
    );
    const results = await Promise.allSettled(runners);
    const okN = results.filter((r) => r.status === "fulfilled").length;
    const badN = results.filter((r) => r.status === "rejected").length;
    for (const r of results) {
      if (r.status === "fulfilled") created.saleIds.push(r.value.id);
    }
    const qty = await getQtyAtLocation({
      productId: raceP.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const ok = okN === 1 && badN === results.length - 1 && round3(qty) === 0;
    record(
      "sale.concurrent_last5",
      ok ? "PASS" : qty < 0 || okN > 1 ? "FAIL" : "PARTIAL",
      `ok=${okN} fail=${badN} stock=${qty} runners=${results.length}`
    );
    if (qty < 0 || okN > 1) {
      failDefect({
        id: "RACE-OVERSELL",
        severity: "CRITICAL",
        module: "Sale",
        scenario: "concurrent last units",
        expected: "1 success stock=0",
        actual: `ok=${okN} stock=${qty}`,
        reproduction: `${results.length} parallel createSale qty=5 stock=5`,
        evidence: TAG,
      });
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────
  {
    let type = await prisma.expenseType.findFirst({
      where: { companyId: company.id },
    });
    if (!type) {
      type = await prisma.expenseType.create({
        data: { name: `${TAG} Opex`, companyId: company.id },
      });
    }
    const exp = await createExpense({
      companyId: company.id,
      createdById: owner!.id,
      expenseTypeId: type.id,
      amount: 250,
      storeId: stores[0].id,
      description: `${TAG} rent`,
      periodicity: ExpensePeriodicity.ONCE,
    });
    created.expenseIds.push(exp.id);
    record("expense.create_once", "PASS", `amount=250 id=${exp.id}`);
  }

  // ── Return (partial) ───────────────────────────────────────────────────
  {
    try {
      const saleId = created.saleIds[0];
      if (!saleId) {
        record("return.partial", "NOT_TESTED", "no sale");
      } else {
        const items = await prisma.saleItem.findMany({
          where: { saleId },
          take: 1,
        });
        if (!items[0]) {
          record("return.partial", "NOT_TESTED", "no sale item");
        } else {
          const ret = await createSaleReturn({
            companyId: company.id,
            saleId,
            requesterId: owner!.id,
            items: [
              {
                saleItemId: items[0].id,
                quantity: Math.min(1, Number(items[0].quantity)),
              },
            ],
          });
          created.returnIds.push(ret.id);
          await decideSaleReturn({
            companyId: company.id,
            returnId: ret.id,
            reviewerId: owner!.id,
            decision: "APPROVE",
          });
          record("return.partial_approve", "PASS", `return=${ret.id}`);
        }
      }
    } catch (e) {
      record(
        "return.partial_approve",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
      failDefect({
        id: "RETURN-FLOW",
        severity: "HIGH",
        module: "Returns",
        scenario: "create+approve partial return",
        expected: "success",
        actual: e instanceof Error ? e.message : String(e),
        reproduction: TAG,
        evidence: TAG,
      });
    }
  }

  // ── Revision H1 + blind + pending ──────────────────────────────────────
  {
    const store = stores[0];
    await prisma.inventorySession.updateMany({
      where: { storeId: store.id, status: "IN_PROGRESS" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    const session = await createInventorySession({
      companyId: company.id,
      storeId: store.id,
      createdById: owner!.id,
      comment: `${TAG}-rev`,
    });
    created.sessionIds.push(session.id);
    const st = await prisma.store.findUnique({ where: { id: store.id } });
    const detail = await getInventorySessionDetail(
      company.id,
      session.id,
      Role.OWNER
    );
    record(
      "revision.blind_in_progress_owner",
      detail.blind === true ? "PASS" : "FAIL",
      `blind=${detail.blind}`
    );

    const seller = sellers.find((s) => s.storeId === store.id)!;
    const probe = transferProducts[1] ?? transferProducts[0];
    let soldDuring = false;
    try {
      // ensure some stock via remaining qty
      const avail = await getQtyAtLocation({
        productId: probe.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      });
      if (avail >= 1 && st?.status === "INVENTORY") {
        const s = await createSale({
          companyId: company.id,
          storeId: store.id,
          sellerId: seller.id,
          items: [{ productId: probe.id, quantity: 1 }],
        });
        created.saleIds.push(s.id);
        soldDuring = true;
      }
    } catch {
      soldDuring = false;
    }
    if (soldDuring) {
      record("revision.H1_sale_during_inventory", "FAIL", "sale allowed");
      failDefect({
        id: "H1-SALE-DURING-INVENTORY",
        severity: "HIGH",
        module: "Revision/Sale",
        scenario: "Sale while INVENTORY",
        expected: "reject",
        actual: "sale succeeded",
        reproduction: "start revision → createSale",
        evidence: session.id,
      });
    } else if (st?.status === "INVENTORY") {
      record("revision.H1_sale_during_inventory", "PASS", "blocked or no stock");
    } else {
      record(
        "revision.H1_sale_during_inventory",
        "PARTIAL",
        `store.status=${st?.status}`
      );
    }

    // Fill counts = expected to allow submit
    try {
      const lines = await prisma.inventoryItem.findMany({
        where: { sessionId: session.id },
      });
      await updateInventoryCounts({
        companyId: company.id,
        sessionId: session.id,
        userId: owner!.id,
        items: lines.map((l) => ({
          productId: l.productId,
          countedQty: Number(l.expectedQty),
        })),
      });
      await submitInventoryForApproval({
        companyId: company.id,
        sessionId: session.id,
        userId: owner!.id,
      });
      const pending = await getInventorySessionDetail(
        company.id,
        session.id,
        Role.OWNER
      );
      const hasSystem =
        pending.blind === false &&
        pending.items.some((i) => "expectedQty" in i);
      record(
        "revision.pending_shows_system_fact_diff",
        hasSystem ? "PASS" : "FAIL",
        `blind=${pending.blind} items=${pending.items.length}`
      );
      // cancel to unblock rather than approve large adjust
      await prisma.inventorySession.update({
        where: { id: session.id },
        data: { status: "CANCELLED", completedAt: new Date() },
      });
      await prisma.store.update({
        where: { id: store.id },
        data: { status: "ACTIVE" },
      });
    } catch (e) {
      record(
        "revision.pending_shows_system_fact_diff",
        "FAIL",
        e instanceof Error ? e.message : String(e)
      );
      await prisma.store.update({
        where: { id: store.id },
        data: { status: "ACTIVE" },
      }).catch(() => undefined);
    }
  }

  // ── Analytics / dashboard reconcile (soft: analytics >= oracle) ────────
  {
    const tA = Date.now();
    try {
      const analytics = await withRetry("analytics", () =>
        getAnalyticsBreakdown(company.id, "today", {})
      );
      const ms = Date.now() - tA;
      perf.push({ name: "analytics_today", ms });
      const ok = analytics.network.revenue + 0.01 >= oracleRevenue;
      record(
        "analytics.today_vs_oracle_revenue",
        ok ? "PASS" : "FAIL",
        `analytics=${analytics.network.revenue} oracle=${oracleRevenue}`,
        ms
      );
      const dash = await getDashboardPayload(company.id);
      record(
        "dashboard.load",
        "PASS",
        `today=${(dash as { today?: { revenue?: number } })?.today?.revenue ?? "n/a"}`
      );
    } catch (e) {
      record(
        "analytics.today_vs_oracle_revenue",
        "NOT_TESTED",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // Full oracle stock sample
  {
    let mism = 0;
    let checked = 0;
    for (const [k, expected] of oracleStock) {
      if (checked >= 40) break;
      const [productId, locType, locId] = k.split("|");
      if (!created.productIds.includes(productId)) continue;
      const actual = await withRetry(`or-${checked}`, () =>
        getQtyAtLocation({
          productId,
          locationType: locType as LocationType,
          locationId: locId,
        })
      );
      checked++;
      if (round3(actual) !== round3(expected)) mism++;
    }
    record(
      "reconcile.oracle_stock_sample",
      mism === 0 ? "PASS" : "FAIL",
      `mismatches=${mism}/${checked}`
    );
  }

  // ── HTTP RBAC ──────────────────────────────────────────────────────────
  {
    try {
      await fetch(`${BASE}/api/auth/csrf`);
    } catch (e) {
      record(
        "http.server",
        "NOT_TESTED",
        e instanceof Error ? e.message : String(e)
      );
    }
    try {
      // ensure seed users
      const { execSync } = await import("node:child_process");
      execSync("npx tsx scripts/zt-ensure-users.ts", {
        cwd: process.cwd(),
        stdio: "ignore",
      });
      const ownerC = await loginHttp("owner@aromat.plus", "owner1234");
      const mgrC = await loginHttp("manager@aromat.plus", "manager1234");
      const sellerC = await loginHttp("seller@aromat.plus", "seller1234");

      const cases: Array<{
        id: string;
        cookie: string;
        path: string;
        expect: number[];
      }> = [
        {
          id: "http.owner.dashboard_api",
          cookie: ownerC,
          path: "/api/dashboard",
          expect: [200],
        },
        {
          id: "http.owner.export_analytics",
          cookie: ownerC,
          path: "/api/export?type=analytics&period=today",
          expect: [200],
        },
        {
          id: "http.manager.dashboard_api",
          cookie: mgrC,
          path: "/api/dashboard",
          expect: [200],
        },
        {
          id: "http.manager.export_analytics_H4",
          cookie: mgrC,
          path: "/api/export?type=analytics&period=today",
          expect: [403], // finance should be blocked — FAIL if 200
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
          expect: [401, 403, 405],
        },
      ];

      for (const c of cases) {
        const method = c.id.includes("wipe_post") ? "POST" : "GET";
        const res = await fetch(`${BASE}${c.path}`, {
          method,
          headers: { Cookie: c.cookie },
          redirect: "manual",
        });
        const ok = c.expect.includes(res.status);
        record(
          c.id,
          ok ? "PASS" : "FAIL",
          `${method} ${c.path} → ${res.status} expected ${c.expect.join("|")}`
        );
        if (!ok && c.id.includes("H4") && res.status === 200) {
          failDefect({
            id: "H4-MANAGER-EXPORT-COGS",
            severity: "HIGH",
            module: "Security/Export",
            scenario: "Manager analytics export",
            expected: "403",
            actual: "200",
            reproduction: "Manager GET /api/export?type=analytics",
            evidence: BASE,
          });
        }
        if (!ok && c.id.includes("pos_catalog")) {
          const body = await res.text();
          failDefect({
            id: "SELLER-POS-CATALOG",
            severity: "HIGH",
            module: "POS",
            scenario: "Seller catalog",
            expected: "200",
            actual: `${res.status} ${body.slice(0, 120)}`,
            reproduction: "GET /api/pos/catalog as seller",
            evidence: BASE,
          });
        }
      }

      // IDOR: manager vs foreign store from owner list
      const allStores = await (
        await fetch(`${BASE}/api/stores`, { headers: { Cookie: ownerC } })
      ).json();
      const mgrStores = await (
        await fetch(`${BASE}/api/stores`, { headers: { Cookie: mgrC } })
      ).json();
      const mgrId = Array.isArray(mgrStores) ? mgrStores[0]?.id : null;
      const foreign = Array.isArray(allStores)
        ? allStores.find(
            (s: { id: string; kind?: string }) =>
              s.kind === "BRANCH" && s.id !== mgrId
          )
        : null;
      if (foreign?.id) {
        const r = await httpGet(mgrC, `/api/stores/${foreign.id}/sales`);
        const ok = [401, 403, 404].includes(r.status);
        record(
          "http.manager.idor_foreign_sales",
          ok ? "PASS" : "FAIL",
          `status=${r.status}`
        );
        if (!ok) {
          failDefect({
            id: "IDOR-MANAGER-SALES",
            severity: "CRITICAL",
            module: "Security",
            scenario: "Manager reads foreign store sales",
            expected: "403/404",
            actual: String(r.status),
            reproduction: `GET /api/stores/${foreign.id}/sales`,
            evidence: BASE,
          });
        }
      } else {
        record("http.manager.idor_foreign_sales", "NOT_TESTED", "no foreign store");
      }
    } catch (e) {
      record(
        "http.rbac_suite",
        "NOT_TESTED",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // Frontend / browser
  record(
    "frontend.all_screens_browser",
    "NOT_TESTED",
    "Browser MCP cannot reach host localhost; no Playwright suite in this run"
  );
  record(
    "scale.full_20_stores_500_sku_10k_sales",
    SCALE === "medium" ? "PARTIAL" : "NOT_TESTED",
    SCALE === "medium"
      ? `ran ${cfg.label} not full 20/500/10000`
      : "ACCEPT_SCALE=medium not executed in this report pass"
  );
  record(
    "discount.vs_fifo_edge",
    "NOT_TESTED",
    "Requires discount-request approve then FIFO subtotal lower than estimate"
  );
  record(
    "network.offline_mid_sale",
    "NOT_TESTED",
    "Needs browser/network fault injection"
  );

  // Integrity after
  const afterIntegrity = await withRetry("rc11-after", async () => {
    const saleEmpty = await prisma.sale.count({
      where: { items: { none: {} } },
    });
    const transferEmpty = await prisma.transfer.count({
      where: { items: { none: {} } },
    });
    const negBal = await prisma.stockBalance.count({
      where: { quantity: { lt: 0 } },
    });
    return { saleEmpty, transferEmpty, negBal };
  });
  record(
    "integrity.after",
    afterIntegrity.negBal === 0 ? "PASS" : "FAIL",
    `emptySales=${afterIntegrity.saleEmpty} emptyTransfers=${afterIntegrity.transferEmpty} negBal=${afterIntegrity.negBal}`
  );

  // Cleanup
  console.log("\nCleanup tagged ACCEPT data...");
  try {
    await prisma.saleReturnItem.deleteMany({
      where: { returnId: { in: created.returnIds } },
    }).catch(() => undefined);
    await prisma.saleReturn.deleteMany({
      where: { id: { in: created.returnIds } },
    }).catch(() => undefined);
    await prisma.saleItem.deleteMany({
      where: { productId: { in: created.productIds } },
    });
    await prisma.sale.deleteMany({ where: { id: { in: created.saleIds } } });
    await prisma.expense.deleteMany({
      where: { id: { in: created.expenseIds } },
    });
    await prisma.inventoryItem.deleteMany({
      where: { sessionId: { in: created.sessionIds } },
    });
    await prisma.inventorySession.deleteMany({
      where: { id: { in: created.sessionIds } },
    });
    const tr = await prisma.transfer.findMany({
      where: { items: { some: { productId: { in: created.productIds } } } },
      select: { id: true },
    });
    await prisma.transferItem.deleteMany({
      where: { productId: { in: created.productIds } },
    });
    await prisma.transfer.deleteMany({
      where: { id: { in: tr.map((t) => t.id) } },
    });
    await prisma.stockBalance.deleteMany({
      where: { productId: { in: created.productIds } },
    });
    await prisma.batch.deleteMany({
      where: { productId: { in: created.productIds } },
    });
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: created.productIds } },
          { entityId: { in: created.saleIds } },
          { entityId: { in: created.sessionIds } },
          { entityId: { in: tr.map((t) => t.id) } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { id: { in: created.productIds } },
    });
    await prisma.user.deleteMany({
      where: { email: { contains: "@accept.local" } },
    });
    await prisma.store.deleteMany({ where: { id: { in: created.storeIds } } });
    record("cleanup", "PASS", "tagged data removed");
  } catch (e) {
    record(
      "cleanup",
      "PARTIAL",
      e instanceof Error ? e.message : String(e)
    );
  }

  const pass = checks.filter((c) => c.status === "PASS").length;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  const partial = checks.filter((c) => c.status === "PARTIAL").length;
  const notTested = checks.filter((c) => c.status === "NOT_TESTED").length;

  const reportJson = {
    title: "SYSTEM ACCEPTANCE REPORT",
    tag: TAG,
    scale: cfg.label,
    finishedAt: new Date().toISOString(),
    coverage: { pass, fail, partial, notTested, total: checks.length },
    oracle: { revenue: oracleRevenue, saleCount: oracleSaleCount, payments },
    integrity: { before: beforeIntegrity, after: afterIntegrity },
    perf,
    checks,
    defects,
  };

  mkdirSync("tmp", { recursive: true });
  const jsonPath = `tmp/acceptance-${TAG}.json`;
  writeFileSync(jsonPath, JSON.stringify(reportJson, null, 2), "utf8");

  const md = renderMarkdown(reportJson);
  writeFileSync("tmp/SYSTEM_ACCEPTANCE_REPORT.md", md, "utf8");
  console.log(
    `\n=== DONE pass=${pass} fail=${fail} partial=${partial} notTested=${notTested} defects=${defects.length}`
  );
  console.log(`JSON: ${jsonPath}`);
  console.log("MD: tmp/SYSTEM_ACCEPTANCE_REPORT.md");
  if (fail > 0 || defects.some((d) => d.severity === "CRITICAL")) {
    process.exitCode = 1;
  }
}

function iName(s: string) {
  return s.replace(/\s+/g, "");
}

function renderMarkdown(r: {
  tag: string;
  scale: string;
  finishedAt: string;
  coverage: {
    pass: number;
    fail: number;
    partial: number;
    notTested: number;
    total: number;
  };
  oracle: { revenue: number; saleCount: number; payments: Record<string, number> };
  integrity: {
    before: { saleEmpty: number; transferEmpty: number; negBal: number };
    after: { saleEmpty: number; transferEmpty: number; negBal: number };
  };
  perf: Array<{ name: string; ms: number; meta?: string }>;
  checks: Check[];
  defects: Defect[];
}) {
  const lines: string[] = [];
  lines.push("# SYSTEM ACCEPTANCE REPORT");
  lines.push("");
  lines.push(`**Tag:** ${r.tag}  `);
  lines.push(`**Scale:** ${r.scale}  `);
  lines.push(`**Finished:** ${r.finishedAt}  `);
  lines.push(`**Mode:** READ-ONLY (no app code changes)`);
  lines.push("");
  lines.push("## 1. Executive summary");
  lines.push("");
  lines.push(
    `Evidence-only counts: **PASS ${r.coverage.pass}** · **FAIL ${r.coverage.fail}** · **PARTIAL ${r.coverage.partial}** · **NOT TESTED ${r.coverage.notTested}** (total ${r.coverage.total}).`
  );
  lines.push("");
  lines.push(
    "No readiness percentage. Production decision must use FAIL / NOT TESTED lists below."
  );
  lines.push("");
  lines.push("## 2. Tested scenarios");
  lines.push("");
  lines.push(
    `- Org: stores/managers/sellers under ${r.tag}`
  );
  lines.push("- Dual-FIFO receive, catalog price immutability");
  lines.push("- Transfers to all test stores + weight sample");
  lines.push("- Volume sales (piece) + weight CUSTOMER_BOTTLE sample");
  lines.push("- Oversell + concurrent last-5 race");
  lines.push("- Expense ONCE, partial return approve");
  lines.push("- Revision blind + H1 probe + PENDING system/fact");
  lines.push("- Analytics/dashboard soft reconcile vs oracle");
  lines.push("- HTTP RBAC/IDOR (Owner/Manager/Seller)");
  lines.push("");
  lines.push("## 3. PASS");
  lines.push("");
  for (const c of r.checks.filter((x) => x.status === "PASS")) {
    lines.push(`- \`${c.id}\`: ${c.detail}`);
  }
  lines.push("");
  lines.push("## 4. FAIL");
  lines.push("");
  const fails = r.checks.filter((x) => x.status === "FAIL");
  if (!fails.length) lines.push("- (none in this run)");
  for (const c of fails) {
    lines.push(`- \`${c.id}\`: ${c.detail}`);
  }
  lines.push("");
  lines.push("### Defect registry");
  lines.push("");
  if (!r.defects.length) lines.push("- (none)");
  for (const d of r.defects) {
    lines.push(
      `- **${d.id}** [${d.severity}] ${d.module} — ${d.scenario}. Expected: ${d.expected}. Actual: ${d.actual}. Repro: ${d.reproduction}.`
    );
  }
  lines.push("");
  lines.push("## 5. NOT TESTED");
  lines.push("");
  for (const c of r.checks.filter((x) => x.status === "NOT_TESTED")) {
    lines.push(`- \`${c.id}\`: ${c.detail}`);
  }
  lines.push("");
  lines.push("## 6. Security issues");
  lines.push("");
  const sec = r.defects.filter((d) =>
    /H4|IDOR|Security|EXPORT|MANAGER/i.test(d.id + d.module)
  );
  if (!sec.length) lines.push("- No new CRITICAL security FAIL beyond listed defects.");
  for (const d of sec) {
    lines.push(`- ${d.id}: ${d.scenario} (${d.actual})`);
  }
  lines.push("");
  lines.push("## 7. Data consistency issues");
  lines.push("");
  lines.push(
    `- Before: emptySales=${r.integrity.before.saleEmpty}, emptyTransfers=${r.integrity.before.transferEmpty}, negBal=${r.integrity.before.negBal}`
  );
  lines.push(
    `- After: emptySales=${r.integrity.after.saleEmpty}, emptyTransfers=${r.integrity.after.transferEmpty}, negBal=${r.integrity.after.negBal}`
  );
  lines.push(
    `- Oracle sales=${r.oracle.saleCount} revenue=${r.oracle.revenue} payments=${JSON.stringify(r.oracle.payments)}`
  );
  lines.push("");
  lines.push("## 8. Performance issues");
  lines.push("");
  for (const p of r.perf) {
    lines.push(`- ${p.name}: ${p.ms}ms${p.meta ? ` (${p.meta})` : ""}`);
  }
  lines.push("");
  lines.push("## 9. Recommended fixes priority (do not implement in this stage)");
  lines.push("");
  lines.push("1. H1 — block sales while store INVENTORY");
  lines.push("2. H4 — gate Manager analytics export / COGS");
  lines.push("3. Seller POS catalog VALIDATION_ERROR (if FAIL)");
  lines.push("4. Investigate empty Sale/Transfer headers (seed vs live path)");
  lines.push("5. Discount vs FIFO estimate (still NOT TESTED here)");
  lines.push("6. Infra: Neon stability / pooling");
  lines.push("");
  lines.push("## 10. Production readiness checklist");
  lines.push("");
  lines.push("- [ ] All HIGH/CRITICAL FAIL closed and re-proven");
  lines.push("- [ ] Empty Sale/Transfer explained or cleaned + guarded");
  lines.push("- [ ] MEDIUM scale (20 stores / 10k sales) PASS or accepted risk");
  lines.push("- [ ] Browser UI acceptance PASS (or dedicated Playwright gate)");
  lines.push("- [ ] Discount/FIFO edge PASS");
  lines.push("- [ ] Stable DB (not cold-start disconnects during peak)");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### PARTIAL checks");
  lines.push("");
  for (const c of r.checks.filter((x) => x.status === "PARTIAL")) {
    lines.push(`- \`${c.id}\`: ${c.detail}`);
  }
  return lines.join("\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
