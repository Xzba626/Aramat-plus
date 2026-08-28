/**
 * Extended forensic scenarios — stock/batch mismatch, concurrency,
 * rejected returns, expenses, independent financial cross-check.
 *
 * Each scenario: full DB reset before run.
 * Run: npm run test:forensic-extended
 */
import { loadProjectEnv } from "./lib/load-env";
loadProjectEnv();

import {
  AccountingType,
  LocationType,
  PrismaClient,
} from "@prisma/client";
import { resetLocalDatabase } from "./lib/reset";
import {
  loadLabContext,
  createProductFlow,
  receiveBatchFlow,
  saleFlow,
  returnAndApproveFlow,
  returnAndRejectFlow,
  expenseFlow,
  disconnectFlows,
  type LabContext,
} from "./lib/app-flows";
import {
  takeForensicSnapshot,
  disconnectSnapshot,
} from "./lib/snapshot";
import {
  computeRawFinancials,
  findPhantomCogsSales,
  disconnectIndependentCalc,
} from "./lib/independent-calculator";
import {
  runDbIntegrityChecks,
  injectStockBatchDesync,
  disconnectIntegrity,
} from "./lib/integrity-checks";
import {
  saleGrossMetricsNetOfReturnsSync,
  loadApprovedReturnLines,
} from "../../src/lib/services/profit.service";
import { getStoreSalesHistory } from "../../src/lib/services/stores-detail.service";
import { getAnalyticsBreakdown } from "../../src/lib/services/analytics.service";
import { decimalToNumber } from "../../src/lib/utils";

type Result = { name: string; passed: boolean; detail?: string };

const results: Result[] = [];

function record(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function crossCheckFinancials(
  ctx: LabContext,
  storeId: string,
  label: string
): Promise<boolean> {
  const raw = await computeRawFinancials({
    companyId: ctx.companyId,
    storeId,
  });

  const sales = await prisma.sale.findMany({
    where: {
      storeId,
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
    },
    include: { items: true },
  });
  const retLines = await loadApprovedReturnLines(sales.map((s) => s.id));
  const app = saleGrossMetricsNetOfReturnsSync(sales, retLines);

  const analytics = await getAnalyticsBreakdown(ctx.companyId, "year", {
    storeId,
  });

  const history = await getStoreSalesHistory(ctx.companyId, storeId, 1, 500);
  const histRev = history.items.reduce((s, r) => s + r.total, 0);

  const errors: string[] = [];
  if (Math.abs(raw.revenue - app.revenue) > 0.05) {
    errors.push(`raw vs app revenue ${raw.revenue} vs ${app.revenue}`);
  }
  if (Math.abs(raw.cogs - app.cogs) > 0.05) {
    errors.push(`raw vs app cogs ${raw.cogs} vs ${app.cogs}`);
  }
  if (Math.abs(analytics.network.revenue - app.revenue) > 0.05 && sales.length > 0) {
    errors.push(
      `analytics vs app revenue ${analytics.network.revenue} vs ${app.revenue}`
    );
  }
  if (Math.abs(histRev - app.revenue) > 0.05 && sales.length > 0) {
    errors.push(`history vs app revenue ${histRev} vs ${app.revenue}`);
  }

  console.log(`  [cross-check ${label}] raw rev=${raw.revenue} cogs=${raw.cogs}`);
  console.log(`  app rev=${app.revenue} cogs=${app.cogs} analytics rev=${analytics.network.revenue}`);
  if (errors.length) console.log(`  MISMATCH: ${errors.join("; ")}`);
  return errors.length === 0;
}

const prisma = new PrismaClient();

async function scenarioStockHighBatchZero() {
  resetLocalDatabase("stock-high-batch-zero");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "DESYNC-STOCK-HIGH",
    sku: "FORENSIC-DESYNC-1",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
  });
  await injectStockBatchDesync({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: ctx.warehouseId,
    fakeStockQty: 10,
  });
  let rejected = false;
  try {
    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: product.id,
      quantity: 1,
      accountingType: AccountingType.PIECE,
    });
  } catch (e) {
    rejected = e instanceof Error && /INSUFFICIENT|BATCH|STOCK/i.test(e.message);
  }
  const sales = await prisma.sale.count({
    where: { store: { companyId: ctx.companyId } },
  });
  record(
    "StockBalance>0 Batch=0 sale blocked",
    rejected && sales === 0,
    rejected ? "rejected" : `sales=${sales}`
  );
}

