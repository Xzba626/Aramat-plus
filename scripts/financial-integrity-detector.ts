/**
 * Read-only financial integrity detector (local or production with FORENSIC_ALLOW_REMOTE=1).
 * Run: npx tsx scripts/financial-integrity-detector.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient } from "@prisma/client";
import {
  detectSaleFinancialIssues,
  COMPLETED_SALE_STATUSES,
} from "../src/lib/services/profit.service";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";

const prisma = new PrismaClient();

type Finding = {
  severity: "OK" | "WARNING" | "CRITICAL";
  entity: string;
  entityId: string;
  reason: string;
  expected?: string;
  actual?: string;
  suggestion: string;
};

async function main() {
  assertForensicOrStressSafe("financial-integrity-detector");

  const company = await prisma.company.findFirstOrThrow();
  const findings: Finding[] = [];

  const sales = await prisma.sale.findMany({
    where: {
      store: { companyId: company.id },
      status: { in: [...COMPLETED_SALE_STATUSES] },
    },
    include: { items: true },
    take: 5000,
    orderBy: { createdAt: "desc" },
  });

  for (const s of sales) {
    const issues = detectSaleFinancialIssues(s);
    for (const code of issues) {
      const critical = [
        "PHANTOM_COGS_MATCHES_SALE_TOTAL",
        "COGS_DOUBLE_COUNT_PATTERN",
        "COGS_EXCEEDS_SUBTOTAL",
        "SALE_TOTAL_MISMATCH",
      ].includes(code);
      findings.push({
        severity: critical ? "CRITICAL" : "WARNING",
        entity: "Sale",
        entityId: s.id,
        reason: code,
        suggestion: critical
          ? "Investigate SaleItem rows; possible historical corruption"
          : "Review sale economics",
      });
    }
  }

  const desync = await prisma.$queryRaw<
    Array<{ product_id: string; stock_qty: number; batch_qty: number }>
  >`
    SELECT sb."productId" AS product_id,
           sb.quantity::float AS stock_qty,
           COALESCE((
             SELECT SUM(b.quantity)::float FROM "Batch" b
             WHERE b."productId" = sb."productId"
               AND b."locationType" = sb."locationType"
               AND b."locationId" = sb."locationId"
               AND b.quantity > 0
           ), 0) AS batch_qty
    FROM "StockBalance" sb
    JOIN "Product" p ON p.id = sb."productId"
    WHERE p."companyId" = ${company.id}
      AND sb.quantity > 0
      AND COALESCE((
        SELECT SUM(b.quantity) FROM "Batch" b
        WHERE b."productId" = sb."productId"
          AND b."locationType" = sb."locationType"
          AND b."locationId" = sb."locationId"
          AND b.quantity > 0
      ), 0) < sb.quantity
    LIMIT 50
  `;

  for (const row of desync) {
    findings.push({
      severity: "CRITICAL",
      entity: "StockBalance",
      entityId: row.product_id,
      reason: "STOCK_BATCH_DESYNC",
      expected: `batch >= ${row.stock_qty}`,
      actual: `batch = ${row.batch_qty}`,
      suggestion: "StockBalance exceeds open batches — sale may use stale balance",
    });
  }

  const critical = findings.filter((f) => f.severity === "CRITICAL");
  const warnings = findings.filter((f) => f.severity === "WARNING");

  console.log("=== FINANCIAL INTEGRITY DETECTOR (read-only) ===\n");
  console.log(`Sales scanned: ${sales.length}`);
  console.log(`CRITICAL: ${critical.length}  WARNING: ${warnings.length}\n`);

  if (findings.length) {
    console.table(findings.slice(0, 30));
  } else {
    console.log("OK — no anomalies in sample");
  }

  await prisma.$disconnect();
  process.exit(critical.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
