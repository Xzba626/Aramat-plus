/**
 * Forensic E2E Reproduction Lab
 *
 * - Resets local DB before EACH scenario
 * - Uses application service flows (same as API routes)
 * - Forensic snapshot after each economic operation
 * - Stops on first COGS corruption in production-8 scenario
 *
 * Run: npm run test:forensic-lab
 */
import { loadProjectEnv } from "./lib/load-env";
loadProjectEnv();

import { AccountingType } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { resetLocalDatabase } from "./lib/reset";
import {
  takeForensicSnapshot,
  disconnectSnapshot,
  type ForensicSnapshot,
} from "./lib/snapshot";
import {
  loadLabContext,
  createProductFlow,
  receiveBatchFlow,
  saleFlow,
  transferToStoreFlow,
  returnAndApproveFlow,
  countSales,
  disconnectFlows,
  type LabContext,
} from "./lib/app-flows";
import { decimalToNumber } from "../../src/lib/utils";

type ScenarioResult = {
  name: string;
  passed: boolean;
  firstCorruption?: string;
  expected?: string;
  actual?: string;
  rootCause?: string;
  notes?: string;
};

const results: ScenarioResult[] = [];
let stopLab = false;

function record(r: ScenarioResult) {
  results.push(r);
  const icon = r.passed ? "PASS" : "FAIL";
  console.log(`\n[${icon}] ${r.name}${r.notes ? ` — ${r.notes}` : ""}`);
  if (!r.passed && r.firstCorruption) {
    console.log(`  corruption: ${r.firstCorruption}`);
    stopLab = true;
  }
}

async function snap(
  ctx: LabContext,
  label: string,
  expected?: { revenue?: number; cogs?: number; grossProfit?: number },
  opts?: { recordFailure?: boolean }
): Promise<ForensicSnapshot> {
  const s = await takeForensicSnapshot({
    companyId: ctx.companyId,
    label,
    ownerDirectStoreId: ctx.ownerDirectStoreId,
    expected,
  });
  const shouldRecord = opts?.recordFailure !== false;
  if (shouldRecord && !s.invariantOk && expected) {
    record({
      name: label,
      passed: false,
      firstCorruption: s.invariantErrors.join("; "),
      expected: JSON.stringify(expected),
      actual: `rev=${s.financials.revenue} cogs=${s.financials.cogs}`,
    });
  }
  return s;
}

async function scenarioZeroStock() {
  resetLocalDatabase("zero-stock");
  const ctx = await loadLabContext();
  const before = await countSales(ctx.companyId);
  const { product } = await createProductFlow(ctx, {
    name: "ZERO-STOCK",
    sku: "FORENSIC-ZERO",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 0,
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
  } catch {
    rejected = true;
  }
  const after = await countSales(ctx.companyId);
  await snap(ctx, "zero-stock-after");
  record({
    name: "Zero stock sale",
    passed: rejected && after === before,
    notes: rejected ? "rejected" : "sale created incorrectly",
  });
}

async function scenarioPreReceipt() {
  resetLocalDatabase("pre-receipt");
  const ctx = await loadLabContext();
  const before = await countSales(ctx.companyId);
  const { product } = await createProductFlow(ctx, {
    name: "PRE-RECEIPT",
    sku: "FORENSIC-PRE",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
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
  } catch {
    rejected = true;
  }
  const after = await countSales(ctx.companyId);
  record({
    name: "Pre-receipt sale",
    passed: rejected && after === before,
  });
}

async function scenarioOwnerDirectMl() {
  resetLocalDatabase("owner-ml");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FORENSIC-ML-A",
    sku: "FORENSIC-ML-A",
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
  await snap(ctx, "after-receive", { cogs: 0, revenue: 0 });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
  });
  const s = await snap(ctx, "after-40ml-sale", {
    revenue: 536,
    cogs: 120,
    grossProfit: 416,
  });
  record({
    name: "OWNER_DIRECT ml sale",
    passed: s.invariantOk,
  });
}

