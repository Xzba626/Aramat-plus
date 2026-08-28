/**
 * Store period filter cross-check: DB ↔ service ↔ independent calculator.
 * Run: npx tsx scripts/test-store-period-filters.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient, AccountingType } from "@prisma/client";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import {
  loadLabContext,
  createProductFlow,
  saleFlow,
  disconnectFlows,
  type LabContext,
} from "./forensic-lab/lib/app-flows";
import {
  getStoreFinanceBreakdown,
  getStoreSalesHistory,
  getStoreDiscountHistory,
  getStoreReturnHistory,
} from "../src/lib/services/stores-detail.service";
import { computeRawFinancials } from "./forensic-lab/lib/independent-calculator";
import { createExpense } from "../src/lib/services/expense.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import { ReturnReasonCode } from "@prisma/client";
import assert from "node:assert/strict";

const prisma = new PrismaClient();

function daysAgo(n: number, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function saleAt(
  ctx: LabContext,
  storeId: string,
  productId: string,
  at: Date,
  discount = 0
) {
  const sale = await saleFlow(ctx, {
    storeId,
    sellerId: ctx.ownerId,
    productId,
    quantity: 10,
    accountingType: AccountingType.WEIGHT,
    discountAmount: discount,
  });
  await prisma.sale.update({
    where: { id: sale.id },
    data: { createdAt: at },
  });
  return sale;
}

async function main() {
  assertForensicOrStressSafe("test-store-period-filters");
  resetLocalDatabase("store-period-filters");
  console.log("=== Store period filter audit ===\n");

  const ctx = await loadLabContext();
  const { product } = await createProductFlow(ctx, {
    name: "PERIOD-ML",
    sku: `PERIOD-${Date.now()}`,
    accountingType: AccountingType.WEIGHT,
    salePrice: 10,
    defaultCostPerUnit: 4,
    initialQuantity: 500,
  });

  const storeId = ctx.ownerDirectStoreId;
  const yesterday = daysAgo(1);
  const today = daysAgo(0);
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);
  const yearAgo = daysAgo(365);

  await saleAt(ctx, storeId, product.id, yesterday);
  await saleAt(ctx, storeId, product.id, yesterday);
  await saleAt(ctx, storeId, product.id, today);
  await saleAt(ctx, storeId, product.id, today, 5);
  await saleAt(ctx, storeId, product.id, today);
  await saleAt(ctx, storeId, product.id, weekAgo);
  await saleAt(ctx, storeId, product.id, monthAgo);
  await saleAt(ctx, storeId, product.id, yearAgo);

  const expenseType = await prisma.expenseType.findFirstOrThrow({
    where: { companyId: ctx.companyId },
  });
  await createExpense({
    companyId: ctx.companyId,
    storeId,
    amount: 50,
    expenseTypeId: expenseType.id,
    description: "yesterday expense",
    createdById: ctx.ownerId,
    incurredAt: yesterday,
  });

  const todaySale = await prisma.sale.findFirstOrThrow({
    where: { storeId, discountAmount: { gt: 0 } },
    include: { items: true },
  });
  const ret = await createSaleReturn({
    companyId: ctx.companyId,
    saleId: todaySale.id,
    reason: "period test",
    reasonCode: ReturnReasonCode.OTHER,
    items: [{ saleItemId: todaySale.items[0]!.id, quantity: 3 }],
    requesterId: ctx.ownerId,
  });
  await decideSaleReturn({
    companyId: ctx.companyId,
    returnId: ret.id,
    decision: "APPROVE",
    reviewerId: ctx.ownerId,
  });
  await prisma.saleReturn.update({
    where: { id: ret.id },
    data: { createdAt: today },
  });

  type Case = {
    period: "today" | "yesterday" | "week" | "month" | "year" | "all";
    minSales: number;
    maxSales: number;
  };

  const cases: Case[] = [
    { period: "today", minSales: 2, maxSales: 3 },
    { period: "yesterday", minSales: 2, maxSales: 2 },
    { period: "week", minSales: 5, maxSales: 6 },
    { period: "month", minSales: 6, maxSales: 7 },
    { period: "year", minSales: 7, maxSales: 8 },
    { period: "all", minSales: 8, maxSales: 8 },
  ];

  for (const c of cases) {
    const fin = await getStoreFinanceBreakdown(
      ctx.companyId,
      storeId,
      c.period
    );
    const salesHist = await getStoreSalesHistory(
      ctx.companyId,
      storeId,
      1,
      50,
      c.period
    );
    const discHist = await getStoreDiscountHistory(
      ctx.companyId,
      storeId,
      c.period
    );
    const retHist = await getStoreReturnHistory(
      ctx.companyId,
      storeId,
      c.period
    );

    assert.ok(
      fin.salesCount >= c.minSales && fin.salesCount <= c.maxSales,
      `${c.period}: salesCount ${fin.salesCount} not in [${c.minSales},${c.maxSales}]`
    );
    assert.equal(
      salesHist.total,
      fin.salesCount,
      `${c.period}: history total vs finance count`
    );

    if (c.period === "today") {
      assert.ok(retHist.length >= 1, "today should have return");
      assert.ok(discHist.length >= 1, "today should have discount");
    }
    if (c.period === "yesterday") {
      assert.ok(fin.expenses >= 50, "yesterday expenses");
    }

    if (c.period === "all") {
      const raw = await computeRawFinancials({
        companyId: ctx.companyId,
        storeId,
      });
      assert.ok(
        Math.abs(fin.revenue - raw.revenue) < 0.06,
        `all-period revenue service ${fin.revenue} vs raw ${raw.revenue}`
      );
      assert.ok(
        Math.abs(fin.cogs - raw.cogs) < 0.06,
        `all-period cogs service ${fin.cogs} vs raw ${raw.cogs}`
      );
      assert.equal(
        fin.netProfit,
        Math.round((fin.grossProfit - fin.expenses) * 100) / 100,
        "net = gross - expenses"
      );
    }

    console.log(
      `✓ period=${c.period} sales=${fin.salesCount} rev=${fin.revenue} net=${fin.netProfit} returns=${fin.returnsCount}`
    );
  }

  console.log("\n✓ Store period filter audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
