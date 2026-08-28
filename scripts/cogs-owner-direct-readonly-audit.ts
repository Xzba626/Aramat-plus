/**
 * READ-ONLY forensic audit: OWNER_DIRECT COGS vs analytics symptom.
 *
 * Usage (production read-only — no writes):
 *   set DATABASE_URL=postgresql://readonly:***@host:5432/aromat_plus
 *   set FORENSIC_ALLOW_REMOTE=1
 *   npx tsx scripts/cogs-owner-direct-readonly-audit.ts
 *
 * Local:
 *   npx tsx scripts/cogs-owner-direct-readonly-audit.ts
 *
 * Does NOT INSERT/UPDATE/DELETE. SELECT only.
 */
import { PrismaClient } from "@prisma/client";
import {
  saleGrossMetrics,
  saleGrossMetricsNetOfReturnsSync,
  detectSaleFinancialIssues,
} from "../src/lib/services/profit.service";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { decimalToNumber } from "../src/lib/utils";

const FROM = new Date("2026-08-26T00:00:00.000Z");
const EXPECTED_SALES: Array<{
  label: string;
  total: number;
  qty: number;
  expectedCostPerUnit: number;
}> = [
  { label: "харизма", total: 350, qty: 1, expectedCostPerUnit: 260 },
  { label: "мегамари топ", total: 536, qty: 40, expectedCostPerUnit: 3 },
  { label: "лемансити топ", total: 469, qty: 35, expectedCostPerUnit: 3 },
  { label: "лемансити топ", total: 536, qty: 40, expectedCostPerUnit: 3 },
  { label: "имеченейшн", total: 180.6, qty: 14, expectedCostPerUnit: 3 },
  { label: "имеченейшн", total: 160.8, qty: 12, expectedCostPerUnit: 3 },
  { label: "абреномад топ", total: 200, qty: 40, expectedCostPerUnit: 4 },
  { label: "харизма", total: 350, qty: 1, expectedCostPerUnit: 260 },
  { label: "харизма", total: 350, qty: 1, expectedCostPerUnit: 260 },
];

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function lineCogs(qty: unknown, cpu: unknown) {
  return money(decimalToNumber(qty) * decimalToNumber(cpu));
}

async function assertReadOnlyConnection(prisma: PrismaClient) {
  const url = (process.env.DATABASE_URL ?? "").toLowerCase();
  if (
    !url.includes("localhost") &&
    !url.includes("127.0.0.1") &&
    process.env.FORENSIC_ALLOW_REMOTE !== "1"
  ) {
    throw new Error(
      "Set FORENSIC_ALLOW_REMOTE=1 for non-local DATABASE_URL (read-only audit)"
    );
  }
}

