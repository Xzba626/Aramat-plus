/**
 * Phase 2: topSales ranking + on-pace / weak / noSales partition.
 *   npx tsx scripts/zt-analytics-product-lists.ts
 */
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { getProductPerformanceCategory } from "../src/lib/services/sales-performance.service";
import { prisma } from "../src/lib/prisma";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const full = { pieces: 10, ml: 200 };
  assert(
    getProductPerformanceCategory({
      sold: 5,
      accountingType: "PIECE",
      thresholds: full,
    }) === "LOW",
    "5 pcs → LOW"
  );
  assert(
    getProductPerformanceCategory({
      sold: 10,
      accountingType: "PIECE",
      thresholds: full,
    }) === "LEADER",
    "10 pcs → LEADER"
  );

  const company = await prisma.company.findFirst();
  if (!company) throw new Error("NO_COMPANY");

  const data = await getAnalyticsBreakdown(company.id, "month");
  const top = data.topSales ?? [];
  const onPace = data.products;
  const weak = data.topUnsold;
  const zero = data.noSales;

  const onPaceNames = new Set(onPace.map((p) => p.name));
  const weakNames = new Set(weak.map((p) => p.name));
  const zeroNames = new Set(zero.map((p) => p.name));

  assert(
    [...onPaceNames].every((n) => !weakNames.has(n) && !zeroNames.has(n)),
    "onPace overlaps weak/zero"
  );
  assert(
    [...weakNames].every((n) => !zeroNames.has(n)),
    "weak overlaps zero"
  );

  const topSorted = top.every(
    (p, i, arr) => i === 0 || arr[i - 1].sold >= p.sold
  );
  assert(topSorted, "topSales not DESC");

  const parfumTop = top.find((p) => p.name === "Parfum plus");
  const parfumPace = onPace.find((p) => p.name === "Parfum plus");
  assert(!!parfumTop, "Parfum missing from topSales");
  assert(!!parfumPace, "Parfum missing from onPace");
  assert(!weakNames.has("Parfum plus"), "Parfum in weak");
  assert(!zeroNames.has("Parfum plus"), "Parfum in noSales");

  const zeroOnly = zero.every((p) => p.sold === 0);
  assert(zeroOnly, "noSales has sold>0");

  console.log(
    JSON.stringify(
      {
        pass: true,
        topSales: top.slice(0, 5).map((p, i) => ({
          rank: i + 1,
          name: p.name,
          sold: p.sold,
        })),
        onPace: onPace.map((p) => ({ name: p.name, sold: p.sold })),
        weak: weak.map((p) => ({ name: p.name, sold: p.sold })),
        noSales: zero.map((p) => ({ name: p.name, sold: p.sold })),
        thr: data.performanceThresholds,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
