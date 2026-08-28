/**
 * Expense date round-trip + edit binding (screenshot reproduction).
 * Run: npx tsx scripts/test-expense-date-roundtrip.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient, ExpensePeriodicity } from "@prisma/client";
import assert from "node:assert/strict";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import { loadLabContext, disconnectFlows } from "./forensic-lab/lib/app-flows";
import {
  createExpense,
  updateExpense,
  listExpenses,
} from "../src/lib/services/expense.service";
import {
  dateInputToIso,
  isoToDateInput,
} from "../src/lib/dates/local-date";

const prisma = new PrismaClient();

async function main() {
  assertForensicOrStressSafe("test-expense-date-roundtrip");
  resetLocalDatabase("expense-date-roundtrip");
  console.log("=== Expense date round-trip + edit binding ===\n");

  const ctx = await loadLabContext();
  const storeId = ctx.ownerDirectStoreId;

  const rentType = await prisma.expenseType.findFirstOrThrow({
    where: { companyId: ctx.companyId, name: "Аренда" },
  });
  const internetType = await prisma.expenseType.findFirstOrThrow({
    where: { companyId: ctx.companyId, name: "Интернет" },
  });

  const dateA = "2026-08-28";
  const dateB = "2026-08-27";

  const expenseA = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: rentType.id,
    amount: 30,
    storeId,
    description: "АРЕНДА",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: new Date(dateInputToIso(dateA)),
  });

  const expenseB = await createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: internetType.id,
    amount: 30,
    storeId,
    description: "Интернет",
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: new Date(dateInputToIso(dateB)),
  });

  const rowA = await prisma.expense.findUniqueOrThrow({ where: { id: expenseA.id } });
  const rowB = await prisma.expense.findUniqueOrThrow({ where: { id: expenseB.id } });

  assert.equal(isoToDateInput(rowA.startsAt.toISOString()), dateA, "A startsAt in DB");
  assert.equal(isoToDateInput(rowA.incurredAt.toISOString()), dateA, "A incurredAt in DB");
  assert.equal(isoToDateInput(rowB.startsAt.toISOString()), dateB, "B startsAt in DB");

  // UI startEdit simulation — table and form must agree on startsAt
  const formA = isoToDateInput(expenseA.startsAt);
  const formB = isoToDateInput(expenseB.startsAt);
  assert.equal(formA, dateA, "edit form A date matches table row A");
  assert.equal(formB, dateB, "edit form B date matches table row B");
  console.log("✓ Screenshot case: Аренда 28.08 form shows 28.08, not 27.08");

  const listed = await listExpenses(ctx.companyId, { storeId });
  assert.equal(listed.length, 2);
  const listedA = listed.find((x) => x.id === expenseA.id)!;
  assert.equal(isoToDateInput(listedA.startsAt), dateA, "API list A startsAt");

  // Edit A only — B must stay untouched
  await updateExpense(expenseA.id, {
    companyId: ctx.companyId,
    updatedById: ctx.ownerId,
    amount: 35,
    description: "АРЕНДА UPD",
    startsAt: new Date(dateInputToIso("2026-08-29")),
  });

  const rowAAfter = await prisma.expense.findUniqueOrThrow({ where: { id: expenseA.id } });
  const rowBAfter = await prisma.expense.findUniqueOrThrow({ where: { id: expenseB.id } });
  assert.equal(Number(rowAAfter.amount), 35);
  assert.equal(isoToDateInput(rowAAfter.startsAt.toISOString()), "2026-08-29");
  assert.equal(Number(rowBAfter.amount), 30);
  assert.equal(isoToDateInput(rowBAfter.startsAt.toISOString()), dateB);
  assert.equal(rowBAfter.description, "Интернет");

  const count = await prisma.expense.count({ where: { storeId } });
  assert.equal(count, 2, "edit must not delete sibling expense");
  console.log("✓ Edit A does not mutate or delete B");

  // Full cycle: UI input → API → DB → UI input
  for (const d of ["2026-01-01", "2026-08-28", "2026-12-31"]) {
    const iso = dateInputToIso(d);
    const created = await createExpense({
      companyId: ctx.companyId,
      createdById: ctx.ownerId,
      expenseTypeId: rentType.id,
      amount: 1,
      storeId,
      periodicity: ExpensePeriodicity.ONCE,
      startsAt: new Date(iso),
    });
    const raw = await prisma.expense.findUniqueOrThrow({ where: { id: created.id } });
    assert.equal(isoToDateInput(raw.startsAt.toISOString()), d, `round-trip ${d}`);
    assert.equal(isoToDateInput(created.startsAt), d, `API response ${d}`);
  }
  console.log("✓ Date-only values survive DB → API → form → save cycle");

  console.log("\n✓ Expense date round-trip audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