async function main() {
  const prisma = new PrismaClient();
  await assertReadOnlyConnection(prisma);

  const host = process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@") ?? "?";
  console.log("=== COGS OWNER_DIRECT READ-ONLY AUDIT ===");
  console.log(`DATABASE: ${host}`);
  console.log(`FROM: ${FROM.toISOString()}\n`);

  const ownerStores = await prisma.store.findMany({
    where: { kind: "OWNER_DIRECT", isArchived: false },
    select: { id: true, name: true, companyId: true },
  });
  if (!ownerStores.length) {
    console.log("No OWNER_DIRECT stores found.");
    await prisma.$disconnect();
    return;
  }

  for (const store of ownerStores) {
    console.log(`\n## Store: ${store.name} (${store.id})\n`);

    const sales = await prisma.sale.findMany({
      where: {
        storeId: store.id,
        status: { in: ["COMPLETED", "PARTIAL_RETURN"] },
        createdAt: { gte: FROM },
      },
      orderBy: { createdAt: "asc" },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                defaultCostPerUnit: true,
              },
            },
            batch: { select: { id: true, costPerUnit: true } },
          },
        },
      },
    });

    console.log(`Sales in period: ${sales.length}\n`);

    let sumLineCogs = 0;
    let sumRevenue = 0;
    let sumExpectedCogs = 0;

    const table: Array<Record<string, string | number>> = [];

    for (const sale of sales) {
      const total = decimalToNumber(sale.total);
      sumRevenue += total;

      let actualCogs = 0;
      let expectedCogs = 0;
      const reasons: string[] = [];
      const issues = detectSaleFinancialIssues(sale);

      for (const item of sale.items) {
        if (item.isGift) continue;
        const lc = lineCogs(item.quantity, item.costPerUnit);
        actualCogs += lc;

        const exp = EXPECTED_SALES.find(
          (e) =>
            Math.abs(e.total - total) < 0.02 &&
            item.product.name.toLowerCase().includes(e.label.split(" ")[0]) ||
            item.product.name === e.label
        );
        const ctrl = EXPECTED_SALES.find(
          (e) => Math.abs(e.total - total) < 0.02
        );
        if (ctrl) {
          expectedCogs += money(ctrl.qty * ctrl.expectedCostPerUnit);
        }

        if (total > 0 && Math.abs(lc - total) < 0.02) {
          reasons.push(`PHANTOM line ${item.id.slice(-8)}: line_cogs≈sale.total`);
        }
        if (
          ctrl &&
          Math.abs(decimalToNumber(item.costPerUnit) - ctrl.expectedCostPerUnit) >
            0.01
        ) {
          reasons.push(
            `costPerUnit ${decimalToNumber(item.costPerUnit)} ≠ expected ${ctrl.expectedCostPerUnit}`
          );
        }
      }

      sumLineCogs += actualCogs;
      if (expectedCogs > 0) sumExpectedCogs += expectedCogs;

      if (sale.items.length > 3) {
        reasons.push(`${sale.items.length} SaleItem rows (unusual)`);
      }
      if (issues.includes("COGS_DOUBLE_COUNT_PATTERN")) {
        reasons.push("COGS_DOUBLE_COUNT_PATTERN");
      }
      if (Math.abs(actualCogs - total) < 0.02 && sale.items.length === 1) {
        reasons.push("single line COGS = sale.total");
      }

      const productNames = [
        ...new Set(sale.items.map((i) => i.product.name)),
      ].join(", ");

      console.log("---");
      console.log(
        `Sale ${sale.id} | ${sale.createdAt.toISOString()} | total ${total} | status ${sale.status}`
      );
      console.log(`Products: ${productNames}`);
      console.log(
        `SaleItem rows: ${sale.items.length} | Actual COGS: ${money(actualCogs)} | Expected (control): ${money(expectedCogs) || "—"} | Diff: ${money(actualCogs - (expectedCogs || 0))}`
      );
      if (reasons.length) console.log(`Flags: ${[...new Set(reasons)].join("; ")}`);

      for (const item of sale.items) {
        const lc = lineCogs(item.quantity, item.costPerUnit);
        console.log(
          `  SI ${item.id.slice(-8)} | ${item.product.name} | sku ${item.product.sku ?? "—"} | qty ${decimalToNumber(item.quantity)} | cpu ${decimalToNumber(item.costPerUnit)} | line_cogs ${lc} | batch ${item.batchId?.slice(-8) ?? "—"}`
        );
      }

      table.push({
        sale: sale.id.slice(-8),
        createdAt: sale.createdAt.toISOString().slice(0, 19),
        saleTotal: total,
        itemRows: sale.items.length,
        actualCogs: money(actualCogs),
        expectedCogs: money(expectedCogs) || "—",
        diff: money(actualCogs - (expectedCogs || 0)),
        reason: reasons.join("; ") || "OK",
      });
    }

    console.log("\n### SUMMARY");
    console.log(`SUM(sale.total)           = ${money(sumRevenue)}`);
    console.log(`SUM(line_cogs)            = ${money(sumLineCogs)}`);
    console.log(`Expected COGS (control)   = ${money(sumExpectedCogs)}`);
    console.log(`Gross (engine)            = ${money(sumRevenue - sumLineCogs)}`);
    console.log(
      `Analytics symptom gross   = ${money(sumRevenue - sumLineCogs)} (same formula as profit.service)`
    );

    const engine = saleGrossMetrics(sales);
    console.log(
      `\nsaleGrossMetrics: revenue ${engine.revenue} cogs ${engine.cogs} gross ${engine.grossProfit}`
    );

    const retItems = await prisma.saleReturnItem.findMany({
      where: {
        return: {
          saleId: { in: sales.map((s) => s.id) },
          status: "APPROVED",
        },
      },
      include: { return: { select: { saleId: true } } },
    });
    const net = saleGrossMetricsNetOfReturnsSync(
      sales,
      retItems.map((r) => ({
        saleId: r.return.saleId,
        saleItemId: r.saleItemId,
        quantity: r.quantity,
        salePrice: r.salePrice,
        costPerUnit: r.costPerUnit,
      }))
    );
    console.log(
      `saleGrossMetricsNetOfReturns: revenue ${net.revenue} cogs ${net.cogs} gross ${net.grossProfit}`
    );

    const analytics = await getAnalyticsBreakdown(store.companyId, "week", {
      storeId: store.id,
      range: { from: FROM, to: new Date() },
    });
    console.log(
      `\ngetAnalyticsBreakdown (store filter): revenue ${analytics.network.revenue} cogs ${analytics.network.cogs} gross ${analytics.network.grossProfit}`
    );

    const joinInflationTest = await prisma.$queryRaw<
      Array<{ inflated_cogs: number; clean_cogs: number }>
    >`
      SELECT
        COALESCE(SUM(si.quantity * si."costPerUnit" * dup.cnt), 0)::float AS inflated_cogs,
        COALESCE(SUM(si.quantity * si."costPerUnit"), 0)::float AS clean_cogs
      FROM "Sale" s
      JOIN "SaleItem" si ON si."saleId" = s.id
      JOIN (
        SELECT si2.id, COUNT(*)::int AS cnt
        FROM "SaleItem" si2
        JOIN "Product" p ON p.id = si2."productId"
        LEFT JOIN "Category" c ON c.id = p."categoryId"
        GROUP BY si2.id
      ) dup ON dup.id = si.id
      WHERE s."storeId" = ${store.id}
        AND s.status IN ('COMPLETED', 'PARTIAL_RETURN')
        AND s."createdAt" >= ${FROM}
        AND si."isGift" = false
    `;
    const inf = joinInflationTest[0];
    if (inf && Math.abs(inf.inflated_cogs - inf.clean_cogs) > 0.01) {
      console.log(
        `\n⚠ JOIN multiplication test: inflated ${money(inf.inflated_cogs)} vs clean ${money(inf.clean_cogs)}`
      );
    } else {
      console.log(
        `\n✓ JOIN multiplication test: no inflation via Product→Category join (${money(inf?.clean_cogs ?? 0)})`
      );
    }

    console.log("\n### TABLE: Sale | total | rows | actual | expected | diff | reason");
    console.table(table);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