async function scenarioBatchHighStockZero() {
  resetLocalDatabase("batch-high-stock-zero");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "DESYNC-BATCH-HIGH",
    sku: "FORENSIC-DESYNC-2",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 5,
    costPerUnit: 40,
    salePrice: 100,
  });
  await prisma.stockBalance.updateMany({
    where: {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: ctx.warehouseId,
    },
    data: { quantity: 0 },
  });
  let rejected = false;
  try {
    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: product.id,
      quantity: 1,
      accountingType: AccountingType.PIECE,
    });
  } catch (e) {
    rejected = e instanceof Error && /INSUFFICIENT|BATCH|STOCK/i.test(e.message);
  }
  const sales = await prisma.sale.count({
    where: { store: { companyId: ctx.companyId } },
  });
  record(
    "Batch>0 StockBalance=0 sale blocked",
    rejected && sales === 0,
    rejected ? "rejected" : `sales=${sales}`
  );
}

async function scenarioConcurrencyOneUnit() {
  resetLocalDatabase("concurrency-1pc");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "CONCUR-1",
    sku: "FORENSIC-CONCUR",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 1,
  });
  const p = {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  };
  const [a, b] = await Promise.allSettled([saleFlow(ctx, p), saleFlow(ctx, p)]);
  const ok = [a, b].filter((r) => r.status === "fulfilled").length;
  const sales = await prisma.sale.count({
    where: { store: { companyId: ctx.companyId } },
  });
  record(
    "Concurrent sale 1 unit",
    ok === 1 && sales === 1,
    `successful=${ok} sales=${sales}`
  );
}

async function scenarioRejectedReturn() {
  resetLocalDatabase("rejected-return");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "REJ-RET",
    sku: "FORENSIC-REJ-RET",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 2,
  });
  const sale = await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const item = sale.items[0]!;
  const before = await computeRawFinancials({
    companyId: ctx.companyId,
    storeId: ctx.ownerDirectStoreId,
  });
  await returnAndRejectFlow(ctx, {
    saleId: sale.id,
    saleItemId: item.id,
    quantity: 1,
  });
  const after = await computeRawFinancials({
    companyId: ctx.companyId,
    storeId: ctx.ownerDirectStoreId,
  });
  record(
    "Rejected return no financial change",
    before.revenue === after.revenue && before.cogs === after.cogs,
    `rev ${before.revenue}→${after.revenue} cogs ${before.cogs}→${after.cogs}`
  );
}

async function scenarioDoubleReturnBlocked() {
  resetLocalDatabase("double-return");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "DBL-RET",
    sku: "FORENSIC-DBL-RET",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 1,
  });
  const sale = await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const item = sale.items[0]!;
  await returnAndApproveFlow(ctx, {
    saleId: sale.id,
    saleItemId: item.id,
    quantity: 1,
  });
  let blocked = false;
  try {
    await returnAndApproveFlow(ctx, {
      saleId: sale.id,
      saleItemId: item.id,
      quantity: 1,
    });
  } catch {
    blocked = true;
  }
  record("Second full return blocked", blocked, blocked ? "rejected" : "allowed incorrectly");
}

async function scenarioFifo150() {
  resetLocalDatabase("fifo-150");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FIFO-150",
    sku: "FORENSIC-FIFO150",
    accountingType: AccountingType.PIECE,
    salePrice: 10,
    defaultCostPerUnit: 3,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 100,
    costPerUnit: 3,
    salePrice: 10,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 100,
    costPerUnit: 4,
    salePrice: 10,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 150,
    accountingType: AccountingType.PIECE,
  });
  const raw = await computeRawFinancials({
    companyId: ctx.companyId,
    storeId: ctx.ownerDirectStoreId,
  });
  record(
    "FIFO 150 pcs COGS=500",
    Math.abs(raw.cogs - 500) < 0.05,
    `cogs=${raw.cogs}`
  );
}