async function scenarioOwnerPiece() {
  resetLocalDatabase("owner-pcs");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FORENSIC-PCS-A",
    sku: "FORENSIC-PCS-A",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
    initialQuantity: 5,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const s = await snap(ctx, "owner-pcs-1", {
    revenue: 350,
    cogs: 260,
    grossProfit: 90,
  });
  const saleCount = s.counts.sales;
  const itemRows = s.sales[0]?.itemRows ?? 0;
  record({
    name: "Owner sale (piece)",
    passed:
      s.invariantOk && saleCount === 1 && itemRows === 1,
    notes: `sales=${saleCount} items=${itemRows}`,
  });
}

async function scenarioDiscountValid() {
  resetLocalDatabase("discount-valid");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FORENSIC-DISC",
    sku: "FORENSIC-DISC",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 4,
    initialQuantity: 100,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
    discountAmount: 336,
  });
  const s = await snap(ctx, "discount-sale", {
    revenue: 200,
    cogs: 160,
    grossProfit: 40,
  });
  record({
    name: "Discount (owner)",
    passed: s.invariantOk,
  });
}

async function scenarioInvalidDiscount() {
  resetLocalDatabase("discount-invalid");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FORENSIC-BAD-DISC",
    sku: "FORENSIC-BAD-DISC",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
    initialQuantity: 5,
  });
  const before = await countSales(ctx.companyId);
  let rejected = false;
  try {
    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: product.id,
      quantity: 1,
      accountingType: AccountingType.PIECE,
      discountAmount: 150,
    });
  } catch {
    rejected = true;
  }
  const after = await countSales(ctx.companyId);
  record({
    name: "Invalid discount",
    passed: rejected && after === before,
  });
}

async function scenarioFifoMultiBatch() {
  resetLocalDatabase("fifo-multi");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "FORENSIC-FIFO",
    sku: "FORENSIC-FIFO",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 3,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 20,
    costPerUnit: 3,
    salePrice: 13.4,
    notes: "batch-A",
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 30,
    costPerUnit: 4,
    salePrice: 13.4,
    notes: "batch-B",
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
  });
  const s = await snap(ctx, "fifo-40ml", { cogs: 140, revenue: 536, grossProfit: 396 });
  const rows = s.sales[0]?.itemRows ?? 0;
  record({
    name: "FIFO multi-batch",
    passed: s.invariantOk && rows === 2,
    notes: `saleItem rows=${rows}`,
  });
}

