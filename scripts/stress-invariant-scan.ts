/**
 * Post-stress invariant scan — independent raw calculator + DB integrity.
 * Run after: npm run db:seed:stress
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient } from "@prisma/client";
import {
  computeRawFinancials,
  findPhantomCogsSales,
  disconnectIndependentCalc,
} from "./forensic-lab/lib/independent-calculator";
import {
  runDbIntegrityChecks,
  findStockBatchDesync,
  disconnectIntegrity,
} from "./forensic-lab/lib/integrity-checks";
import {
  saleGrossMetricsNetOfReturnsSync,
  loadApprovedReturnLines,
  detectSaleFinancialIssues,
} from "./src/lib/services/profit.service";
import { getAnalyticsBreakdown } from "./src/lib/services/analytics.service";
import { assertForensicOrStressSafe } from "./src/lib/db-safety-guard";

const prisma = new PrismaClient();

async function main() {
  assertForensicOrStressSafe("stress-invariant-scan");

  const company = await prisma.company.findFirstOrThrow();
  console.log("=== STRESS INVARIANT SCAN ===\n");

  const integrity = await runDbIntegrityChecks(company.id);
  const integrityFail = integrity.filter((c) => !c.passed);
  console.log("DB integrity:", integrityFail.length ? "FAIL" : "PASS");
  for (const c of integrity) {
    if (!c.passed) console.log(`  ✗ ${c.check} count=${c.count}`);
  }

  const desync = await findStockBatchDesync(company.id);
  console.log(`Stock/batch desync rows: ${desync.length}`);
  if (desync.length > 0) {
    console.table(desync.slice(0, 5));
  }

  const phantoms = await findPhantomCogsSales(company.id);
  console.log(`Phantom COGS sales: ${phantoms.length}`);
  if (phantoms.length > 0) {
    console.table(phantoms.slice(0, 5));
  }

  const ownerStore = await prisma.store.findFirst({
    where: { companyId: company.id, kind: "OWNER_DIRECT" },
  });

  const stores = await prisma.store.findMany({
    where: { companyId: company.id, isActive: true },
    take: 6,
  });

  let crossCheckFail = 0;
  for (const store of stores) {
    const raw = await computeRawFinancials({
      companyId: company.id,
      storeId: store.id,
    });
    const sales = await prisma.sale.findMany({
      where: {
        storeId: store.id,
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
      },
      include: { items: true },
      take: 5000,
    });
    const retLines = await loadApprovedReturnLines(sales.map((s) => s.id));
    const app = saleGrossMetricsNetOfReturnsSync(sales, retLines);
    const analytics = await getAnalyticsBreakdown(company.id, "year", {
      storeId: store.id,
    });

    const revDiff = Math.abs(raw.revenue - app.revenue);
    const cogsDiff = Math.abs(raw.cogs - app.cogs);
    const anaDiff = Math.abs(analytics.network.revenue - app.revenue);

    if (revDiff > 0.05 || cogsDiff > 0.05) {
      crossCheckFail++;
      console.log(
        `✗ ${store.name}: raw rev=${raw.revenue} app=${app.revenue} cogs raw=${raw.cogs} app=${app.cogs}`
      );
    } else if (sales.length > 0 && anaDiff > 0.05) {
      crossCheckFail++;
      console.log(
        `✗ ${store.name}: analytics rev=${analytics.network.revenue} app=${app.revenue}`
      );
    }
  }

  console.log(`\nCross-check failures: ${crossCheckFail}/${stores.length} stores`);

  const sampleSales = await prisma.sale.findMany({
    where: {
      store: { companyId: company.id },
      status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
    },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  let issueCount = 0;
  for (const s of sampleSales) {
    const issues = detectSaleFinancialIssues(s);
    if (issues.length) issueCount++;
  }
  console.log(`Financial issues in last 100 sales: ${issueCount}`);

  const productCount = await prisma.product.count({
    where: { companyId: company.id },
  });
  const saleCount = await prisma.sale.count({
    where: { store: { companyId: company.id } },
  });
  console.log(`\nDataset: products=${productCount} sales=${saleCount}`);

  if (ownerStore) {
    const odRaw = await computeRawFinancials({
      companyId: company.id,
      storeId: ownerStore.id,
    });
    console.log(
      `OWNER_DIRECT: rev=${odRaw.revenue} cogs=${odRaw.cogs} gross=${odRaw.grossProfit}`
    );
  }

  await prisma.$disconnect();
  await disconnectIndependentCalc();
  await disconnectIntegrity();

  const failed =
    integrityFail.length > 0 ||
    phantoms.length > 0 ||
    crossCheckFail > 0 ||
    issueCount > 0;

  if (failed) {
    console.log("\nSTRESS SCAN: FAIL — see details above");
    process.exit(1);
  }
  console.log("\nSTRESS SCAN: PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
