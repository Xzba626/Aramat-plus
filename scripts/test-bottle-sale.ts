/**
 * Wave B P0: WEIGHT sale with bottle deduct + store opex expense.
 * Run: npx tsx scripts/test-bottle-sale.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  BatchOrigin,
  ExpensePeriodicity,
  LocationType,
  ProductKind,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  ensureDefaultPackagingSkus,
  ensurePackagingProduct,
  getPackagingQtyAtStore,
} from "../src/lib/services/packaging.service";
import {
  sumAllocatedExpenses,
} from "../src/lib/services/expense.service";
import {
  saleGrossMetrics,
  withNetProfit,
} from "../src/lib/services/profit.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Wave B bottle sale E2E ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company, "company required (run seed)");

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse, "warehouse required");

  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(store, "branch store required");

  const seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  assert.ok(seller, "seller on branch required");

  await ensureDefaultPackagingSkus(company.id);
  const sku30 = await prisma.packagingSku.findFirst({
    where: { companyId: company.id, volumeMl: 30 },
  });
  assert.ok(sku30, "30ml packaging sku");
  const bottleProduct = await ensurePackagingProduct(sku30.id);
  const bottleCost = 2.5;

  const perfume = await prisma.product.create({
    data: {
      name: `Bottle smoke perfume ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 25,
      defaultCostPerUnit: 8,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: perfume.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 500,
      costPerUnit: 8,
      salePrice: 100,
      origin: BatchOrigin.PURCHASE,
      notes: "bottle-smoke-perfume",
    });
    await addBatch(tx, {
      productId: bottleProduct.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 20,
      costPerUnit: bottleCost,
      salePrice: 100,
      origin: BatchOrigin.PURCHASE,
      notes: "bottle-smoke-bottles",
    });
  });
  console.log("✓ Stock on warehouse");

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: seller.id,
    items: [
      { productId: perfume.id, quantity: 100 },
      { productId: bottleProduct.id, quantity: 10 },
    ],
    notes: "bottle-smoke-transfer",
  });
  console.log("✓ Transfer perfume + bottles to store");

  const perfumeBefore = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      },
    },
  });
  const bottlesBefore = await getPackagingQtyAtStore(bottleProduct.id, store.id);
  assert.ok(perfumeBefore, "perfume at store");
  assert.ok(bottlesBefore >= 1, "at least 1 bottle at store");
  const perfumeStart = decimalToNumber(perfumeBefore!.quantity);
  console.log(
    `✓ Store stock: perfume ${perfumeStart} ml, bottles ${bottlesBefore} pcs`
  );

  const saleQty = 10;
  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [
      {
        productId: perfume.id,
        quantity: saleQty,
        packagingProductId: bottleProduct.id,
      },
    ],
    paymentMethod: "CASH",
  });
  console.log(`✓ Sale ${sale.id} · total ${sale.finalAmount}`);

  const perfumeAfter = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      },
    },
  });
  const bottlesAfter = await getPackagingQtyAtStore(bottleProduct.id, store.id);
  assert.equal(decimalToNumber(perfumeAfter!.quantity), perfumeStart - saleQty);
  assert.equal(bottlesAfter, bottlesBefore - 1);
  console.log(
    `✓ Store after sale: perfume ${perfumeStart - saleQty} ml, bottles ${bottlesAfter} pcs`
  );

  const saleItem = await prisma.saleItem.findFirst({
    where: { saleId: sale.id, isDecant: true },
  });
  assert.ok(saleItem?.packagingProductId === bottleProduct.id);
  assert.equal(decimalToNumber(saleItem!.packagingQuantity!), 1);
  console.log("✓ SaleItem records decant + bottle link");

  const bottleExpense = await prisma.expense.findFirst({
    where: {
      storeId: store.id,
      description: { contains: sale.id },
      expenseType: { name: "Флаконы" },
    },
    include: { expenseType: true },
  });
  assert.ok(bottleExpense, "bottle expense created");
  assert.equal(decimalToNumber(bottleExpense!.amount), bottleCost);
  assert.equal(bottleExpense!.periodicity, ExpensePeriodicity.ONCE);
  console.log(`✓ Expense «Флаконы» ${bottleCost} с. (store opex, not perfume COGS)`);

  const saleRow = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  const gross = saleGrossMetrics([saleRow]);
  const perfumeCogsOnly = saleQty * 8;
  assert.equal(gross.cogs, perfumeCogsOnly);
  console.log(`✓ Gross COGS = perfume only (${perfumeCogsOnly}), bottle not in COGS`);

  const today = new Date();
  const expAlloc = await sumAllocatedExpenses({
    companyId: company.id,
    from: today,
    to: today,
    storeId: store.id,
  });
  assert.ok(expAlloc.total >= bottleCost, "allocated expenses include bottle");
  const net = withNetProfit(gross, expAlloc.total);
  const expectedNet = Math.round((gross.grossProfit - expAlloc.total) * 100) / 100;
  assert.equal(net.netProfit, expectedNet);
  console.log(
    `✓ Net profit ${net.netProfit} = gross ${gross.grossProfit} − opex ${expAlloc.total}`
  );

  // BOTTLE_REQUIRED guard
  let blocked = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: perfume.id, quantity: 5 }],
    });
  } catch (e) {
    blocked = e instanceof Error && e.message === "BOTTLE_REQUIRED";
  }
  assert.ok(blocked, "WEIGHT sale without bottle must fail");
  console.log("✓ BOTTLE_REQUIRED when packaging missing");

  console.log("\n=== All bottle sale checks passed ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