async function scenarioProduction8() {
  resetLocalDatabase("production-8");
  const ctx = await loadLabContext();
  const prisma = new PrismaClient();

  const specs: Array<{
    name: string;
    sku: string;
    qty: number;
    cost: number;
    price: number;
    discount?: number;
    expRev: number;
    expCogs: number;
  }> = [
    { name: "мегамари топ", sku: "PROD-MEGA", qty: 40, cost: 3, price: 13.4, expRev: 536, expCogs: 120 },
    { name: "лемансити топ", sku: "PROD-LEM1", qty: 35, cost: 3, price: 13.4, expRev: 469, expCogs: 105 },
    { name: "лемансити топ", sku: "PROD-LEM2", qty: 40, cost: 3, price: 13.4, expRev: 536, expCogs: 120 },
    { name: "имеченейшн", sku: "PROD-IME1", qty: 14, cost: 3, price: 12.9, expRev: 180.6, expCogs: 42 },
    { name: "имеченейшн", sku: "PROD-IME2", qty: 12, cost: 3, price: 13.4, expRev: 160.8, expCogs: 36 },
    { name: "абреномад топ", sku: "PROD-ABR", qty: 40, cost: 4, price: 13.4, discount: 336, expRev: 200, expCogs: 160 },
    { name: "харизма", sku: "PROD-HAR1", qty: 1, cost: 260, price: 350, expRev: 350, expCogs: 260 },
    { name: "харизма", sku: "PROD-HAR2", qty: 1, cost: 260, price: 350, expRev: 350, expCogs: 260 },
  ];

  let cumRev = 0;
  let cumCogs = 0;
  const cogsTable: Array<{ n: number; expected: number; actual: number; diff: number }> = [];

  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i]!;
    const isPiece = sp.price === 350;
    const { product } = await createProductFlow(ctx, {
      name: sp.name,
      sku: sp.sku,
      accountingType: isPiece ? AccountingType.PIECE : AccountingType.WEIGHT,
      salePrice: sp.price,
      defaultCostPerUnit: sp.cost,
    });
    await receiveBatchFlow(ctx, {
      productId: product.id,
      quantity: sp.qty + 50,
      costPerUnit: sp.cost,
      salePrice: sp.price,
    });

    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: product.id,
      quantity: sp.qty,
      accountingType: isPiece ? AccountingType.PIECE : AccountingType.WEIGHT,
      discountAmount: sp.discount,
    });

    cumRev += sp.expRev;
    cumCogs += sp.expCogs;

    const s = await snap(
      ctx,
      `production-8 sale ${i + 1}/${specs.length}`,
      {
        cogs: cumCogs,
        revenue: cumRev,
        grossProfit: cumRev - cumCogs,
      },
      { recordFailure: false }
    );

    const diff = s.financials.cogs - cumCogs;
    cogsTable.push({
      n: i + 1,
      expected: cumCogs,
      actual: s.financials.cogs,
      diff: Math.round(diff * 100) / 100,
    });

    if (Math.abs(diff) > 0.05) {
      record({
        name: "Production 8-sale replay",
        passed: false,
        firstCorruption: `after sale #${i + 1}: COGS diff ${diff}`,
        expected: `cumCogs=${cumCogs}`,
        actual: `cumCogs=${s.financials.cogs}`,
        rootCause: "investigate SaleItem rows at this step",
      });
      console.log("\nCOGS TABLE (stopped):");
      console.table(cogsTable);
      await prisma.$disconnect();
      return;
    }

    // Pattern detection: frozen excess ~2522
    const excess = s.financials.cogs - cumCogs;
    if (i >= 6 && Math.abs(excess - 2522) < 1) {
      record({
        name: "Production +2522 pattern",
        passed: false,
        firstCorruption: `frozen excess ${excess} detected at sale ${i + 1}`,
        rootCause: "matches production symptom",
      });
      console.table(cogsTable);
      await prisma.$disconnect();
      return;
    }
  }

  console.log("\nCOGS TABLE (8 sales):");
  console.table(cogsTable);

  const final = await snap(ctx, "production-8 final", {
    revenue: 2782.4,
    cogs: 1103,
    grossProfit: 1679.4,
  });

  // 9th sale — production symptom: +260 COGS, excess should NOT freeze at +2522
  const sp9 = {
    name: "харизма",
    sku: "PROD-HAR3",
    qty: 1,
    cost: 260,
    price: 350,
    expRev: 350,
    expCogs: 260,
  };
  const { product: p9 } = await createProductFlow(ctx, {
    name: sp9.name,
    sku: sp9.sku,
    accountingType: AccountingType.PIECE,
    salePrice: sp9.price,
    defaultCostPerUnit: sp9.cost,
  });
  await receiveBatchFlow(ctx, {
    productId: p9.id,
    quantity: sp9.qty + 5,
    costPerUnit: sp9.cost,
    salePrice: sp9.price,
  });
  await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: p9.id,
    quantity: sp9.qty,
    accountingType: AccountingType.PIECE,
  });

  const cumRev9 = 2782.4 + sp9.expRev;
  const cumCogs9 = 1103 + sp9.expCogs;
  const s9 = await snap(ctx, "production-9 sale", {
    revenue: cumRev9,
    cogs: cumCogs9,
    grossProfit: cumRev9 - cumCogs9,
  });
  const frozenExcess = s9.financials.cogs - cumCogs9;
  if (Math.abs(frozenExcess - 2522) < 1) {
    record({
      name: "Production +2522 pattern (sale 9)",
      passed: false,
      firstCorruption: `frozen excess ${frozenExcess} at sale 9`,
      rootCause: "matches production symptom",
    });
    await prisma.$disconnect();
    return;
  }

  await prisma.$disconnect();
  record({
    name: "Production 8-sale replay",
    passed: final.invariantOk && s9.invariantOk,
    notes: `8-sale rev=${final.financials.revenue} cogs=${final.financials.cogs}; 9-sale cogs=${s9.financials.cogs} excess=${frozenExcess}`,
  });
}

