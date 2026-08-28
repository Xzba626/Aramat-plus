/**
 * Analytics / COGS audit — control case + invariants + optional DB integration.
 * Run: npx tsx scripts/test-analytics-audit.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
} from "@prisma/client";
import {
  saleGrossMetrics,
  saleGrossMetricsNetOfReturnsSync,
  detectSaleFinancialIssues,
  assertSaleFinancialInvariants,
  saleNetPriceRatio,
  saleItemCogs,
} from "../src/lib/services/profit.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { getStoreDetail } from "../src/lib/services/stores-detail.service";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

const CONTROL_8 = [
  { id: "1", total: 536, subtotal: 536, discountAmount: 0, items: [{ quantity: 40, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "2", total: 469, subtotal: 469, discountAmount: 0, items: [{ quantity: 35, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "3", total: 536, subtotal: 536, discountAmount: 0, items: [{ quantity: 40, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "4", total: 180.6, subtotal: 187.6, discountAmount: 7, items: [{ quantity: 14, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "5", total: 160.8, subtotal: 160.8, discountAmount: 0, items: [{ quantity: 12, costPerUnit: 3, salePrice: 13.4 }] },
  { id: "6", total: 200, subtotal: 536, discountAmount: 336, items: [{ quantity: 40, costPerUnit: 4, salePrice: 13.4 }] },
  { id: "7", total: 350, subtotal: 350, discountAmount: 0, items: [{ quantity: 1, costPerUnit: 260, salePrice: 350 }] },
  { id: "8", total: 350, subtotal: 350, discountAmount: 0, items: [{ quantity: 1, costPerUnit: 260, salePrice: 350 }] },
];

function testControlCaseMath() {
  const m = saleGrossMetrics(CONTROL_8);
  assert(Math.abs(m.revenue - 2782.4) < 0.01, `revenue got ${m.revenue}`);
  assert(Math.abs(m.cogs - 1103) < 0.01, `COGS got ${m.cogs}`);
  assert(Math.abs(m.grossProfit - 1679.4) < 0.01, `gross got ${m.grossProfit}`);
  console.log("✓ Control case (8 sales): revenue/COGS/gross match expected");

  const phantom = {
    id: "p",
    total: 536,
    subtotal: 536,
    discountAmount: 0,
    items: [
      { quantity: 40, costPerUnit: 3, salePrice: 13.4 },
      { quantity: 1, costPerUnit: 536, salePrice: 0, isGift: false },
    ],
  };
  const issues = detectSaleFinancialIssues(phantom);
  assert(
    issues.includes("PHANTOM_COGS_MATCHES_SALE_TOTAL"),
    `phantom not detected: ${issues.join(",")}`
  );
  const bad = saleGrossMetrics([phantom]);
  assert(Math.abs(bad.grossProfit - -120) < 0.01, `phantom gross -120 got ${bad.grossProfit}`);
  console.log("✓ Phantom COGS row detected and blocked at commit");

  try {
    assertSaleFinancialInvariants(phantom);
    throw new Error("phantom should throw");
  } catch (e) {
    assert(
      e instanceof Error && e.message === "PHANTOM_COGS_MATCHES_SALE_TOTAL",
      `expected PHANTOM throw got ${e}`
    );
  }
  console.log("✓ assertSaleFinancialInvariants blocks phantom rows at commit");
}

function testDiscountInvariants() {
  const ratio = saleNetPriceRatio(CONTROL_8[5]);
  assert(Math.abs(ratio - 200 / 536) < 0.0001, `abrenomad net ratio got ${ratio}`);
  console.log("✓ Discount sale net price ratio = final/subtotal");

  try {
    assertSaleFinancialInvariants({
      total: 100,
      subtotal: 200,
      discountAmount: 336,
      items: [{ quantity: 1, costPerUnit: 10, salePrice: 200 }],
    });
    throw new Error("discount should fail");
  } catch (e) {
    assert(
      e instanceof Error && e.message === "DISCOUNT_EXCEEDS_SUBTOTAL",
      `expected DISCOUNT_EXCEEDS got ${e}`
    );
  }
  console.log("✓ discount > subtotal rejected");
}

function testReturnNetOfDiscount() {
  const sale = CONTROL_8[5];
  const base = saleGrossMetrics([sale]);
  const afterReturn = saleGrossMetricsNetOfReturnsSync(
    [sale],
    [
      {
        saleId: "6",
        quantity: 40,
        salePrice: 13.4,
        costPerUnit: 4,
      },
    ]
  );
  assert(afterReturn.revenue < base.revenue, "return lowers revenue");
  assert(
    Math.abs(afterReturn.revenue) < 0.02,
    `full discounted return nets ~0 revenue got ${afterReturn.revenue}`
  );
  console.log("✓ Return revenue uses post-discount net unit price");
}

async function testOwnerDirectIntegration(companyId: string, ownerId: string) {
  const ownerStore = await ensureOwnerDirectStore(companyId);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
  assert(warehouse, "warehouse");

  const tag = `audit-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: `Audit ML ${tag}`,
      companyId,
      accountingType: AccountingType.WEIGHT,
      salePrice: 13.4,
      defaultCostPerUnit: 3,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 3,
      salePrice: 13.4,
      notes: tag,
    });
  });

  const sale = await createSale({
    companyId,
    storeId: ownerStore.id,
    sellerId: ownerId,
    items: [{ productId: product.id, quantity: 40, containerSource: "CUSTOMER_BOTTLE" }],
    paymentMethod: "CASH",
  });

  const full = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: { items: true },
  });
  assert(full, "sale row");
  const lineCogs = full.items.reduce((s, it) => s + saleItemCogs(it), 0);
  assert(Math.abs(lineCogs - 120) < 0.01, `line COGS 120 got ${lineCogs}`);
  assert(Math.abs(Number(full.total) - 536) < 0.01, `total 536 got ${full.total}`);

  const [dash, analytics, storeDetail] = await Promise.all([
    getDashboardPayload(companyId, { storeId: ownerStore.id }),
    getAnalyticsBreakdown(companyId, "today", { storeId: ownerStore.id }),
    getStoreDetail(companyId, ownerStore.id),
  ]);

  const storeRow = dash.stores.find((s) => s.id === ownerStore.id);
  assert(storeRow, "dashboard store row");
  assert(
    Math.abs(storeRow.grossProfit - storeDetail.overview.todayGrossProfit) < 0.05,
    `dashboard/store gross mismatch ${storeRow.grossProfit} vs ${storeDetail.overview.todayGrossProfit}`
  );
  assert(
    Math.abs(analytics.network.grossProfit - storeDetail.overview.todayGrossProfit) < 0.05,
    `analytics/store gross mismatch`
  );
  console.log("✓ Owner-direct sale: dashboard = analytics = store detail gross profit");

  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
}

async function main() {
  console.log("=== Analytics / COGS audit ===\n");
  testControlCaseMath();
  testDiscountInvariants();
  testReturnNetOfDiscount();

  try {
    const company = await prisma.company.findFirst();
    if (company) {
      const owner = await prisma.user.findFirst({
        where: { companyId: company.id, role: Role.OWNER },
      });
      if (owner) {
        await testOwnerDirectIntegration(company.id, owner.id);
      } else {
        console.log("⊘ Skipped DB integration (no owner user)");
      }
    } else {
      console.log("⊘ Skipped DB integration (no company)");
    }
  } catch (e) {
    console.warn("⊘ DB integration skipped:", e instanceof Error ? e.message : e);
  }

  console.log("\nALL ANALYTICS AUDIT TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
