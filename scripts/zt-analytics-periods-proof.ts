/**
 * Prove analytics period ranges: today ≤ week ≤ month ≤ year,
 * and UI totals match DB sale counts for each range.
 *
 * Run: npx tsx scripts/zt-analytics-periods-proof.ts
 */
import { PrismaClient } from "@prisma/client";
import {
  analyticsPeriodFrom,
  getAnalyticsBreakdown,
  type AnalyticsPeriod,
} from "../src/lib/services/analytics.service";

const prisma = new PrismaClient();

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

async function main() {
  const company = await prisma.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("No company");

  const now = new Date();
  const periods: AnalyticsPeriod[] = ["today", "week", "month", "year"];
  const rows: Array<{
    period: AnalyticsPeriod;
    from: string;
    to: string;
    dbSales: number;
    apiSales: number;
    apiRevenue: number;
    match: boolean;
  }> = [];

  for (const period of periods) {
    const from = analyticsPeriodFrom(period, now);
    const dbSales = await prisma.sale.count({
      where: {
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
        createdAt: { gte: from, lte: now },
        store: { companyId: company.id },
      },
    });
    const data = await getAnalyticsBreakdown(company.id, period);
    const apiSales = data.network.salesCount;
    rows.push({
      period,
      from: from.toISOString(),
      to: now.toISOString(),
      dbSales,
      apiSales,
      apiRevenue: data.network.revenue,
      match: dbSales === apiSales,
    });
  }

  console.log("=== Period ranges (intended) ===");
  console.log(
    JSON.stringify(
      {
        today: "00:00 today → now",
        week: "last 7 calendar days (today + 6 previous) → now",
        month: "1st of current calendar month → now",
        year: "1 Jan current year → now",
        weekdayNow: now.toLocaleDateString("en-US", { weekday: "long" }),
        note:
          "Before fix, week = Monday of current week (= today on Mondays).",
      },
      null,
      2
    )
  );

  console.log("\n=== Per-period DB vs API ===");
  console.log(JSON.stringify(rows, null, 2));

  const rev = Object.fromEntries(rows.map((r) => [r.period, r.apiRevenue]));
  const counts = Object.fromEntries(rows.map((r) => [r.period, r.apiSales]));
  const monoOk =
    rev.today <= rev.week &&
    rev.week <= rev.month &&
    rev.month <= rev.year &&
    counts.today <= counts.week &&
    counts.week <= counts.month &&
    counts.month <= counts.year;

  // On Monday before fix week===today; after fix week should include prior days if any
  const weekFrom = analyticsPeriodFrom("week", now);
  const todayFrom = analyticsPeriodFrom("today", now);
  const weekWiderThanToday = weekFrom.getTime() < todayFrom.getTime();

  console.log("\n=== Checks ===");
  console.log({
    allMatchDb: rows.every((r) => r.match),
    monotonicRevenueAndCounts: monoOk,
    weekStartsBeforeToday: weekWiderThanToday,
    weekFromIso: weekFrom.toISOString(),
    todayFromIso: todayFrom.toISOString(),
    daysInWeekWindow: Math.round(
      (todayFrom.getTime() - weekFrom.getTime()) / 86400000
    ) + 1,
  });

  if (!rows.every((r) => r.match)) {
    throw new Error("API salesCount != DB count for some period");
  }
  if (!monoOk) {
    throw new Error("Monotonicity today≤week≤month≤year failed");
  }
  if (!weekWiderThanToday) {
    throw new Error("Week range must start before today (rolling 7 days)");
  }
  if (
    Math.round((todayFrom.getTime() - weekFrom.getTime()) / 86400000) + 1 !==
    7
  ) {
    throw new Error("Week window must be 7 calendar days inclusive");
  }

  console.log("\nPASS — analytics periods");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