async function scenarioDoubleSubmit() {
  resetLocalDatabase("double-submit");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "DOUBLE-SUBMIT",
    sku: "FORENSIC-DBL",
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
  const [a, b] = await Promise.allSettled([
    saleFlow(ctx, p),
    saleFlow(ctx, p),
  ]);
  const ok = [a, b].filter((r) => r.status === "fulfilled").length;
  const s = await snap(ctx, "double-submit");
  record({
    name: "Double submit sale",
    passed: ok === 1 && s.counts.sales === 1,
    notes: `successful=${ok} sales=${s.counts.sales}`,
    rootCause: ok > 1 ? "duplicate sale path" : undefined,
  });
}

async function scenarioProductIdempotency() {
  resetLocalDatabase("product-idem");
  const ctx = await loadLabContext();
  const key = `idem-${Date.now()}`;
  const a = await createProductFlow(ctx, {
    name: "IDEM-PRODUCT",
    sku: "FORENSIC-IDEM-A",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
    idempotencyKey: key,
  });
  const b = await createProductFlow(ctx, {
    name: "IDEM-PRODUCT",
    sku: "FORENSIC-IDEM-A",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
    idempotencyKey: key,
  });
  const sameId = a.product.id === b.product.id;
  record({
    name: "Duplicate product request",
    passed: sameId && b.deduplicated,
    notes: `sameId=${sameId} dedup=${b.deduplicated}`,
  });
}

async function scenarioHarizmaDuplicate() {
  resetLocalDatabase("harizma-dup");
  const ctx = await loadLabContext();
  const a = await createProductFlow(ctx, {
    name: "харизма",
    sku: "HAR-A",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
  });
  const b = await createProductFlow(ctx, {
    name: "харизма",
    sku: "HAR-B",
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    defaultCostPerUnit: 260,
  });
  await receiveBatchFlow(ctx, {
    productId: a.product.id,
    quantity: 1,
    costPerUnit: 260,
    salePrice: 350,
  });
  let soldA = false;
  try {
    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: b.product.id,
      quantity: 1,
      accountingType: AccountingType.PIECE,
    });
  } catch {
    /* expected fail on B */
  }
  try {
    await saleFlow(ctx, {
      storeId: ctx.ownerDirectStoreId,
      sellerId: ctx.ownerId,
      productId: a.product.id,
      quantity: 1,
      accountingType: AccountingType.PIECE,
    });
    soldA = true;
  } catch {
    soldA = false;
  }
  const s = await snap(ctx, "harizma-dup");
  record({
    name: "Harizma duplicate products",
    passed: a.product.id !== b.product.id && soldA && s.counts.sales === 1,
    notes: `A=${a.product.id.slice(-6)} B=${b.product.id.slice(-6)}`,
  });
}

async function scenarioReturnPartial() {
  resetLocalDatabase("return-partial");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "RETURN-ML",
    sku: "FORENSIC-RET",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 3,
    initialQuantity: 100,
  });
  const sale = await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
    discountAmount: 36,
  });
  const prisma = new PrismaClient();
  const full = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  const item = full.items[0]!;
  await returnAndApproveFlow(ctx, {
    saleId: sale.id,
    saleItemId: item.id,
    quantity: 10,
  });
  const s = await snap(ctx, "partial-return", {
    revenue: 375,
    cogs: 90,
    grossProfit: 285,
  });
  await prisma.$disconnect();
  record({ name: "Partial return (owner)", passed: s.invariantOk });
}

async function scenarioReturnDiscountedFull() {
  resetLocalDatabase("return-disc-full");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "RET-DISC",
    sku: "FORENSIC-RET-D",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 4,
    initialQuantity: 100,
  });
  const sale = await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
    discountAmount: 336,
  });
  const prisma = new PrismaClient();
  const full = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  await returnAndApproveFlow(ctx, {
    saleId: sale.id,
    saleItemId: full.items[0]!.id,
    quantity: 40,
  });
  const s = await snap(ctx, "full-return-discounted", {
    revenue: 0,
    cogs: 0,
    grossProfit: 0,
  });
  await prisma.$disconnect();
  record({
    name: "Return + discount (full)",
    passed: s.invariantOk && s.financials.revenue === 0,
    notes: "must not net -536 revenue",
  });
}

