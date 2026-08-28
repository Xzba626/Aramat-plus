/**
 * Expense integrity: multiple create, edit, period filter, analytics allocation.
 * Run: npx tsx scripts/test-expense-integrity.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient, ExpensePeriodicity, AccountingType } from "@prisma/client";
import assert from "node:assert/strict";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import {
  loadLabContext,
  createProductFlow,
  saleFlow,
  disconnectFlows,
} from "./forensic-lab/lib/app-flows";
import {
  createExpense,
  updateExpense,
  listExpenses,
  sumAllocatedExpenses,
} from "../src/lib/services/expense.service";
import { getStoreFinanceBreakdown } from "../src/lib/services/stores-detail.service";
import { storePeriodRange } from "../src/lib/services/store-period.service";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  assertForensicOrStressSafe("test-expense-integrity");
  resetLocalDatabase("expense-integrity");
  console.log("=== Expense integrity audit ===\n");

  const ctx = await loadLabContext();
  const storeId = ctx.ownerDirectStoreId;
  const expenseType = await prisma.expenseType.findFirstOrThrow({
    where: { companyId: ctx.companyId },
  });

  const e1 = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 100,
    storeId,
    description: "Expense A",
    incurredAt: daysAgo(0),
    periodicity: ExpensePeriodicity.ONCE,
  });
  const e2 = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 50,
    storeId,
    description: "Expense B",
    incurredAt: daysAgo(0),
    periodicity: ExpensePeriodicity.ONCE,
  });
  const e3 = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 75,
    storeId,
    description: "Expense C yesterday",
    incurredAt: daysAgo(1),
    periodicity: ExpensePeriodicity.ONCE,
  });

  let listed = await listExpenses(ctx.companyId, { storeId });
  assert.equal(listed.length, 3, "three expenses in list");
  assert.ok(listed.some((x) => x.id === e1.id));
  assert.ok(listed.some((x) => x.id === e2.id));
  assert.ok(listed.some((x) => x.id === e3.id));
  console.log("✓ Three sequential expenses persisted");

  const updated = await updateExpense(e2.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    amount: 60,
    description: "Expense B edited",
  });
  assert.equal(updated.amount, 60);

  const rowAfter = await prisma.expense.findUniqueOrThrow({ where: { id: e2.id } });
  assert.equal(Number(rowAfter.amount), 60);
  listed = await listExpenses(ctx.companyId, { storeId });
  assert.equal(listed.length, 3, "edit must not delete siblings");
  console.log("✓ Edit updates amount, siblings remain");

  const finToday = await getStoreFinanceBreakdown(ctx.companyId, storeId, "today");
  assert.ok(finToday.expenses >= 160, `today expenses >= 160 got ${finToday.expenses}`);
  const finYesterday = await getStoreFinanceBreakdown(
    ctx.companyId,
    storeId,
    "yesterday"
  );
  assert.ok(finYesterday.expenses >= 75, `yesterday expenses got ${finYesterday.expenses}`);
  console.log("✓ Period-scoped finance breakdown matches expense dates");

  const range = storePeriodRange("month");
  assert.ok(range);
  const allocated = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: range.from,
    to: range.to,
    storeId,
  });
  assert.ok(allocated.total >= 235, `allocated total got ${allocated.total}`);
  assert.equal(
    finToday.netProfit,
    Math.round((finToday.grossProfit - finToday.expenses) * 100) / 100,
    "net = gross - expenses"
  );
  console.log("✓ sumAllocatedExpenses consistent with finance API");

  const { product } = await createProductFlow(ctx, {
    name: "EXP-SALE",
    sku: "EXP-SALE-1",
    accountingType: AccountingType.PIECE,
    salePrice: 200,
    defaultCostPerUnit: 80,
    initialQuantity: 10,
  });
  await saleFlow(ctx, {
    storeId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 1,
    accountingType: AccountingType.PIECE,
  });
  const finAfterSale = await getStoreFinanceBreakdown(ctx.companyId, storeId, "today");
  assert.ok(finAfterSale.revenue >= 200);
  assert.ok(finAfterSale.cogs >= 80);
  console.log("✓ Sale + expenses coexist in same period analytics");

  console.log("\n✓ Expense integrity audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
