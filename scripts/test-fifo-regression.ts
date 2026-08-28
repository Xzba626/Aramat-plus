/**
 * FIFO COGS regression — canonical scenarios.
 * Run: npx tsx scripts/test-fifo-regression.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  LocationType,
  StoreKind,
} from "@prisma/client";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";
import { saleGrossMetrics } from "../src/lib/services/profit.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();
const TAG = `fifo-reg-${Date.now()}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function cleanup(productIds: string[]) {
  if (!productIds.length) return;
  await prisma.saleItem.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.sale.deleteMany({
    where: { items: { some: { productId: { in: productIds } } } },
  });
  await prisma.batch.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.stockBalance.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
}

async function main() {
  assertForensicOrStressSafe("forensic");
  const company = await prisma.company.findFirstOrThrow();
  const owner = await prisma.user.findFirstOrThrow({
    where: { companyId: company.id, role: Role.OWNER },
  });
  const warehouse = await prisma.warehouse.findFirstOrThrow({
    where: { companyId: company.id, isActive: true },
  });
  const store = await prisma.store.findFirstOrThrow({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  const ownerStore = await ensureOwnerDirectStore(company.id);
  const productIds: string[] = [];

  try {
    // Scenario 1: 100@3 + 100@5, sell 150 => COGS 550
    const p1 = await prisma.product.create({
      data: {
        name: `${TAG} fifo-150`,
        sku: `${TAG}-1`,
        companyId: company.id,
        accountingType: AccountingType.WEIGHT,
        salePrice: 13.4,
        defaultCostPerUnit: 3,
      },
    });
    productIds.push(p1.id);
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: p1.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 100,
        costPerUnit: 3,
        salePrice: 13.4,
        notes: TAG,
        createdById: owner.id,
      });
      await addBatch(tx, {
        productId: p1.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 100,
        costPerUnit: 5,
        salePrice: 13.4,
        notes: TAG,
        createdById: owner.id,
      });
    });
    const sale1 = await createSale({
      companyId: company.id,
      storeId: ownerStore.id,
      sellerId: owner.id,
      items: [
        {
          productId: p1.id,
          quantity: 150,
          containerSource: "CUSTOMER_BOTTLE",
        },
      ],
      paymentMethod: "CASH",
    });
    const full1 = await prisma.sale.findUniqueOrThrow({
      where: { id: sale1.id },
      include: { items: true },
    });
    const cogs1 = saleGrossMetrics([full1]).cogs;
    assert(Math.abs(cogs1 - 550) < 0.01, `FIFO 150ml COGS 550 got ${cogs1}`);
    assert(full1.items.length === 2, `expected 2 SaleItem slices got ${full1.items.length}`);
    console.log("✓ FIFO 150ml (100@3 + 50@5) COGS = 550");

    // Scenario 2: 10@3 + 10@5 + 10@7, sell 25 => COGS 135
    const p2 = await prisma.product.create({
      data: {
        name: `${TAG} fifo-25`,
        sku: `${TAG}-2`,
        companyId: company.id,
        accountingType: AccountingType.WEIGHT,
        salePrice: 20,
        defaultCostPerUnit: 3,
      },
    });
    productIds.push(p2.id);
    for (const [q, c] of [
      [10, 3],
      [10, 5],
      [10, 7],
    ] as const) {
      await prisma.$transaction(async (tx) => {
        await addBatch(tx, {
          productId: p2.id,
          locationType: LocationType.STORE,
          locationId: store.id,
          quantity: q,
          costPerUnit: c,
          salePrice: 20,
          notes: TAG,
          createdById: owner.id,
        });
      });
    }
    const sale2 = await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: owner.id,
      items: [
        {
          productId: p2.id,
          quantity: 25,
          containerSource: "CUSTOMER_BOTTLE",
        },
      ],
      paymentMethod: "CASH",
    });
    const full2 = await prisma.sale.findUniqueOrThrow({
      where: { id: sale2.id },
      include: { items: true },
    });
    const cogs2 = saleGrossMetrics([full2]).cogs;
    // 10@3 + 10@5 + 5@7 = 30+50+35 = 115
    assert(Math.abs(cogs2 - 115) < 0.01, `FIFO 25 COGS 115 got ${cogs2}`);
    assert(full2.items.length === 3, `expected 3 slices got ${full2.items.length}`);
    console.log("✓ FIFO 25 (10@3+10@5+5@7) COGS = 115");

    // Scenario 3: revenue - COGS = gross on discounted sale
    const p3 = await prisma.product.create({
      data: {
        name: `${TAG} disc`,
        sku: `${TAG}-3`,
        companyId: company.id,
        accountingType: AccountingType.PIECE,
        salePrice: 100,
        defaultCostPerUnit: 40,
      },
    });
    productIds.push(p3.id);
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: p3.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 5,
        costPerUnit: 40,
        salePrice: 100,
        notes: TAG,
        createdById: owner.id,
      });
    });
    const sale3 = await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: owner.id,
      items: [{ productId: p3.id, quantity: 1 }],
      discountAmount: 10,
      paymentMethod: "CASH",
    });
    const full3 = await prisma.sale.findUniqueOrThrow({
      where: { id: sale3.id },
      include: { items: true },
    });
    const m3 = saleGrossMetrics([full3]);
    assert(Math.abs(decimalToNumber(full3.total) - 90) < 0.01, "total 90");
    assert(Math.abs(m3.cogs - 40) < 0.01, "COGS 40 unchanged by discount");
    assert(Math.abs(m3.grossProfit - 50) < 0.01, "gross 50");
    console.log("✓ Discount does not inflate COGS");

    console.log("\nALL FIFO REGRESSION TESTS PASSED");
  } finally {
    await cleanup(productIds);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