async function scenarioOwnerExpenseNetProfit() {
  resetLocalDatabase("owner-expense");
  const ctx = await loadLabContext();
  const expenseType = await prisma.expenseType.findFirstOrThrow({
    where: { companyId: ctx.companyId },
  });
  const { product } = await createProductFlow(ctx, {
    name: "EXP-SALE",
    sku: "FORENSIC-EXP",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 2,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  await expenseFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    expenseTypeId: expenseType.id,
    amount: 50,
  });
  const raw = await computeRawFinancials({
    companyId: ctx.companyId,
    storeId: ctx.ownerDirectStoreId,
  });
  const expectedNet = raw.grossProfit - raw.expenseTotal;
  record(
    "Owner expense net profit",
    Math.abs(raw.netProfit - expectedNet) < 0.05 && raw.expenseTotal === 50,
    `gross=${raw.grossProfit} exp=${raw.expenseTotal} net=${raw.netProfit}`
  );
}

async function scenarioFullChainCrossCheck() {
  resetLocalDatabase("full-chain-xcheck");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "XCHECK",
    sku: "FORENSIC-XCHECK",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 3,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 100,
    costPerUnit: 3,
    salePrice: 13.4,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
    discountAmount: 0,
  });
  await takeForensicSnapshot({
    companyId: ctx.companyId,
    label: "xcheck-after-sale",
    ownerDirectStoreId: ctx.ownerDirectStoreId,
    expected: { revenue: 536, cogs: 120, grossProfit: 416 },
  });
  const ok = await crossCheckFinancials(
    ctx,
    ctx.ownerDirectStoreId,
    "owner-direct"
  );
  const phantoms = await findPhantomCogsSales(ctx.companyId);
  record(
    "DB→app→analytics→history cross-check",
    ok && phantoms.length === 0,
    phantoms.length ? `phantom sales=${phantoms.length}` : "all layers match"
  );
}

async function scenarioDbIntegrityBaseline() {
  resetLocalDatabase("db-integrity");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "INTEGRITY",
    sku: "FORENSIC-INT",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
    initialQuantity: 3,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const checks = await runDbIntegrityChecks(ctx.companyId);
  const failed = checks.filter((c) => !c.passed);
  record(
    "DB integrity after sale",
    failed.length === 0,
    failed.map((f) => f.check).join(", ") || "all pass"
  );
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   FORENSIC EXTENDED AUDIT                ║");
  console.log("║   Reset DB per scenario                  ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const scenarios = [
    scenarioStockHighBatchZero,
    scenarioBatchHighStockZero,
    scenarioConcurrencyOneUnit,
    scenarioRejectedReturn,
    scenarioDoubleReturnBlocked,
    scenarioFifo150,
    scenarioOwnerExpenseNetProfit,
    scenarioFullChainCrossCheck,
    scenarioDbIntegrityBaseline,
  ];

  for (const fn of scenarios) {
    try {
      await prisma.$disconnect().catch(() => {});
      await disconnectFlows().catch(() => {});
      await disconnectSnapshot().catch(() => {});
      await disconnectIndependentCalc().catch(() => {});
      await disconnectIntegrity().catch(() => {});
      await fn();
    } catch (e) {
      record(fn.name, false, e instanceof Error ? e.message : String(e));
    }
  }

  console.log("\n========== EXTENDED AUDIT REPORT ==========\n");
  console.table(
    results.map((r) => ({
      Scenario: r.name,
      Passed: r.passed ? "YES" : "NO",
      Detail: r.detail ?? "",
    }))
  );

  await prisma.$disconnect();
  await disconnectFlows();
  await disconnectSnapshot();
  await disconnectIndependentCalc();
  await disconnectIntegrity();

  const failed = results.filter((r) => !r.passed);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
