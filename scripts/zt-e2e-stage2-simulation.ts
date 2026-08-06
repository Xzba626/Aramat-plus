/**
 * Stage-2 E2E business simulation with independent mathematical oracle.
 * Creates ONLY tagged test data (prefix E2E2_). Does NOT fix bugs. Does NOT wipe CRM.
 *
 * Run: npx tsx scripts/zt-e2e-stage2-simulation.ts
 * Env: E2E2_SCALE=small|medium (default small)
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import {
  AccountingType,
  BatchOrigin,
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
} from "../src/lib/services/revision.service";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";

const prisma = new PrismaClient();
const TAG = `E2E2_${Date.now()}`;
const SCALE = (process.env.E2E2_SCALE || "small").toLowerCase();

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Status = "PASS" | "FAIL" | "PARTIAL" | "NOT_TESTED";

type Defect = {
  id: string;
  severity: Severity;
  module: string;
  scenario: string;
  expected: string;
  actual: string;
  reproduction: string;
  evidence: string;
  rootCauseHypothesis: string;
  baselineRef?: string;
};

type Check = {
  id: string;
  status: Status;
  detail: string;
  ms?: number;
};

type OracleBatch = {
  productId: string;
  locationType: "WAREHOUSE" | "STORE";
  locationId: string;
  qty: number;
  cost: number;
  sale: number;
  note: string;
};

type Oracle = {
  stock: Map<string, number>; // key productId|locType|locId
  revenue: number;
  cogs: number;
  saleCount: number;
  payment: Map<string, number>;
};

function stockKey(
  productId: string,
  locType: string,
  locId: string
): string {
  return `${productId}|${locType}|${locId}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 5
): Promise<T> {
  let last: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = e instanceof Error ? e.message : String(e);
      const neon =
        msg.includes("Can't reach database") ||
        msg.includes("P1001") ||
        msg.includes("P2028") ||
        msg.includes("closed");
      console.log(`RETRY ${label} ${i}/${attempts}: ${msg.slice(0, 120)}`);
      if (!neon && i >= 2) break;
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw last;
}

function scaleConfig() {
  if (SCALE === "medium") {
    return {
      stores: 8,
      sellersPerStore: 2,
      managers: 3,
      pieceProducts: 40,
      weightProducts: 20,
      salesPerStore: 4,
    };
  }
  // small — enough for chain + edge cases without huge load
  return {
    stores: 3,
    sellersPerStore: 2,
    managers: 2,
    pieceProducts: 12,
    weightProducts: 6,
    salesPerStore: 3,
  };
}

async function main() {
  const cfg = scaleConfig();
  const checks: Check[] = [];
  const defects: Defect[] = [];
  const created = {
    storeIds: [] as string[],
    userIds: [] as string[],
    productIds: [] as string[],
    saleIds: [] as string[],
    transferIds: [] as string[],
    sessionIds: [] as string[],
  };

  const oracle: Oracle = {
    stock: new Map(),
    revenue: 0,
    cogs: 0,
    saleCount: 0,
    payment: new Map(),
  };

  function expectStock(
    productId: string,
    locType: "WAREHOUSE" | "STORE",
    locId: string,
    delta: number
  ) {
    const k = stockKey(productId, locType, locId);
    oracle.stock.set(k, round3((oracle.stock.get(k) ?? 0) + delta));
  }

  function addDefect(d: Defect) {
    defects.push(d);
    console.log(`DEFECT ${d.id} [${d.severity}] ${d.scenario}`);
  }

  function record(id: string, status: Status, detail: string, ms?: number) {
    checks.push({ id, status, detail, ms });
    console.log(`[${status}] ${id}: ${detail}`);
  }

  console.log(`=== Stage-2 E2E simulation TAG=${TAG} SCALE=${SCALE} ===\n`);

  // ── Preflight ──────────────────────────────────────────────────────────
  const company = await withRetry("company", () =>
    prisma.company.findFirst()
  );
  assert.ok(company, "no company");
  const warehouse = await withRetry("warehouse", () =>
    prisma.warehouse.findFirst({
      where: { companyId: company.id, isActive: true },
    })
  );
  assert.ok(warehouse, "no warehouse");

  const owner = await withRetry("owner", async () => {
    const existing = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.OWNER, isActive: true },
    });
    if (existing) return existing;
    const passwordHash = await bcrypt.hash("e2e2-owner-temp", 10);
    return prisma.user.create({
      data: {
        email: `${TAG.toLowerCase()}-owner@e2e.local`,
        name: `${TAG} Owner`,
        role: Role.OWNER,
        companyId: company.id,
        passwordHash,
        isActive: true,
      },
    });
  });
  created.userIds.push(owner.id);
  record("preflight.company", "PASS", `company=${company.id}`);

  // ── 1. Org structure ───────────────────────────────────────────────────
  const t0 = Date.now();
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
    const passwordHash = await bcrypt.hash("e2e2-mgr", 10);
    const m = await withRetry(`mgr-${i}`, () =>
      prisma.user.create({
        data: {
          email: `${TAG.toLowerCase()}-mgr${i}@e2e.local`,
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
      const passwordHash = await bcrypt.hash("e2e2-seller", 10);
      const u = await withRetry(`seller-${store.id}-${j}`, () =>
        prisma.user.create({
          data: {
            email: `${TAG.toLowerCase()}-s${store.id.slice(-4)}-${j}@e2e.local`,
            name: `${TAG} Seller ${store.name} #${j + 1}`,
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
  record(
    "org.create",
    "PASS",
    `stores=${stores.length} managers=${managers.length} sellers=${sellers.length}`,
    Date.now() - t0
  );

  // ── 2. Products + multi-price FIFO batches at WH ───────────────────────
  const pieceProducts: Array<{
    id: string;
    saleA: number;
    saleB: number;
    costA: number;
    costB: number;
  }> = [];
  const weightProducts: Array<{
    id: string;
    saleA: number;
    saleB: number;
    costA: number;
    costB: number;
  }> = [];

  for (let i = 0; i < cfg.pieceProducts; i++) {
    const saleA = 100 + (i % 5) * 10;
    const saleB = saleA + 20;
    const costA = 40 + (i % 3) * 5;
    const costB = costA + 10;
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
    await withRetry(`piece-batch-${i}`, () =>
      prisma.$transaction(async (tx) => {
        await addBatch(tx, {
          productId: p.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: 100,
          costPerUnit: costA,
          salePrice: saleA,
          origin: BatchOrigin.PURCHASE,
          notes: `${TAG}-A`,
          createdById: owner.id,
        });
        await addBatch(tx, {
          productId: p.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: 100,
          costPerUnit: costB,
          salePrice: saleB,
          origin: BatchOrigin.PURCHASE,
          notes: `${TAG}-B`,
          createdById: owner.id,
        });
      })
    );
    expectStock(p.id, "WAREHOUSE", warehouse.id, 200);
    pieceProducts.push({ id: p.id, saleA, saleB, costA, costB });
  }

  for (let i = 0; i < cfg.weightProducts; i++) {
    const saleA = 1.2 + (i % 4) * 0.1;
    const saleB = saleA + 0.3;
    const costA = 0.4;
    const costB = 0.55;
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
    await withRetry(`weight-batch-${i}`, () =>
      prisma.$transaction(async (tx) => {
        await addBatch(tx, {
          productId: p.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: 1000,
          costPerUnit: costA,
          salePrice: saleA,
          origin: BatchOrigin.PURCHASE,
          notes: `${TAG}-WA`,
          createdById: owner.id,
        });
        await addBatch(tx, {
          productId: p.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: 1000,
          costPerUnit: costB,
          salePrice: saleB,
          origin: BatchOrigin.PURCHASE,
          notes: `${TAG}-WB`,
          createdById: owner.id,
        });
      })
    );
    expectStock(p.id, "WAREHOUSE", warehouse.id, 2000);
    weightProducts.push({ id: p.id, saleA, saleB, costA, costB });
  }
  record(
    "catalog.receive",
    "PASS",
    `piece=${pieceProducts.length} weight=${weightProducts.length} each 2 FIFO layers`
  );

  // Reconcile WH stock vs oracle
  let stockMismatches = 0;
  for (const p of [...pieceProducts, ...weightProducts]) {
    const actual = await withRetry(`wh-qty-${p.id.slice(-4)}`, () =>
      getQtyAtLocation({
        productId: p.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      })
    );
    const expected =
      oracle.stock.get(stockKey(p.id, "WAREHOUSE", warehouse.id)) ?? 0;
    if (round3(actual) !== round3(expected)) {
      stockMismatches++;
      addDefect({
        id: `NEW-STOCK-${p.id.slice(-6)}`,
        severity: "HIGH",
        module: "StockBalance",
        scenario: "WH qty after receive",
        expected: String(expected),
        actual: String(actual),
        reproduction: `product ${p.id} after dual addBatch`,
        evidence: TAG,
        rootCauseHypothesis: "oracle/addBatch divergence",
      });
    }
  }
  record(
    "reconcile.wh_after_receive",
    stockMismatches === 0 ? "PASS" : "FAIL",
    `mismatches=${stockMismatches}`
  );

  // ── 3. Transfers: distribute to stores (slice salePrice) ───────────────
  const transferQtyPiece = 30;
  for (const store of stores) {
    const items = pieceProducts.slice(0, Math.min(6, pieceProducts.length)).map(
      (p) => ({ productId: p.id, quantity: transferQtyPiece })
    );
    const tr = await withRetry(`transfer-${store.id}`, () =>
      createTransfer({
        companyId: company.id,
        fromWarehouseId: warehouse.id,
        toStoreId: store.id,
        createdById: owner.id,
        items,
      })
    );
    created.transferIds.push((tr as { id?: string }).id ?? String(tr));
    for (const line of items) {
      expectStock(line.productId, "WAREHOUSE", warehouse.id, -line.quantity);
      expectStock(line.productId, "STORE", store.id, line.quantity);
    }

    // Assert store batches keep first-layer salePrice for first 20 of 30
    const probe = pieceProducts[0];
    const storeBatches = await prisma.batch.findMany({
      where: {
        productId: probe.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: { gt: 0 },
      },
      orderBy: { receivedAt: "asc" },
    });
    const qtyAt120 = storeBatches
      .filter((b) => Number(b.salePrice) === probe.saleA)
      .reduce((s, b) => s + Number(b.quantity), 0);
    const qtyAt140 = storeBatches
      .filter((b) => Number(b.salePrice) === probe.saleB)
      .reduce((s, b) => s + Number(b.quantity), 0);
    // transfer 30 from layers 100@saleA + 100@saleB → 30@saleA
    if (round3(qtyAt120) !== 30 || round3(qtyAt140) !== 0) {
      addDefect({
        id: "BASE-H-TRANSFER-PRICE",
        severity: "HIGH",
        module: "Transfer",
        scenario: "Transfer must copy FIFO salePrice not Product catalog",
        expected: `30@${probe.saleA}, 0@${probe.saleB}`,
        actual: `${qtyAt120}@${probe.saleA}, ${qtyAt140}@${probe.saleB}`,
        reproduction: `TAG=${TAG} transfer ${transferQtyPiece} of ${probe.id} to ${store.id}`,
        evidence: JSON.stringify(
          storeBatches.map((b) => ({
            q: Number(b.quantity),
            sp: Number(b.salePrice),
          }))
        ),
        rootCauseHypothesis: "transfer used Product.salePrice or wrong slice",
        baselineRef: "Phase3 S2/S5",
      });
      record("transfer.salePrice_slice", "FAIL", store.name);
    } else {
      record("transfer.salePrice_slice", "PASS", store.name);
    }
  }

  // ── 4. Sales: mixed FIFO across stores ─────────────────────────────────
  // Sell 25 of first piece product → expect 20@saleA + 5@saleB if store has 30@saleA only
  // After transfer of 30@saleA only, sell 25 → all @saleA, revenue = 25*saleA
  for (let si = 0; si < stores.length; si++) {
    const store = stores[si];
    const seller =
      sellers.find((s) => s.storeId === store.id) ?? sellers[0];
    const probe = pieceProducts[0];
    const qty = 25;
    const expectedUnit = probe.saleA; // only layer A was transferred (30)
    const expectedRevenue = qty * expectedUnit;
    const expectedCogs = qty * probe.costA;

    const sale = await withRetry(`sale-${store.id}`, () =>
      createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        items: [{ productId: probe.id, quantity: qty }],
        paymentMethod: si % 3 === 0 ? "CASH" : si % 3 === 1 ? "CARD" : "TRANSFER",
      })
    );
    created.saleIds.push(sale.id);
    oracle.revenue = round2(oracle.revenue + expectedRevenue);
    oracle.cogs = round2(oracle.cogs + expectedCogs);
    oracle.saleCount += 1;
    const pm = si % 3 === 0 ? "CASH" : si % 3 === 1 ? "CARD" : "TRANSFER";
    oracle.payment.set(pm, round2((oracle.payment.get(pm) ?? 0) + expectedRevenue));
    expectStock(probe.id, "STORE", store.id, -qty);

    const items = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
    const actualRev = items.reduce(
      (s, it) => s + Number(it.quantity) * Number(it.salePrice),
      0
    );
    const prices = [...new Set(items.map((it) => Number(it.salePrice)))];
    if (round2(actualRev) !== round2(expectedRevenue) || prices.length !== 1) {
      addDefect({
        id: `NEW-SALE-FIFO-${store.id.slice(-4)}`,
        severity: "CRITICAL",
        module: "Sale",
        scenario: "SaleItem prices from FIFO after transfer slice",
        expected: `revenue=${expectedRevenue} single price ${expectedUnit}`,
        actual: `revenue=${actualRev} prices=${prices.join(",")}`,
        reproduction: `sell ${qty} of transferred stock @ expected ${expectedUnit}`,
        evidence: `saleId=${sale.id}`,
        rootCauseHypothesis: "SaleItem not from batch salePrice",
      });
      record("sale.fifo_price", "FAIL", store.name);
    } else {
      record("sale.fifo_price", "PASS", `${store.name} rev=${actualRev}`);
    }

    // Ignore client price attack
    const attackQty = 1;
    const before = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const sale2 = await withRetry(`sale-ignore-${store.id}`, () =>
      createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        // @ts-expect-error intentional client injection if accepted by JS
        items: [{ productId: probe.id, quantity: attackQty, salePrice: 1 }],
        paymentMethod: "CASH",
      })
    );
    created.saleIds.push(sale2.id);
    const items2 = await prisma.saleItem.findMany({
      where: { saleId: sale2.id },
    });
    const gotPrice = Number(items2[0]?.salePrice);
    expectStock(probe.id, "STORE", store.id, -attackQty);
    oracle.revenue = round2(oracle.revenue + gotPrice * attackQty);
    oracle.cogs = round2(oracle.cogs + probe.costA * attackQty);
    oracle.saleCount += 1;
    oracle.payment.set(
      "CASH",
      round2((oracle.payment.get("CASH") ?? 0) + gotPrice * attackQty)
    );
    if (gotPrice === 1) {
      addDefect({
        id: "NEW-CLIENT-PRICE-TRUST",
        severity: "CRITICAL",
        module: "Sale",
        scenario: "createSale must ignore client salePrice",
        expected: `price=${probe.saleA}`,
        actual: `price=${gotPrice}`,
        reproduction: "POST items with salePrice:1",
        evidence: `saleId=${sale2.id}`,
        rootCauseHypothesis: "client price accepted",
      });
      record("sale.ignore_client_price", "FAIL", store.name);
    } else if (gotPrice === probe.saleA) {
      record("sale.ignore_client_price", "PASS", store.name);
    } else {
      record(
        "sale.ignore_client_price",
        "PARTIAL",
        `got ${gotPrice}, expected ${probe.saleA}`
      );
    }
    const after = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    if (round3(before - after) !== attackQty) {
      addDefect({
        id: "NEW-STOCK-SALE-DELTA",
        severity: "HIGH",
        module: "Stock",
        scenario: "stock delta after sale",
        expected: String(attackQty),
        actual: String(round3(before - after)),
        reproduction: `sale ${sale2.id}`,
        evidence: `${before}→${after}`,
        rootCauseHypothesis: "stock not deducted",
      });
    }
  }

  // ── 5. Edge: oversell ──────────────────────────────────────────────────
  {
    const store = stores[0];
    const seller = sellers.find((s) => s.storeId === store.id)!;
    const probe = pieceProducts[0];
    const available = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const beforeSales = await prisma.sale.count({
      where: { storeId: store.id },
    });
    let threw = false;
    try {
      await createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        items: [{ productId: probe.id, quantity: available + 50 }],
        paymentMethod: "CASH",
      });
    } catch {
      threw = true;
    }
    const afterSales = await prisma.sale.count({
      where: { storeId: store.id },
    });
    const afterQty = await getQtyAtLocation({
      productId: probe.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    if (!threw || afterSales !== beforeSales || round3(afterQty) !== round3(available)) {
      addDefect({
        id: "NEW-OVERSELL-PARTIAL",
        severity: "CRITICAL",
        module: "Sale",
        scenario: "oversell must not leave partial sale/stock",
        expected: "throw + unchanged stock/sales",
        actual: `threw=${threw} sales ${beforeSales}→${afterSales} qty ${available}→${afterQty}`,
        reproduction: `sell available+50 on ${store.id}`,
        evidence: TAG,
        rootCauseHypothesis: "non-atomic oversell",
      });
      record("edge.oversell", "FAIL", "partial state");
    } else {
      record("edge.oversell", "PASS", "rejected cleanly");
    }
  }

  // ── 6. Sale during INVENTORY (baseline H1) ─────────────────────────────
  {
    const store = stores[0];
    const seller = sellers.find((s) => s.storeId === store.id)!;
    const probe = pieceProducts[1] ?? pieceProducts[0];
    // ensure stock
    await withRetry("inv-transfer", () =>
      createTransfer({
        companyId: company.id,
        fromWarehouseId: warehouse.id,
        toStoreId: store.id,
        createdById: owner.id,
        items: [{ productId: probe.id, quantity: 10 }],
      })
    );
    expectStock(probe.id, "WAREHOUSE", warehouse.id, -10);
    expectStock(probe.id, "STORE", store.id, 10);

    // cancel any open
    await prisma.inventorySession.updateMany({
      where: { storeId: store.id, status: "IN_PROGRESS" },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    const session = await withRetry("start-rev", () =>
      createInventorySession({
        companyId: company.id,
        storeId: store.id,
        createdById: owner.id,
        comment: `${TAG}-rev`,
      })
    );
    created.sessionIds.push(session.id);
    const st = await prisma.store.findUnique({ where: { id: store.id } });
    let saleDuringOk = false;
    let saleDuringErr = "";
    try {
      const s = await createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: seller.id,
        items: [{ productId: probe.id, quantity: 1 }],
        paymentMethod: "CASH",
      });
      created.saleIds.push(s.id);
      saleDuringOk = true;
      expectStock(probe.id, "STORE", store.id, -1);
      // don't update oracle revenue for intentional defect probe? We should track actual
      const its = await prisma.saleItem.findMany({ where: { saleId: s.id } });
      const rev = its.reduce(
        (a, it) => a + Number(it.quantity) * Number(it.salePrice),
        0
      );
      oracle.revenue = round2(oracle.revenue + rev);
      oracle.saleCount += 1;
    } catch (e) {
      saleDuringErr = e instanceof Error ? e.message : String(e);
    }

    if (saleDuringOk && st?.status === "INVENTORY") {
      addDefect({
        id: "BASE-H1",
        severity: "HIGH",
        module: "Revision/Sale",
        scenario: "Sale allowed while store status=INVENTORY",
        expected: "createSale rejected",
        actual: "sale succeeded",
        reproduction: "start revision → POS sale same store",
        evidence: `store.status=${st.status} session=${session.id}`,
        rootCauseHypothesis: "sale.service ignores store.status",
        baselineRef: "H1",
      });
      record("baseline.H1_sale_during_inventory", "FAIL", "sale allowed");
    } else if (!saleDuringOk) {
      record(
        "baseline.H1_sale_during_inventory",
        "PASS",
        `blocked: ${saleDuringErr}`
      );
    } else {
      record(
        "baseline.H1_sale_during_inventory",
        "PARTIAL",
        `status=${st?.status}`
      );
    }

    // Blind check
    const detail = await getInventorySessionDetail(
      company.id,
      session.id,
      Role.OWNER
    );
    if (detail.blind !== true || detail.items.some((i) => "expectedQty" in i)) {
      addDefect({
        id: "NEW-REV-BLIND",
        severity: "HIGH",
        module: "Revision",
        scenario: "IN_PROGRESS must be blind for OWNER",
        expected: "blind=true, no expectedQty",
        actual: `blind=${detail.blind}`,
        reproduction: "getInventorySessionDetail OWNER during IN_PROGRESS",
        evidence: session.id,
        rootCauseHypothesis: "blind regression",
      });
      record("revision.blind_owner", "FAIL", "");
    } else {
      record("revision.blind_owner", "PASS", "blind for owner");
    }

    // Cancel revision to unblock store
    await prisma.inventorySession.update({
      where: { id: session.id },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
    await prisma.store.update({
      where: { id: store.id },
      data: { status: "ACTIVE" },
    });
  }

  // ── 7. Catalog price change must not rewrite old batches ───────────────
  {
    const p = pieceProducts[2] ?? pieceProducts[0];
    const before = await prisma.batch.findMany({
      where: { productId: p.id, notes: { startsWith: TAG } },
      select: { id: true, salePrice: true },
    });
    await prisma.product.update({
      where: { id: p.id },
      data: { salePrice: 9999 },
    });
    const after = await prisma.batch.findMany({
      where: { productId: p.id, notes: { startsWith: TAG } },
      select: { id: true, salePrice: true },
    });
    const changed = after.filter((a) => {
      const b = before.find((x) => x.id === a.id);
      return b && Number(b.salePrice) !== Number(a.salePrice);
    });
    if (changed.length) {
      addDefect({
        id: "NEW-BATCH-PRICE-MUTATION",
        severity: "CRITICAL",
        module: "Batch",
        scenario: "Updating Product.salePrice must not mutate existing Batch",
        expected: "0 batches changed",
        actual: `${changed.length} changed`,
        reproduction: "product.update salePrice=9999",
        evidence: TAG,
        rootCauseHypothesis: "cascade or trigger",
      });
      record("immutability.batch_salePrice", "FAIL", "");
    } else {
      record("immutability.batch_salePrice", "PASS", "batches unchanged");
    }
  }

  // ── 8. Reconcile store stocks vs oracle ────────────────────────────────
  let storeMismatch = 0;
  for (const [k, expected] of oracle.stock) {
    const [productId, locType, locId] = k.split("|");
    if (!created.productIds.includes(productId)) continue;
    const actual = await getQtyAtLocation({
      productId,
      locationType: locType as LocationType,
      locationId: locId,
    });
    if (round3(actual) !== round3(expected)) {
      storeMismatch++;
      if (storeMismatch <= 8) {
        addDefect({
          id: `NEW-ORACLE-${productId.slice(-4)}-${locType}`,
          severity: "HIGH",
          module: "Reconciliation",
          scenario: "EXPECTED stock vs DB",
          expected: String(expected),
          actual: String(actual),
          reproduction: k,
          evidence: TAG,
          rootCauseHypothesis: "missed oracle update or stock bug",
        });
      }
    }
  }
  record(
    "reconcile.oracle_vs_db_stock",
    storeMismatch === 0 ? "PASS" : "FAIL",
    `mismatches=${storeMismatch}`
  );

  // ── 9. Analytics / dashboard vs oracle (tagged sales only approx) ──────
  {
    const tA = Date.now();
    let analyticsOk = true;
    try {
      const analytics = await withRetry("analytics", () =>
        getAnalyticsBreakdown(company.id, "today", {})
      );
      // Soft check: network revenue >= our oracle revenue (other sales may exist)
      if (analytics.network.revenue + 0.01 < oracle.revenue) {
        analyticsOk = false;
        addDefect({
          id: "NEW-ANALYTICS-UNDERCOUNT",
          severity: "HIGH",
          module: "Analytics",
          scenario: "today revenue >= oracle tagged sales revenue",
          expected: `>= ${oracle.revenue}`,
          actual: String(analytics.network.revenue),
          reproduction: "getAnalyticsBreakdown today after E2E sales",
          evidence: TAG,
          rootCauseHypothesis: "analytics excludes sales or wrong period",
        });
      }
      record(
        "analytics.today_vs_oracle",
        analyticsOk ? "PASS" : "FAIL",
        `analyticsRev=${analytics.network.revenue} oracleRev=${oracle.revenue}`,
        Date.now() - tA
      );
    } catch (e) {
      record(
        "analytics.today_vs_oracle",
        "NOT_TESTED",
        e instanceof Error ? e.message : String(e)
      );
    }

    try {
      const tD = Date.now();
      const dash = await withRetry("dashboard", () =>
        getDashboardPayload(company.id)
      );
      record(
        "dashboard.load",
        "PASS",
        `todayRevenue=${(dash as { today?: { revenue?: number } })?.today?.revenue ?? "n/a"}`,
        Date.now() - tD
      );
    } catch (e) {
      record(
        "dashboard.load",
        "NOT_TESTED",
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  // ── 10. Concurrent oversell race (two sellers) ─────────────────────────
  {
    const store = stores[Math.min(1, stores.length - 1)];
    // Isolated product with EXACTLY 5 units at store (no prior transfer layers).
    const raceProduct = await withRetry("race-product", () =>
      prisma.product.create({
        data: {
          name: `${TAG} Race Piece`,
          companyId: company.id,
          accountingType: AccountingType.PIECE,
          salePrice: 50,
          defaultCostPerUnit: 20,
        },
      })
    );
    created.productIds.push(raceProduct.id);
    await withRetry("race-wh", () =>
      prisma.$transaction(async (tx) => {
        await addBatch(tx, {
          productId: raceProduct.id,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
          quantity: 5,
          costPerUnit: 20,
          salePrice: 50,
          origin: BatchOrigin.PURCHASE,
          notes: `${TAG}-RACE`,
          createdById: owner.id,
        });
      })
    );
    expectStock(raceProduct.id, "WAREHOUSE", warehouse.id, 5);
    await withRetry("race-transfer", () =>
      createTransfer({
        companyId: company.id,
        fromWarehouseId: warehouse.id,
        toStoreId: store.id,
        createdById: owner.id,
        items: [{ productId: raceProduct.id, quantity: 5 }],
      })
    );
    expectStock(raceProduct.id, "WAREHOUSE", warehouse.id, -5);
    expectStock(raceProduct.id, "STORE", store.id, 5);
    const beforeRace = await getQtyAtLocation({
      productId: raceProduct.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    const storeSellers = sellers.filter((s) => s.storeId === store.id);
    const s1 = storeSellers[0]?.id ?? owner.id;
    const s2 = storeSellers[1]?.id ?? s1;
    const results = await Promise.allSettled([
      createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: s1,
        items: [{ productId: raceProduct.id, quantity: 5 }],
        paymentMethod: "CASH",
      }),
      createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: s2,
        items: [{ productId: raceProduct.id, quantity: 5 }],
        paymentMethod: "CARD",
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected").length;
    const qty = await getQtyAtLocation({
      productId: raceProduct.id,
      locationType: LocationType.STORE,
      locationId: store.id,
    });
    for (const r of results) {
      if (r.status === "fulfilled") {
        created.saleIds.push(r.value.id);
        expectStock(raceProduct.id, "STORE", store.id, -5);
      }
    }
    // Correct: exactly one sale, qty 0; beforeRace must be 5
    if (
      round3(beforeRace) === 5 &&
      fulfilled === 1 &&
      rejected === 1 &&
      round3(qty) === 0
    ) {
      record("concurrent.last_unit_race", "PASS", "one winner, stock 0");
    } else if (fulfilled === 2 || qty < 0) {
      addDefect({
        id: "NEW-RACE-OVERSELL",
        severity: "CRITICAL",
        module: "Sale/Concurrency",
        scenario: "two cashiers buy last 5 units concurrently",
        expected: "1 success, 1 fail, stock=0",
        actual: `before=${beforeRace} fulfilled=${fulfilled} rejected=${rejected} stock=${qty}`,
        reproduction: "isolated product stock=5; Promise.all two createSale qty=5",
        evidence: TAG,
        rootCauseHypothesis: "missing row lock / non-serializable",
      });
      record("concurrent.last_unit_race", "FAIL", `stock=${qty}`);
    } else {
      record(
        "concurrent.last_unit_race",
        "PARTIAL",
        `before=${beforeRace} fulfilled=${fulfilled} rejected=${rejected} stock=${qty}`
      );
    }
  }

  // ── 11. Invalid inputs ─────────────────────────────────────────────────
  {
    const store = stores[0];
    const seller = sellers.find((s) => s.storeId === store.id)!;
    const cases: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: "qty_zero",
        run: () =>
          createSale({
            companyId: company.id,
            storeId: store.id,
            sellerId: seller.id,
            items: [{ productId: pieceProducts[0].id, quantity: 0 }],
          }),
      },
      {
        name: "qty_negative",
        run: () =>
          createSale({
            companyId: company.id,
            storeId: store.id,
            sellerId: seller.id,
            items: [{ productId: pieceProducts[0].id, quantity: -1 }],
          }),
      },
      {
        name: "bad_product",
        run: () =>
          createSale({
            companyId: company.id,
            storeId: store.id,
            sellerId: seller.id,
            items: [{ productId: "does-not-exist", quantity: 1 }],
          }),
      },
      {
        name: "seller_wrong_store",
        run: () =>
          createSale({
            companyId: company.id,
            storeId: stores[1]?.id ?? store.id,
            sellerId: seller.id,
            items: [{ productId: pieceProducts[0].id, quantity: 1 }],
          }),
      },
    ];
    for (const c of cases) {
      let threw = false;
      try {
        await c.run();
      } catch {
        threw = true;
      }
      record(
        `validation.${c.name}`,
        threw ? "PASS" : "FAIL",
        threw ? "rejected" : "accepted incorrectly"
      );
      if (!threw) {
        addDefect({
          id: `NEW-VAL-${c.name}`,
          severity: "HIGH",
          module: "Sale/Validation",
          scenario: c.name,
          expected: "reject",
          actual: "accepted",
          reproduction: c.name,
          evidence: TAG,
          rootCauseHypothesis: "missing validation",
        });
      }
    }
  }

  // ── Cleanup tagged data (keep defects evidence in report) ──────────────
  console.log("\nCleaning tagged E2E2 data...");
  try {
    await prisma.saleItem.deleteMany({
      where: { productId: { in: created.productIds } },
    });
    await prisma.sale.deleteMany({
      where: { id: { in: created.saleIds } },
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
      where: {
        id: { in: created.userIds },
        email: { contains: "@e2e.local" },
      },
    });
    await prisma.store.deleteMany({
      where: { id: { in: created.storeIds } },
    });
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

  const report = {
    stage: "E2E_STAGE2_SIMULATION",
    tag: TAG,
    scale: SCALE,
    finishedAt: new Date().toISOString(),
    coverage: { pass, fail, partial, notTested, total: checks.length },
    oracle: {
      revenue: oracle.revenue,
      cogs: oracle.cogs,
      saleCount: oracle.saleCount,
      payments: Object.fromEntries(oracle.payment),
    },
    checks,
    defects,
    notes: [
      "HTTP/UI RBAC and browser flows are separate follow-up in same Stage-2 run.",
      "No bug fixes applied.",
      "Baseline defects re-verified where scenario exists (H1).",
    ],
  };

  mkdirSync("tmp", { recursive: true });
  const out = `tmp/e2e-stage2-report-${TAG}.json`;
  writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n=== SUMMARY pass=${pass} fail=${fail} partial=${partial} notTested=${notTested} defects=${defects.length}`);
  console.log(`Report: ${out}`);
  if (fail > 0 || defects.some((d) => d.severity === "CRITICAL")) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
