/**
 * Control case from production audit — owner personal sales COGS/profit.
 * Run: npx tsx scripts/test-control-case-analytics.ts
 */
import {
  saleGrossMetrics,
  detectSaleFinancialIssues,
} from "../src/lib/services/profit.service";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const CONTROL_8 = [
  { id: "1", total: 536, items: [{ quantity: 40, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "2", total: 469, items: [{ quantity: 35, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "3", total: 536, items: [{ quantity: 40, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "4", total: 180.6, items: [{ quantity: 14, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "5", total: 160.8, items: [{ quantity: 12, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "6", total: 200, items: [{ quantity: 40, costPerUnit: 4, salePrice: 13.4 }] },
  { id: "7", total: 350, items: [{ quantity: 1, costPerUnit: 260, salePrice: 350 }] },
  { id: "8", total: 350, items: [{ quantity: 1, costPerUnit: 260, salePrice: 350 }] },
];

function main() {
  console.log("=== Control case analytics invariants ===\n");

  const m8 = saleGrossMetrics(CONTROL_8);
  assert(Math.abs(m8.revenue - 2782.4) < 0.01, `revenue 2782.40 got ${m8.revenue}`);
  assert(Math.abs(m8.cogs - 1103) < 0.01, `COGS 1103 got ${m8.cogs}`);
  assert(
    Math.abs(m8.grossProfit - 1679.4) < 0.01,
    `gross 1679.40 got ${m8.grossProfit}`
  );
  console.log("✓ 8 sales — revenue, COGS, gross profit match control math");

  const impliedCogs = m8.revenue - -842.6;
  console.log(`\nProduction symptom implied COGS: ${impliedCogs.toFixed(2)}`);

  const phantomSale = {
    id: "p",
    total: 536,
    items: [
      { quantity: 40, costPerUnit: 3, salePrice: 13.4 },
      { quantity: 1, costPerUnit: 536, salePrice: 0 },
    ],
  };
  const onePhantom = saleGrossMetrics([phantomSale]);
  assert(Math.abs(onePhantom.grossProfit - -120) < 0.01, `one phantom gross -120 got ${onePhantom.grossProfit}`);

  const withPhantoms = CONTROL_8.map((s) => ({
    ...s,
    items: [...s.items, { quantity: 1, costPerUnit: s.total, salePrice: 0 }],
  }));
  const allPhantom = saleGrossMetrics(withPhantoms);
  assert(Math.abs(allPhantom.grossProfit - -1103) < 0.01, `8 phantoms gross -1103 got ${allPhantom.grossProfit}`);
  console.log(
    "✓ Phantom rows (line COGS ≈ sale.total) explain inflated COGS; engine math is otherwise correct"
  );
  console.log(
    `  Production −842.60 ≈ implied COGS ${impliedCogs.toFixed(2)} (between clean +1679 and full-phantom −1103)`
  );

  console.log("\nALL CONTROL CASE ANALYSIS PASSED");
}

main();
