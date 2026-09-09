/**
 * Ensures expense UI translation keys exist in ru/tj (no raw keys in UI).
 * Run: npx tsx scripts/test-i18n-expense-keys.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ru from "../src/messages/ru.json";
import tj from "../src/messages/tj.json";
import { getByPath } from "../src/lib/i18n/translate";

const EXPENSE_UI_KEYS = [
  "common.actions",
  "common.saving",
  "common.cancel",
  "common.search",
  "common.noData",
  "common.error",
  "storeDetail.editExpense",
  "storeDetail.saveChanges",
  "storeDetail.expenseUpdated",
  "storeDetail.expenseSavedOutsidePeriod",
  "storeDetail.filterTotal",
  "storeDetail.expensesHint",
  "storeDetail.expensesOwnerOnly",
  "storeDetail.expenseTypesTitle",
  "storeDetail.addExpense",
  "storeDetail.type",
  "storeDetail.amount",
  "storeDetail.periodicity",
  "storeDetail.startsAt",
  "storeDetail.endsAt",
  "storeDetail.endDateOption",
  "storeDetail.indefiniteOption",
  "storeDetail.stopToday",
  "storeDetail.indefiniteBadge",
  "storeDetail.description",
  "storeDetail.date",
  "storeDetail.who",
  "storeDetail.noExpenses",
  "storeDetail.periodOnce",
  "storeDetail.periodDaily",
  "storeDetail.periodWeekly",
  "storeDetail.periodMonthly",
];

function assertLocale(dict: Record<string, unknown>, locale: string) {
  for (const key of EXPENSE_UI_KEYS) {
    const value = getByPath(dict, key);
    assert.ok(value, `${locale}: missing key ${key}`);
    assert.notEqual(value, key, `${locale}: key ${key} resolves to itself`);
    assert.ok(!/^[a-z]+\.[a-zA-Z.]+$/.test(value), `${locale}: ${key} looks like raw key: ${value}`);
  }
}

function scanSourceForExpenseKeys() {
  const file = path.join(
    process.cwd(),
    "src/app/(owner)/stores/[id]/store-detail-client.tsx"
  );
  const src = fs.readFileSync(file, "utf8");
  const panelStart = src.indexOf("function StoreExpensesPanel");
  const panelEnd = src.indexOf("function RequestsTab", panelStart);
  assert.ok(panelStart >= 0 && panelEnd > panelStart, "StoreExpensesPanel block not found");
  const panel = src.slice(panelStart, panelEnd);
  const used = [...panel.matchAll(/\bt\("([^"]+)"/g)].map((m) => m[1]);
  const unique = [...new Set(used)];
  for (const key of unique) {
    assert.ok(
      getByPath(ru as Record<string, unknown>, key),
      `ru.json missing key used in StoreExpensesPanel: ${key}`
    );
    assert.ok(
      getByPath(tj as Record<string, unknown>, key),
      `tj.json missing key used in StoreExpensesPanel: ${key}`
    );
  }
  console.log(`✓ ${unique.length} keys referenced in StoreExpensesPanel exist in ru/tj`);
}

function main() {
  console.log("=== i18n expense keys audit ===\n");
  assertLocale(ru as Record<string, unknown>, "ru");
  assertLocale(tj as Record<string, unknown>, "tj");
  console.log(`✓ ${EXPENSE_UI_KEYS.length} expense UI keys present in ru/tj`);
  scanSourceForExpenseKeys();
  console.log("\n✓ i18n expense keys audit passed");
}

main();
