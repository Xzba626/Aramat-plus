/**
 * Owner direct sales — full local forensic suite (harizma scenario + regressions).
 *
 * Prerequisites:
 *   1. Local PostgreSQL (NOT production)
 *   2. .env with DATABASE_URL → aramatplus_forensic (see .env.forensic.example)
 *   3. npx prisma migrate deploy && npx tsx prisma/seed.ts
 *
 * Run:
 *   npm run test:owner-sales-forensic
 *
 * Does NOT modify production. Creates tagged test data and cleans up.
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  LocationType,
  ReturnReasonCode,
} from "@prisma/client";
import { assertForensicDatabaseSafe } from "./forensic-env-guard";
import { createSale } from "../src/lib/services/sale.service";
import { addBatch } from "../src/lib/services/stock.service";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import {
  productCreateFingerprint,
  findRecentProductCreateByFingerprint,
} from "../src/lib/services/product-create.service";
import { saleGrossMetrics } from "../src/lib/services/profit.service";
import { getStoreSalesHistory } from "../src/lib/services/stores-detail.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();
const TAG = `forensic-${Date.now()}`;

type Snap = Record<string, unknown>;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

async function forensicSnapshot(params: {
  label: string;
  productIds?: string[];
  saleIds?: string[];
}) {
  const out: Snap = { label: params.label };
  if (params.productIds?.length) {
    out.products = await Promise.all(
      params.productIds.map(async (id) => {
        const p = await prisma.product.findUnique({
          where: { id },
          select: { id: true, name: true, sku: true, createdAt: true },
        });
        const batches = await prisma.batch.findMany({
          where: { productId: id },
          select: {
            id: true,
            quantity: true,
            initialQuantity: true,
            costPerUnit: true,
            receivedAt: true,
            notes: true,
          },
          orderBy: { receivedAt: "asc" },
        });
        const wh = await prisma.warehouse.findFirst({
          where: { isActive: true },
        });
        const bal = wh
          ? await prisma.stockBalance.findUnique({
              where: {
                productId_locationType_locationId: {
                  productId: id,
                  locationType: LocationType.WAREHOUSE,
                  locationId: wh.id,
                },
              },
            })
          : null;
        return {
          ...p,
          stockBalance: bal ? decimalToNumber(bal.quantity) : 0,
          batches: batches.map((b) => ({
            id: b.id.slice(-8),
            qty: decimalToNumber(b.quantity),
            initial: decimalToNumber(b.initialQuantity),
            cost: decimalToNumber(b.costPerUnit),
            at: b.receivedAt.toISOString(),
          })),
        };
      })
    );
  }
  if (params.saleIds?.length) {
    out.sales = await Promise.all(
      params.saleIds.map(async (id) => {
        const s = await prisma.sale.findUnique({
          where: { id },
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true } },
              },
            },
          },
        });
        if (!s) return { id, missing: true };
        const metrics = saleGrossMetrics([s]);
        return {
          id: s.id.slice(-8),
          createdAt: s.createdAt.toISOString(),
          subtotal: decimalToNumber(s.subtotal),
          discount: decimalToNumber(s.discountAmount),
          total: decimalToNumber(s.total),
          items: s.items.map((it) => ({
            productId: it.productId.slice(-8),
            sku: it.product.sku,
            qty: decimalToNumber(it.quantity),
            salePrice: decimalToNumber(it.salePrice),
            costPerUnit: decimalToNumber(it.costPerUnit),
            lineCogs: money(
              decimalToNumber(it.costPerUnit) * decimalToNumber(it.quantity)
            ),
          })),
          revenue: metrics.revenue,
          cogs: metrics.cogs,
          grossProfit: metrics.grossProfit,
        };
      })
    );
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function setupContext() {
  const company = await prisma.company.findFirst();
  assert(company, "seed company — run: npx tsx prisma/seed.ts");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "seed owner");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "seed warehouse");
  const ownerStore = await ensureOwnerDirectStore(company.id);
  return { company, owner, warehouse, ownerStore };
}

async function createProduct(params: {
  companyId: string;
  name: string;
  sku: string;
  salePrice?: number;
  cost?: number;
  initialQty?: number;
  ownerId: string;
  warehouseId: string;
}) {
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: params.name,
        sku: params.sku,
        companyId: params.companyId,
        accountingType: AccountingType.PIECE,
        salePrice: params.salePrice ?? 350,
        defaultCostPerUnit: params.cost ?? 260,
        minStock: 0,
      },
    });
    if (params.initialQty && params.initialQty > 0) {
      await addBatch(tx, {
        productId: created.id,
        locationType: LocationType.WAREHOUSE,
        locationId: params.warehouseId,
        quantity: params.initialQty,
        costPerUnit: params.cost ?? 260,
        salePrice: params.salePrice ?? 350,
        notes: `${TAG}:initial`,
        createdById: params.ownerId,
      });
    }
    return created;
  });
  return product;
}

async function trySale(params: {
  companyId: string;
  storeId: string;
  sellerId: string;
  productId: string;
  qty?: number;
  discount?: number;
}) {
  try {
    const sale = await createSale({
      companyId: params.companyId,
      storeId: params.storeId,
      sellerId: params.sellerId,
      items: [{ productId: params.productId, quantity: params.qty ?? 1 }],
      discountAmount: params.discount,
      paymentMethod: "CASH",
    });
    return { ok: true as const, sale, error: null };
  } catch (e) {
    return {
      ok: false as const,
      sale: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function receiveBatch(params: {
  productId: string;
  warehouseId: string;
  qty: number;
  cost: number;
  salePrice: number;
  ownerId: string;
}) {
  return prisma.$transaction(async (tx) =>
    addBatch(tx, {
      productId: params.productId,
      locationType: LocationType.WAREHOUSE,
      locationId: params.warehouseId,
      quantity: params.qty,
      costPerUnit: params.cost,
      salePrice: params.salePrice,
      notes: `${TAG}:receive`,
      createdById: params.ownerId,
    })
  );
}

// ─── Scenarios ─────────────────────────────────────────────────────────────

async function scenarioA_normal(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario A: normal (create → receive → sell) ──");
  const p = await createProduct({
    companyId: ctx.company.id,
    name: `харизма A ${TAG}`,
    sku: `HZ-A-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  await receiveBatch({
    productId: p.id,
    warehouseId: ctx.warehouse.id,
    qty: 1,
    cost: 260,
    salePrice: 350,
    ownerId: ctx.owner.id,
  });
  await forensicSnapshot({ label: "A after receive", productIds: [p.id] });

  const r = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(r.ok, `A sale should succeed: ${r.error}`);
  await forensicSnapshot({
    label: "A after sale",
    productIds: [p.id],
    saleIds: [r.sale!.id],
  });
  assert(money(r.sale!.finalAmount ?? 0) === 350, "A revenue 350");
  console.log("✓ Scenario A PASS");
  return { productId: p.id, saleId: r.sale!.id };
}

async function scenarioB_doubleCreate(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario B: double product create (idempotency) ──");
  const fp = productCreateFingerprint({
    userId: ctx.owner.id,
    name: `харизма dup ${TAG}`,
    brandId: null,
    categoryId: null,
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    idempotencyKey: `idem-${TAG}`,
  });

  const p1 = await createProduct({
    companyId: ctx.company.id,
    name: `харизма dup ${TAG}`,
    sku: `HZ-D1-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  await prisma.activityLog.create({
    data: {
      userId: ctx.owner.id,
      companyId: ctx.company.id,
      action: "PRODUCT_CREATE",
      entityType: "Product",
      entityId: p1.id,
      comment: p1.name,
      metadata: { createFingerprint: fp, sku: p1.sku },
    },
  });

  const dedup = await findRecentProductCreateByFingerprint({
    companyId: ctx.company.id,
    userId: ctx.owner.id,
    fingerprint: fp,
  });
  assert(dedup?.id === p1.id, "B dedup should find first product");

  const p2 = await createProduct({
    companyId: ctx.company.id,
    name: `харизма dup ${TAG}`,
    sku: `HZ-D2-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  assert(p1.id !== p2.id, "B without API dedup: second create still makes new Product ID");
  console.log(`  Product A: ${p1.id.slice(-8)}  Product B: ${p2.id.slice(-8)} (same name)`);
  console.log("✓ Scenario B PASS (proves duplicate-name / duplicate-ID risk)");
  return { p1: p1.id, p2: p2.id };
}

async function scenarioC_twoProducts(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario C: receive on A only, sell A and try B ──");
  const { p1, p2 } = await scenarioB_doubleCreate(ctx);
  await receiveBatch({
    productId: p1,
    warehouseId: ctx.warehouse.id,
    qty: 1,
    cost: 260,
    salePrice: 350,
    ownerId: ctx.owner.id,
  });

  const sellA = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p1,
  });
  assert(sellA.ok, `C sell A: ${sellA.error}`);

  const sellB = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p2,
  });
  assert(!sellB.ok, "C sell B must fail (no batch/stock)");
  assert(
    sellB.error === "INSUFFICIENT_AVAILABLE" ||
      sellB.error === "INSUFFICIENT_BATCH_STOCK",
    `C expected stock error, got ${sellB.error}`
  );

  await forensicSnapshot({
    label: "C final",
    productIds: [p1, p2],
    saleIds: sellA.sale ? [sellA.sale.id] : [],
  });
  console.log("✓ Scenario C PASS — explains harizma if sale hit wrong Product ID");
}

async function scenarioD_saleBeforeReceipt(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario D: sale before receipt (zero stock) ──");
  const p = await createProduct({
    companyId: ctx.company.id,
    name: `харизма D ${TAG}`,
    sku: `HZ-D-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  const r = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(!r.ok, "D must block sale without batch");
  const saleCount = await prisma.sale.count({
    where: { items: { some: { productId: p.id } } },
  });
  assert(saleCount === 0, "D must not create Sale row");
  console.log(`✓ Scenario D PASS — blocked: ${r.error}`);
}

async function scenarioE_initialQty(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario E: initialQuantity on create ──");
  const p = await createProduct({
    companyId: ctx.company.id,
    name: `харизма E ${TAG}`,
    sku: `HZ-E-${TAG}`,
    initialQty: 2,
    cost: 260,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  await forensicSnapshot({ label: "E after create+initial", productIds: [p.id] });
  const batchN = await prisma.batch.count({ where: { productId: p.id } });
  assert(batchN >= 1, "E batch created");
  const r = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(r.ok, `E sale: ${r.error}`);
  const m = saleGrossMetrics([
    await prisma.sale.findUniqueOrThrow({
      where: { id: r.sale!.id },
      include: { items: true },
    }),
  ]);
  assert(m.cogs === 260, `E COGS 260 got ${m.cogs}`);
  assert(m.grossProfit === 90, `E gross 90 got ${m.grossProfit}`);
  console.log("✓ Scenario E PASS");
}

/** Replays harizma timeline: create×2 → sale → receive → sale×2 */
async function scenarioF_harizmaTimeline(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario F: harizma timeline replay ──");

  const productA = await createProduct({
    companyId: ctx.company.id,
    name: "харизма",
    sku: `HZ-TA-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  const productB = await createProduct({
    companyId: ctx.company.id,
    name: "харизма",
    sku: `HZ-TB-${TAG}`,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  console.log(`  Product A ${productA.id}  Product B ${productB.id}`);

  const saleIds: string[] = [];

  // Step 1: sale before receipt (which product?)
  for (const [label, pid] of [
    ["A", productA.id],
    ["B", productB.id],
  ] as const) {
    const r = await trySale({
      companyId: ctx.company.id,
      storeId: ctx.ownerStore.id,
      sellerId: ctx.owner.id,
      productId: pid,
    });
    console.log(`  Pre-receipt sale on ${label}: ${r.ok ? "OK" : r.error}`);
    if (r.ok && r.sale) saleIds.push(r.sale.id);
  }

  // Receive only on A (matches journal: one receipt)
  await receiveBatch({
    productId: productA.id,
    warehouseId: ctx.warehouse.id,
    qty: 1,
    cost: 260,
    salePrice: 350,
    ownerId: ctx.owner.id,
  });
  await forensicSnapshot({
    label: "F after receipt on A only",
    productIds: [productA.id, productB.id],
    saleIds,
  });

  // Two more sales on A (has stock)
  for (let i = 0; i < 2; i++) {
    await receiveBatch({
      productId: productA.id,
      warehouseId: ctx.warehouse.id,
      qty: 1,
      cost: 260,
      salePrice: 350,
      ownerId: ctx.owner.id,
    });
    const r = await trySale({
      companyId: ctx.company.id,
      storeId: ctx.ownerStore.id,
      sellerId: ctx.owner.id,
      productId: productA.id,
    });
    assert(r.ok, `F sale ${i + 2}: ${r.error}`);
    saleIds.push(r.sale!.id);
  }

  await forensicSnapshot({
    label: "F final state",
    productIds: [productA.id, productB.id],
    saleIds,
  });

  const history = await getStoreSalesHistory(ctx.company.id, ctx.ownerStore.id, 1, 50);
  const harizmaSales = history.items.filter((s) =>
    s.items.some((it) => it.productName === "харизма")
  );
  console.log(`  Store history rows for «харизма»: ${harizmaSales.length}`);
  for (const h of harizmaSales) {
    for (const it of h.items) {
      console.log(
        `    sale ${h.id.slice(-8)} product ${it.productId?.slice(-8) ?? "?"} sku ${it.sku} gross ${it.grossProfit}`
      );
    }
  }
  console.log("✓ Scenario F PASS — inspect snapshots for Product ID ↔ Sale mapping");
}

async function scenarioG_duplicatePost(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario G: duplicate sale POST (sequential) ──");
  const p = await createProduct({
    companyId: ctx.company.id,
    name: `харизма G ${TAG}`,
    sku: `HZ-G-${TAG}`,
    initialQty: 1,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  const r1 = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(r1.ok, "G first sale");
  const r2 = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(!r2.ok, "G second sale must fail (no stock)");
  console.log(`✓ Scenario G PASS — 2nd blocked: ${r2.error}`);
}

async function scenarioH_return(ctx: Awaited<ReturnType<typeof setupContext>>) {
  console.log("\n── Scenario H: owner direct sale + return → warehouse ──");
  const p = await createProduct({
    companyId: ctx.company.id,
    name: `харизма H ${TAG}`,
    sku: `HZ-H-${TAG}`,
    initialQty: 1,
    ownerId: ctx.owner.id,
    warehouseId: ctx.warehouse.id,
  });
  const r = await trySale({
    companyId: ctx.company.id,
    storeId: ctx.ownerStore.id,
    sellerId: ctx.owner.id,
    productId: p.id,
  });
  assert(r.ok, "H sale");
  const sale = await prisma.sale.findUniqueOrThrow({
    where: { id: r.sale!.id },
    include: { items: true },
  });
  const item = sale.items[0];

  const ret = await createSaleReturn({
    companyId: ctx.company.id,
    saleId: sale.id,
    requesterId: ctx.owner.id,
    reasonCode: ReturnReasonCode.OTHER,
    items: [{ saleItemId: item.id, quantity: 1 }],
  });
  assert(ret.status === "PENDING", "H return starts PENDING");

  await decideSaleReturn({
    companyId: ctx.company.id,
    returnId: ret.id,
    reviewerId: ctx.owner.id,
    decision: "APPROVE",
  });

  const bal = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: p.id,
        locationType: LocationType.WAREHOUSE,
        locationId: ctx.warehouse.id,
      },
    },
  });
  assert(decimalToNumber(bal?.quantity ?? 0) >= 1, "H stock restored to warehouse");
  console.log("✓ Scenario H PASS — return restores WAREHOUSE stock (same as branch logic)");
}

async function cleanup() {
  const products = await prisma.product.findMany({
    where: { sku: { contains: TAG } },
    select: { id: true },
  });
  const ids = products.map((p) => p.id);
  if (!ids.length) return;

  await prisma.saleReturnItem.deleteMany({
    where: { return: { sale: { items: { some: { productId: { in: ids } } } } } },
  });
  await prisma.saleReturn.deleteMany({
    where: { sale: { items: { some: { productId: { in: ids } } } } },
  });
  await prisma.saleItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.sale.deleteMany({
    where: { items: { every: { productId: { in: ids } } } },
  });
  await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
  await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
  await prisma.activityLog.deleteMany({
    where: { entityId: { in: ids } },
  });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  assertForensicDatabaseSafe();
  console.log("=== Owner sales forensic suite ===");
  console.log(`Tag: ${TAG}`);
  console.log(`DATABASE: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}\n`);

  const ctx = await setupContext();

  try {
    await scenarioA_normal(ctx);
    await scenarioC_twoProducts(ctx);
    await scenarioD_saleBeforeReceipt(ctx);
    await scenarioE_initialQty(ctx);
    await scenarioF_harizmaTimeline(ctx);
    await scenarioG_duplicatePost(ctx);
    await scenarioH_return(ctx);
    console.log("\n=== ALL OWNER SALES FORENSIC SCENARIOS PASSED ===\n");
    console.log("Next: compare Scenario F snapshots with production SQL (read-only).");
  } finally {
    await cleanup();
    console.log("Cleanup: removed tagged forensic products");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
