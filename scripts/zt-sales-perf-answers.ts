import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import {
  getProductPerformanceCategory,
  getSalesPerformanceThresholds,
  scaleSalesPerformanceThresholds,
  setSalesPerformanceThresholds,
} from "../src/lib/services/sales-performance.service";
import { prisma } from "../src/lib/prisma";

async function main() {
  const full = { pieces: 10, ml: 200 };
  const pieceRows = [0, 1, 9, 10, 11].map((sold) => ({
    sold,
    cat: getProductPerformanceCategory({
      sold,
      accountingType: "PIECE",
      thresholds: full,
    }),
  }));
  const mlRows = [0, 1, 199, 200, 201].map((sold) => ({
    sold,
    cat: getProductPerformanceCategory({
      sold,
      accountingType: "WEIGHT",
      thresholds: full,
    }),
  }));
  console.log("BOUNDARY_PIECE", JSON.stringify(pieceRows, null, 2));
  console.log("BOUNDARY_ML", JSON.stringify(mlRows, null, 2));

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const scaled = scaleSalesPerformanceThresholds({
    monthly: { monthlyPieces: 10, monthlyMl: 200 },
    from,
    to: now,
  });
  console.log("CURRENT_MONTH_SCALE", JSON.stringify(scaled));

  const company = await prisma.company.findFirst();
  if (!company) throw new Error("no company");
  const before = await getSalesPerformanceThresholds(company.id);
  await setSalesPerformanceThresholds(company.id, {
    monthlyPieces: 15,
    monthlyMl: 300,
  });
  const data = await getAnalyticsBreakdown(company.id, "month");
  console.log(
    "SETTINGS_USED",
    JSON.stringify(
      {
        before,
        afterWrite: { monthlyPieces: 15, monthlyMl: 300 },
        analyticsSees: {
          monthlyPieces: data.performanceThresholds.monthlyPieces,
          monthlyMl: data.performanceThresholds.monthlyMl,
          scaledPieces: data.performanceThresholds.scaledPieces,
          scaledMl: data.performanceThresholds.scaledMl,
          dayCount: data.performanceThresholds.dayCount,
        },
        matchesSettings:
          data.performanceThresholds.monthlyPieces === 15 &&
          data.performanceThresholds.monthlyMl === 300,
      },
      null,
      2
    )
  );
  await setSalesPerformanceThresholds(company.id, before);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
