/**
 * Acceptance: partial return restores only returned qty; profit nets returns.
 * Run: npx tsx scripts/test-partial-return.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
  ReturnReasonCode,
  SaleStatus,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import { saleGrossMetricsNetOfReturns } from "../src/lib/services/profit.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Partial return + profit net-of-returns ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "store");
  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER },
    });
    if (seller) {
      await prisma.user.update({
        where: { id: seller.id },
        data: { storeId: store.id },
      });
    }
  }
  assert(seller, "seller");

  const product = await prisma.product.create({
    data: {
      name: `PartialRet ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 10,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 500,
      costPerUnit: 4,
      salePrice: 100,
      notes: "partial-ret-test",
    });
  });

  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 500 }],
    paymentMethod: "CASH",
  });

  const saleFull = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  const saleItem = saleFull.items[0];
  assert(saleItem, "sale item");

  let qty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(qty === 0, `after sale qty 0 got ${qty}`);

  const ret = await createSaleReturn({
    companyId: company.id,
    saleId: sale.id,
    requesterId: seller.id,
    reasonCode: ReturnReasonCode.DEFECT,
    items: [{ saleItemId: saleItem.id, quantity: 120 }],
  });

  await decideSaleReturn({
    companyId: company.id,
    returnId: ret.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });

  qty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(qty === 120, `restored 120 got ${qty}`);
  console.log("✓ Stock restored only 120");

  const updated = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  assert(
    updated.status === SaleStatus.PARTIAL_RETURN,
    `status PARTIAL_RETURN got ${updated.status}`
  );
  console.log("✓ Sale status PARTIAL_RETURN");

  const metrics = await saleGrossMetricsNetOfReturns([updated]);
  // Original: rev 5000, cogs 2000, gross 3000
  // Return 120: rev -1200, cogs -480 → rev 3800, cogs 1520, gross 2280
  assert(Math.abs(metrics.revenue - 3800) < 0.5, `rev 3800 got ${metrics.revenue}`);
  assert(Math.abs(metrics.cogs - 1520) < 0.5, `cogs 1520 got ${metrics.cogs}`);
  assert(
    Math.abs(metrics.grossProfit - 2280) < 0.5,
    `gross 2280 got ${metrics.grossProfit}`
  );
  console.log("✓ Profit net of partial return (gross 2280)");

  await prisma.saleReturnItem.deleteMany({ where: { returnId: ret.id } });
  await prisma.saleReturn.delete({ where: { id: ret.id } });
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\nALL PARTIAL RETURN TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