async function scenarioCostSnapshot() {
  resetLocalDatabase("cost-snapshot");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "COST-SNAP",
    sku: "FORENSIC-COST",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 3,
    initialQuantity: 50,
  });
  const sale = await saleFlow(ctx, {
    storeId: ctx.ownerDirectStoreId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
  });
  const prisma = new PrismaClient();
  await prisma.product.update({
    where: { id: product.id },
    data: { defaultCostPerUnit: 5 },
  });
  const item = await prisma.saleItem.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  const frozen = decimalToNumber(item.costPerUnit);
  await prisma.$disconnect();
  record({
    name: "Cost changed after sale",
    passed: Math.abs(frozen - 3) < 0.01,
    expected: "COGS unit 3",
    actual: `frozen ${frozen}`,
  });
}

async function scenarioSellerBranchSale() {
  resetLocalDatabase("seller-branch");
  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "SELLER-PCS",
    sku: "FORENSIC-SELL",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
  });
  await receiveBatchFlow(ctx, {
    productId: product.id,
    quantity: 20,
    costPerUnit: 40,
    salePrice: 100,
  });
  await transferToStoreFlow(ctx, {
    storeId: ctx.branchStoreId,
    productId: product.id,
    quantity: 5,
  });
  await saleFlow(ctx, {
    storeId: ctx.branchStoreId,
    sellerId: ctx.sellerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const s = await snap(ctx, "seller-sale", {
    revenue: 100,
    cogs: 40,
    grossProfit: 60,
  });
  record({
    name: "Seller branch sale",
    passed: s.invariantOk && s.counts.sales === 1,
  });
}

async function runScenario(name: string, fn: () => Promise<void>) {
  if (stopLab) return;
  try {
    await disconnectFlows();
    await disconnectSnapshot();
    await fn();
  } catch (e) {
    record({
      name,
      passed: false,
      firstCorruption: e instanceof Error ? e.message : String(e),
    });
    stopLab = true;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   FORENSIC E2E REPRODUCTION LAB          ║");
  console.log("║   Local only — production NOT touched    ║");
  console.log("╚══════════════════════════════════════════╝\n");

  for (const { name, fn } of [
    { name: "Zero stock sale", fn: scenarioZeroStock },
    { name: "Pre-receipt sale", fn: scenarioPreReceipt },
    { name: "OWNER_DIRECT ml sale", fn: scenarioOwnerDirectMl },
    { name: "Owner sale (piece)", fn: scenarioOwnerPiece },
    { name: "Discount (owner)", fn: scenarioDiscountValid },
    { name: "Invalid discount", fn: scenarioInvalidDiscount },
    { name: "FIFO multi-batch", fn: scenarioFifoMultiBatch },
    { name: "Production 8-sale replay", fn: scenarioProduction8 },
    { name: "Double submit sale", fn: scenarioDoubleSubmit },
    { name: "Duplicate product request", fn: scenarioProductIdempotency },
    { name: "Harizma duplicate products", fn: scenarioHarizmaDuplicate },
    { name: "Partial return (owner)", fn: scenarioReturnPartial },
    { name: "Return + discount (full)", fn: scenarioReturnDiscountedFull },
    { name: "Cost changed after sale", fn: scenarioCostSnapshot },
    { name: "Seller branch sale", fn: scenarioSellerBranchSale },
  ]) {
    await runScenario(name, fn);
  }

  console.log("\n\n========== FORENSIC LAB REPORT ==========\n");
  console.table(
    results.map((r) => ({
      Scenario: r.name,
      Passed: r.passed ? "YES" : "NO",
      Corruption: r.firstCorruption ?? "",
      Notes: r.notes ?? "",
    }))
  );

  const failed = results.filter((r) => !r.passed);
  if (failed.length) {
    console.log(`\n${failed.length} scenario(s) FAILED or corruption detected.`);
  } else {
    console.log("\nAll scenarios PASSED on current code.");
    console.log(
      "NOTE: +2522 production pattern was NOT reproduced — likely historical SaleItem data or legacy code path."
    );
  }

  await disconnectFlows();
  await disconnectSnapshot();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
