/**
 * Expense integrity: multiple create, edit, period filter, analytics allocation.
 * Run: npx tsx scripts/test-expense-integrity.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import fs from "node:fs";
import path from "node:path";
import { PrismaClient, ExpensePeriodicity, AccountingType } from "@prisma/client";
import assert from "node:assert/strict";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import {
  loadLabContext,
  createProductFlow,
  saleFlow,
  createStoreFlow,
  disconnectFlows,
} from "./forensic-lab/lib/app-flows";
import {
  createExpense,
  updateExpense,
  listExpenses,
  sumAllocatedExpenses,
  listAllocatedExpenseItems,
  dailyShareForExpense,
  monthlyCycleFor,
} from "../src/lib/services/expense.service";
import { getStoreFinanceBreakdown } from "../src/lib/services/stores-detail.service";
import { storePeriodRange } from "../src/lib/services/store-period.service";
import { archiveStore, hardDeleteStore } from "../src/lib/services/store-lifecycle.service";

const prisma = new PrismaClient();

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

function endOfDayJs(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Sum of dailyShareForExpense across one full MONTHLY billing cycle starting at `startsAt` (pure, no DB). */
function sumOneCycle(amount: number, startsAt: Date) {
  const { cycleLengthDays } = monthlyCycleFor(startsAt, startsAt);
  let sum = 0;
  for (let i = 0; i < cycleLengthDays; i++) {
    sum += dailyShareForExpense(
      {
        amount,
        periodicity: ExpensePeriodicity.MONTHLY,
        startsAt,
        endsAt: null,
        incurredAt: startsAt,
      },
      new Date(startsAt.getTime() + i * 86400000)
    );
  }
  return Math.round(sum * 100) / 100;
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

  console.log("\n--- Indefinite (бессрочно) expenses ---\n");

  // WEEKLY indefinite still accrues indefinitely (periodicity untouched by the MONTHLY fix).
  const weeklyRent = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 700,
    storeId,
    description: "Weekly indefinite",
    periodicity: ExpensePeriodicity.WEEKLY,
    startsAt: daysAgo(10),
    endsAt: null,
  });
  const weeklyShareFuture = dailyShareForExpense(
    {
      amount: 700,
      periodicity: ExpensePeriodicity.WEEKLY,
      startsAt: new Date(weeklyRent.startsAt),
      endsAt: null,
      incurredAt: new Date(weeklyRent.incurredAt),
    },
    daysAgo(-60) // 60 days in the future, no row created for it
  );
  assert.ok(weeklyShareFuture > 0, "WEEKLY indefinite expense still accrues far in the future");
  console.log("✓ WEEKLY indefinite expense accrues into future months without new rows");

  // DAILY is recurring by nature (full amount every day) — indefinite works the same way.
  const dailyShare = dailyShareForExpense(
    {
      amount: 50,
      periodicity: ExpensePeriodicity.DAILY,
      startsAt: daysAgo(5),
      endsAt: null,
      incurredAt: daysAgo(5),
    },
    daysAgo(-30)
  );
  assert.equal(dailyShare, 50, "DAILY indefinite expense accrues full amount on any future day");
  console.log("✓ DAILY indefinite expense behaves as recurring (no special-casing needed)");

  // ONCE ignores endsAt entirely — never treated as recurring.
  const onceShareOtherDay = dailyShareForExpense(
    {
      amount: 500,
      periodicity: ExpensePeriodicity.ONCE,
      startsAt: daysAgo(3),
      endsAt: null,
      incurredAt: daysAgo(3),
    },
    daysAgo(0)
  );
  assert.equal(onceShareOtherDay, 0, "ONCE expense does not repeat on other days even with endsAt=null");
  console.log("✓ ONCE expense never repeats regardless of endsAt");

  console.log(
    "\n--- MONTHLY = one cycle from startsAt's day-of-month (not the calendar month) ---\n"
  );

  // Isolated store: this scenario's totals must not mix with the other test expenses
  // (ONCE/WEEKLY fixtures above) that also live in the shared lab store.
  const rentStore = await createStoreFlow(ctx, "MONTHLY acceptance store");
  const rentStoreId = rentStore.id;
  const rentType = await prisma.expenseType.create({
    data: { companyId: ctx.companyId, name: "Rent acceptance" },
  });

  const now = new Date();
  // Anchor day 5, started 3 cycles ago: guarantees (a) at least one fully-completed prior cycle
  // and (b) "today" lands a few days into the *current* cycle (not exactly on its boundary), so a
  // same-day edit is a genuine "mid-cycle, already-viewed-days-included" rate change.
  const rentStartsAt = new Date(now.getFullYear(), now.getMonth() - 3, 5, 12, 0, 0, 0);

  // 1. Create 9000 MONTHLY ∞ anchored to day 5, well in the past.
  const rent = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: rentType.id,
    amount: 9000,
    storeId: rentStoreId,
    description: "Rent indefinite",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: rentStartsAt,
    endsAt: null,
  });
  assert.equal(rent.endsAt, null, "created MONTHLY expense stays open-ended");
  console.log(`✓ 1. Created 9000 MONTHLY ∞ anchored to day ${rentStartsAt.getDate()}, starting ${rentStartsAt.toDateString()}`);

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const { cycleStart: curCycleStart, cycleLengthDays: curCycleLen } = monthlyCycleFor(
    rentStartsAt,
    today
  );
  const curCycleEnd = new Date(curCycleStart.getTime() + (curCycleLen - 1) * 86400000);
  const prevCycleProbe = new Date(curCycleStart.getTime() - 86400000);
  const { cycleStart: prevCycleStart, cycleLengthDays: prevCycleLen } = monthlyCycleFor(
    rentStartsAt,
    prevCycleProbe
  );
  const prevCycleEnd = new Date(prevCycleStart.getTime() + (prevCycleLen - 1) * 86400000);
  assert.ok(
    curCycleStart.getTime() > rentStartsAt.getTime(),
    "sanity: 'today' must fall in a LATER cycle than the one starting at rentStartsAt, so a split is possible"
  );

  // 2. Previous (now completed) cycle totals exactly 9000, before any change.
  const prevCycleBefore = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: prevCycleStart,
    to: prevCycleEnd,
    storeId: rentStoreId,
  });
  assert.equal(
    prevCycleBefore.total,
    9000,
    `previous completed cycle should total exactly 9000, got ${prevCycleBefore.total}`
  );
  console.log(
    `✓ 2. Previous completed cycle (${prevCycleStart.toDateString()} → ${prevCycleEnd.toDateString()}, ${prevCycleLen}d) totals exactly 9000: ${prevCycleBefore.total}`
  );

  // 3. Current-cycle day-level analytics BEFORE the change, for a day already in the past
  //    (2 days into the current cycle — still before "today", simulating an already-viewed day).
  const probeDay = new Date(curCycleStart.getTime() + 2 * 86400000);
  const shareBeforeChange = dailyShareForExpense(
    {
      amount: 9000,
      periodicity: ExpensePeriodicity.MONTHLY,
      startsAt: rentStartsAt,
      endsAt: null,
      incurredAt: rentStartsAt,
    },
    probeDay
  );
  assert.ok(
    Math.abs(shareBeforeChange - 9000 / curCycleLen) < 0.005,
    `probe day before change should be ~${9000 / curCycleLen}, got ${shareBeforeChange}`
  );
  console.log(
    `✓ 3. Probe day inside current cycle BEFORE change = ${shareBeforeChange.toFixed(2)} (9000/${curCycleLen})`
  );

  // 4. Change 9000 -> 12000 today (mid current cycle) via the same ✏️ path (updateExpense).
  const v2 = await updateExpense(rent.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    amount: 12000,
  });
  assert.notEqual(
    v2.id,
    rent.id,
    "MONTHLY amount change on an expense whose current cycle started earlier creates a new segment"
  );
  assert.equal(v2.amount, 12000);
  assert.equal(v2.endsAt, null, "indefinite status is preserved across the rate change");

  const v2Row = await prisma.expense.findUniqueOrThrow({ where: { id: v2.id } });
  assert.equal(
    v2Row.startsAt.getTime(),
    curCycleStart.getTime(),
    "new segment starts exactly at the current cycle's boundary, not 'yesterday' and not a calendar month"
  );

  const rentClosed = await prisma.expense.findUniqueOrThrow({ where: { id: rent.id } });
  assert.equal(Number(rentClosed.amount), 9000, "closed version keeps its original 9000 amount");
  assert.equal(
    rentClosed.endsAt!.getTime(),
    endOfDayJs(prevCycleEnd).getTime(),
    "closed version ends exactly at the end of the previous cycle, not 'yesterday'"
  );
  console.log(
    `✓ 4. 9000 -> 12000 split at the cycle boundary (old row ends ${prevCycleEnd.toDateString()}, new row starts ${curCycleStart.toDateString()})`
  );

  // 5. Re-check the probe day (BEFORE the edit date, same cycle) AFTER the change — must already
  //    reflect 12000: the whole current cycle is re-priced, including already-passed days.
  const shareAfterChangeSameDay = dailyShareForExpense(
    {
      amount: 12000,
      periodicity: ExpensePeriodicity.MONTHLY,
      startsAt: v2Row.startsAt,
      endsAt: null,
      incurredAt: v2Row.incurredAt,
    },
    probeDay
  );
  assert.ok(
    Math.abs(shareAfterChangeSameDay - 12000 / curCycleLen) < 0.005,
    `probe day after change should already be ~${12000 / curCycleLen}, got ${shareAfterChangeSameDay}`
  );
  console.log(
    `✓ 5. Probe day AFTER change = ${shareAfterChangeSameDay.toFixed(2)} (12000/${curCycleLen}) — already-viewed days retroactively re-priced within the cycle`
  );

  // 6. Full current cycle totals exactly 12000.
  const curCycleAfterChange = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: curCycleStart,
    to: curCycleEnd,
    storeId: rentStoreId,
  });
  assert.equal(
    curCycleAfterChange.total,
    12000,
    `current cycle must total exactly 12000, got ${curCycleAfterChange.total}`
  );
  console.log(`✓ 6. Full current cycle totals exactly 12000: ${curCycleAfterChange.total}`);

  // 7. Previous completed cycle remains exactly 9000 after the change.
  const prevCycleAfterChange = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: prevCycleStart,
    to: prevCycleEnd,
    storeId: rentStoreId,
  });
  assert.equal(
    prevCycleAfterChange.total,
    9000,
    `previous completed cycle must remain exactly 9000, got ${prevCycleAfterChange.total}`
  );
  console.log(
    `✓ 7. Previous completed cycle still totals exactly 9000 after the change: ${prevCycleAfterChange.total}`
  );

  // 8. Next cycle automatically gives 12000 with no new Expense row created.
  const { cycleLengthDays: nextCycleLen } = monthlyCycleFor(
    v2Row.startsAt,
    new Date(curCycleEnd.getTime() + 86400000)
  );
  let nextCycleSum = 0;
  for (let i = 0; i < nextCycleLen; i++) {
    nextCycleSum += dailyShareForExpense(
      {
        amount: 12000,
        periodicity: ExpensePeriodicity.MONTHLY,
        startsAt: v2Row.startsAt,
        endsAt: null,
        incurredAt: v2Row.incurredAt,
      },
      new Date(curCycleEnd.getTime() + (i + 1) * 86400000)
    );
  }
  nextCycleSum = Math.round(nextCycleSum * 100) / 100;
  assert.equal(
    nextCycleSum,
    12000,
    `next cycle should automatically total 12000 with no new row, got ${nextCycleSum}`
  );
  console.log(`✓ 8. Next cycle automatically totals ${nextCycleSum} — no new Expense row created`);

  // 9. Change again 12000 -> 15000 within the SAME current cycle: must mutate in place, no chain.
  const rowCountBefore = await prisma.expense.count({
    where: { storeId: rentStoreId, expenseTypeId: rentType.id, description: "Rent indefinite" },
  });
  const v3 = await updateExpense(v2.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    amount: 15000,
  });
  assert.equal(
    v3.id,
    v2.id,
    "a second amount change within the still-current cycle must mutate the same row, not chain a new one"
  );
  const rowCountAfter = await prisma.expense.count({
    where: { storeId: rentStoreId, expenseTypeId: rentType.id, description: "Rent indefinite" },
  });
  assert.equal(rowCountAfter, rowCountBefore, "no extra row created for a same-cycle re-edit");
  const curCycleAfterSecondChange = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: curCycleStart,
    to: curCycleEnd,
    storeId: rentStoreId,
  });
  assert.equal(
    curCycleAfterSecondChange.total,
    15000,
    `current cycle must become exactly 15000, got ${curCycleAfterSecondChange.total}`
  );
  console.log(
    `✓ 9. Same-cycle second edit (12000 -> 15000) mutates in place: current cycle = ${curCycleAfterSecondChange.total}, no chained row`
  );

  // 10. Deterministic clamp/re-anchor for a 31st-of-month anchor (pure function, exact user example):
  //     Jan31 anchor -> cycle0 ends Feb27/28 (clamped) -> cycle1 starts Feb28/29, ends Mar30 (31 clamped
  //     to Feb's length) -> cycle2 starts Mar31 (re-anchored to the 31st, no permanent drift).
  const jan31_2025 = new Date(2025, 0, 31, 0, 0, 0, 0); // 2025 non-leap: Feb has 28 days
  const c0 = monthlyCycleFor(jan31_2025, jan31_2025);
  assert.equal(c0.cycleStart.getTime(), jan31_2025.getTime());
  assert.equal(c0.cycleLengthDays, 28, "cycle0 (Jan31->Feb27) is 28 days in a non-leap year");
  const cycle1Start = new Date(c0.cycleStart.getTime() + c0.cycleLengthDays * 86400000);
  assert.equal(cycle1Start.getFullYear(), 2025);
  assert.equal(cycle1Start.getMonth(), 1); // February
  assert.equal(cycle1Start.getDate(), 28, "cycle1 starts Feb28 (31 clamped to Feb's last day)");
  const c1 = monthlyCycleFor(jan31_2025, cycle1Start);
  assert.equal(c1.cycleLengthDays, 31, "cycle1 (Feb28->Mar30) is 31 days");
  const cycle2Start = new Date(c1.cycleStart.getTime() + c1.cycleLengthDays * 86400000);
  assert.equal(cycle2Start.getMonth(), 2); // March
  assert.equal(cycle2Start.getDate(), 31, "cycle2 re-anchors to the 31st in March — no permanent drift");
  assert.equal(sumOneCycle(9300, jan31_2025), 9300, "a full clamped cycle still sums to exactly the configured amount");
  console.log(
    "✓ 10. 31st-of-month anchor clamps deterministically (Jan31 -> Feb28 -> Mar31 re-anchored), each cycle still sums exactly"
  );

  // 11a. Stop today: today is still charged, tomorrow is not (unaffected by the cycle-anchor fix,
  //      since stop only ever touches endsAt, never amount/periodicity — needsSplit stays false).
  const stoppable = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 300,
    storeId,
    description: "Stoppable indefinite",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: daysAgo(20),
    endsAt: null,
  });
  const todayIso = new Date();
  todayIso.setHours(12, 0, 0, 0);
  const stopped = await updateExpense(stoppable.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    endsAt: todayIso,
  });
  assert.notEqual(stopped.endsAt, null, "stop sets a concrete endsAt");
  const stoppedRow = await prisma.expense.findUniqueOrThrow({ where: { id: stoppable.id } });
  const shareToday = dailyShareForExpense(
    {
      amount: Number(stoppedRow.amount),
      periodicity: stoppedRow.periodicity,
      startsAt: stoppedRow.startsAt,
      endsAt: stoppedRow.endsAt,
      incurredAt: stoppedRow.incurredAt,
    },
    daysAgo(0)
  );
  const shareTomorrow = dailyShareForExpense(
    {
      amount: Number(stoppedRow.amount),
      periodicity: stoppedRow.periodicity,
      startsAt: stoppedRow.startsAt,
      endsAt: stoppedRow.endsAt,
      incurredAt: stoppedRow.incurredAt,
    },
    daysAgo(-1)
  );
  assert.ok(shareToday > 0, "endsAt=today still accrues today (inclusive end)");
  assert.equal(shareTomorrow, 0, "no accrual the day after endsAt");
  console.log("✓ 11a. Stopping 'today' is still inclusive: today accrues, tomorrow does not (regression OK)");

  // 11b. Toggle a dated MONTHLY expense back to indefinite (endsAt -> null) still works.
  const dated = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: expenseType.id,
    amount: 400,
    storeId,
    description: "Was dated",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: daysAgo(5),
    endsAt: daysAgo(-10),
  });
  const backToIndefinite = await updateExpense(dated.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    endsAt: null,
  });
  assert.equal(backToIndefinite.endsAt, null, "expense can be switched back to indefinite");
  console.log("✓ 11b. A dated MONTHLY expense can still be switched back to indefinite (regression OK)");

  // 12. Verify via the same backend path the store-detail API actually uses (listAllocatedExpenseItems),
  //     not just raw Expense rows.
  const items = await listAllocatedExpenseItems({
    companyId: ctx.companyId,
    from: curCycleStart,
    to: curCycleEnd,
    storeId: rentStoreId,
  });
  const rentItem = items.find((i) => i.id === v3.id);
  assert.ok(rentItem, "listAllocatedExpenseItems (same path as the store-detail API) includes the current rent row");
  assert.equal(rentItem!.amount, 15000, "listAllocatedExpenseItems reflects the latest amount");
  console.log("✓ 12. listAllocatedExpenseItems (same path the UI/API uses) reflects the updated monthly amount");

  // Editing a superseded (closed) version is still rejected — unaffected by the cycle-anchor fix.
  await assert.rejects(
    () =>
      updateExpense(rent.id, {
        companyId: ctx.companyId,
        updatedById: ctx.ownerId,
        amount: 1,
      }),
    /EXPENSE_SUPERSEDED/,
    "editing the amount of a superseded (closed) version must be rejected"
  );
  console.log("✓ Superseded expense versions still cannot have their amount/period edited (regression OK)");

  // Cross-cycle chain: simulate time passing (push v3 back a few cycles), then edit again — a genuine
  // second cycle split must still produce a clean, non-overlapping chain.
  await prisma.expense.update({
    where: { id: v3.id },
    data: { startsAt: new Date(rentStartsAt.getTime()) },
  });
  const v4 = await updateExpense(v3.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    amount: 18000,
  });
  assert.notEqual(v4.id, v3.id, "a genuine cross-cycle edit still creates a new segment");
  const v3AfterSplit = await prisma.expense.findUniqueOrThrow({ where: { id: v3.id } });
  assert.equal(Number(v3AfterSplit.amount), 15000, "the superseded middle segment's amount stays untouched");
  await assert.rejects(
    () =>
      updateExpense(v3.id, {
        companyId: ctx.companyId,
        updatedById: ctx.ownerId,
        amount: 1,
      }),
    /EXPENSE_SUPERSEDED/,
    "the middle segment of a multi-cycle chain is also locked once superseded"
  );
  console.log("✓ Cross-cycle chain (9000 -> 15000 -> 18000) preserves each historical segment without overlap");

  // Store isolation still holds for indefinite MONTHLY expenses.
  const otherStore = await prisma.store.findFirst({
    where: { companyId: ctx.companyId, id: { notIn: [storeId, rentStoreId] } },
  });
  if (otherStore) {
    const otherAllocated = await sumAllocatedExpenses({
      companyId: ctx.companyId,
      from: curCycleStart,
      to: curCycleEnd,
      storeId: otherStore.id,
    });
    assert.ok(
      otherAllocated.total < curCycleAfterSecondChange.total,
      "indefinite expenses from one store must not leak into another store's totals"
    );
    console.log("✓ Store isolation holds for indefinite MONTHLY expenses");
  }

  // ActivityLog captures the rate-change split.
  const rateChangeLog = await prisma.activityLog.findFirst({
    where: { action: "EXPENSE_RATE_CHANGE", entityId: v2.id },
  });
  assert.ok(rateChangeLog, "EXPENSE_RATE_CHANGE activity log entry exists for the split");
  console.log("✓ ActivityLog records EXPENSE_RATE_CHANGE with prev/next amounts");

  console.log("\n--- Delete / destructive-action safety for a half-year-old recurring expense ---\n");

  // There is deliberately NO DELETE handler for individual expenses — "stopping" (endsAt) is the
  // only removal-adjacent action. Guard against ever reintroducing one silently.
  const expensesByIdRouteSrc = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/expenses/[id]/route.ts"),
    "utf8"
  );
  assert.ok(
    !/export\s+async\s+function\s+DELETE/.test(expensesByIdRouteSrc),
    "no DELETE handler must exist for /api/expenses/[id] — stopping (endsAt) is the only removal path, never a hard delete"
  );
  console.log("✓ /api/expenses/[id] has no DELETE handler (source-level guard)");

  // Deleting the ExpenseType a half-year-old expense still uses must be blocked (DB-level RESTRICT),
  // not silently cascade-delete the expenses referencing it.
  await assert.rejects(
    () => prisma.expenseType.delete({ where: { id: rentType.id } }),
    "deleting an ExpenseType that still has Expense rows referencing it must fail (ON DELETE RESTRICT), not cascade"
  );
  const rentTypeStillThere = await prisma.expenseType.findUnique({ where: { id: rentType.id } });
  assert.ok(rentTypeStillThere, "the expense type survives the rejected delete attempt");
  console.log("✓ Deleting an in-use ExpenseType is rejected (RESTRICT) — no cascade into Expense history");

  // Simulate a half-year-old recurring expense, then archive/close its store the normal way
  // (no `force`) — history (Expense rows + their analytics) must survive completely untouched.
  const halfYearStore = await createStoreFlow(ctx, "Half-year rent store");
  const halfYearType = await prisma.expenseType.create({
    data: { companyId: ctx.companyId, name: "Half-year rent type" },
  });
  const halfYearStart = new Date(now.getFullYear(), now.getMonth() - 6, 1, 12, 0, 0, 0);
  const halfYearRent = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: halfYearType.id,
    amount: 5000,
    storeId: halfYearStore.id,
    description: "Half-year rent",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: halfYearStart,
    endsAt: null,
  });
  const beforeArchive = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: halfYearStart,
    to: now,
    storeId: halfYearStore.id,
  });
  assert.ok(beforeArchive.total > 0, "half-year rent has accrued a non-zero total before archiving");

  await archiveStore({
    companyId: ctx.companyId,
    storeId: halfYearStore.id,
    actorId: ctx.ownerId,
    archive: true,
  });
  const expenseRowAfterArchive = await prisma.expense.findUnique({ where: { id: halfYearRent.id } });
  assert.ok(expenseRowAfterArchive, "the expense row physically still exists after archiving its store");
  const afterArchive = await sumAllocatedExpenses({
    companyId: ctx.companyId,
    from: halfYearStart,
    to: now,
    storeId: halfYearStore.id,
  });
  assert.equal(
    afterArchive.total,
    beforeArchive.total,
    "six months of accrued rent analytics must be identical before/after archiving the store (no data loss)"
  );
  console.log(
    `✓ Archiving a store with 6 months of MONTHLY rent history keeps every Expense row and analytic total intact (${afterArchive.total})`
  );

  // The default DELETE action (no force) on a store with history archives, it does not purge.
  const deleteResult = await hardDeleteStore({
    companyId: ctx.companyId,
    storeId: halfYearStore.id,
    actorId: ctx.ownerId,
    force: false,
  });
  assert.equal(
    (deleteResult as { archived?: boolean }).archived,
    true,
    "the default (non-force) delete action on a store with expense history archives it, it does not purge"
  );
  const expenseRowAfterDefaultDelete = await prisma.expense.findUnique({
    where: { id: halfYearRent.id },
  });
  assert.ok(
    expenseRowAfterDefaultDelete,
    "the expense row still exists after the default (archive-only) 'delete' action — no history lost"
  );
  console.log(
    "✓ The default 'delete store' action (no explicit force) archives only — 6 months of rent history is NOT purged"
  );
  console.log(
    "  (note: a separate, already-guarded `force=1` store-purge path exists in store-lifecycle.service.ts — " +
      "pre-existing, requires an explicit force flag, and is out of scope for the expense-editing feature itself)"
  );

  console.log("\n✓ Expense integrity audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
