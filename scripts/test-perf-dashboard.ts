/**
 * Final gate: dashboard/analytics timing + query count (N+1 guard).
 * Instruments shared prisma BEFORE service imports.
 * Run: npx tsx scripts/test-perf-dashboard.ts
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let queryCount = 0;
const client = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});
client.$on("query", () => {
  queryCount += 1;
});
globalForPrisma.prisma = client;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function timed<T>(
  label: string,
  fn: () => Promise<T>
): Promise<{ result: T; ms: number; queries: number }> {
  queryCount = 0;
  const t0 = Date.now();
  const result = await fn();
  const ms = Date.now() - t0;
  const queries = queryCount;
  console.log(`  ${label}: ${ms}ms, ${queries} queries`);
  return { result, ms, queries };
}

async function main() {
  console.log("=== PERF: Dashboard / Analytics / Top products ===\n");

  const { getDashboardPayload } = await import(
    "../src/lib/services/dashboard.service"
  );
  const { getAnalyticsBreakdown } = await import(
    "../src/lib/services/analytics.service"
  );
  const { prisma } = await import("../src/lib/prisma");

  const company = await prisma.company.findFirst();
  assert(company, "company");

  await prisma.$queryRaw`SELECT 1`;

  const dash = await timed("getDashboardPayload", () =>
    getDashboardPayload(company.id)
  );
  assert(dash.result.today, "dashboard.today");
  assert(Array.isArray(dash.result.stores), "dashboard.stores");

  const analytics = await timed("getAnalyticsBreakdown(month)", () =>
    getAnalyticsBreakdown(company.id, "month")
  );
  assert(analytics.result.network, "analytics.network");
  assert(Array.isArray(analytics.result.products), "analytics.products (top)");

  const analyticsToday = await timed("getAnalyticsBreakdown(today)", () =>
    getAnalyticsBreakdown(company.id, "today")
  );
  assert(analyticsToday.result.network, "analytics today network");

  // Soft budgets — catch pathological N+1 (per-sale return queries)
  assert(
    dash.queries < 80,
    `dashboard queries < 80 (got ${dash.queries}) — possible N+1`
  );
  assert(
    analytics.queries < 60,
    `analytics month queries < 60 (got ${analytics.queries}) — possible N+1`
  );
  assert(dash.ms < 15000, `dashboard < 15s (got ${dash.ms}ms)`);
  assert(analytics.ms < 15000, `analytics < 15s (got ${analytics.ms}ms)`);

  console.log("\nSoft budgets: dashboard <80q / analytics <60q / each <15s");
  console.log(
    `Top products rows: ${analytics.result.products.length}; network netProfit=${analytics.result.network.netProfit}`
  );
  console.log("\nPERF PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.$disconnect());
