/**
 * Part 1: bottle is NOT a sellable product — only WEIGHT packaging attribute.
 * Run: npx tsx scripts/zt-bottle-not-product-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  LocationType,
  ProductKind,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  ensureDefaultPackagingSkus,
  ensurePackagingProduct,
  getPackagingQtyAtStore,
} from "../src/lib/services/packaging.service";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";
import { getWarehouseStock } from "../src/lib/services/stock.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT: bottle is NOT a product (Part 1) ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(store);
  let seller = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      role: Role.SELLER,
      storeId: store.id,
      isActive: true,
    },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER, isActive: true },
    });
    assert.ok(seller);
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
  }

  // Backfill: all packaging products must have salePrice 0
  const zeroed = await prisma.product.updateMany({
    where: { companyId: company.id, kind: ProductKind.PACKAGING },
    data: { salePrice: 0 },
  });
  console.log("backfill packaging salePrice→0:", zeroed.count);

  await ensureDefaultPackagingSkus(company.id);
  const sku = await prisma.packagingSku.findFirst({
    where: { companyId: company.id, volumeMl: 10, isActive: true },
  });
  assert.ok(sku);
  const bottle = await ensurePackagingProduct(sku.id);
  await prisma.product.update({
    where: { id: bottle.id },
    data: { defaultCostPerUnit: 3, salePrice: 0 },
  });

  // Stock bottle at store
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: bottle.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 20,
        costPerUnit: 3,
        notes: "zt-not-product-bottle",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  // --- A: bottle must NOT appear in seller POS catalog ---
  const catalog = await getPosCatalog({
    companyId: company.id,
    storeId: store.id,
  });
  assert.ok(
    !catalog.items.some((i) => i.productId === bottle.id),
    "FAIL: bottle appears in POS catalog"
  );
  console.log("✓ POS catalog excludes packaging bottle");

  // --- B: warehouse stock (merchandise) excludes bottle ---
  const whStock = await getWarehouseStock(company.id);
  assert.ok(
    !whStock.items.some((i) => i.productId === bottle.id),
    "FAIL: bottle in warehouse merchandise stock list"
  );
  console.log("✓ warehouse merchandise stock excludes packaging");

  // --- C: cannot sell bottle as a line item ---
  let blocked = false;
  try {
    await createSale({
      companyId: company.id,
      sellerId: seller.id,
      storeId: store.id,
      paymentMethod: "CASH",
      items: [{ productId: bottle.id, quantity: 1 }],
    });
  } catch (e) {
    blocked =
      e instanceof Error && e.message === "PACKAGING_NOT_FOR_SALE";
  }
  assert.ok(blocked, "FAIL: bottle sold as standalone line");
  console.log("✓ createSale(bottle) → PACKAGING_NOT_FOR_SALE");

  // --- D: WEIGHT 10ml + bottle 10ml — perfume only on receipt ---
  const perfume = await prisma.product.create({
    data: {
      name: `ZT NotProduct perfume ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 20,
      defaultCostPerUnit: 5,
    },
  });
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 50,
        costPerUnit: 5,
        notes: "zt-not-product-perfume",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const bottleBefore = await getPackagingQtyAtStore(bottle.id, store.id);
  const dashBefore = await getDashboardPayload(company.id);

  const sale = await createSale({
    companyId: company.id,
    sellerId: seller.id,
    storeId: store.id,
    paymentMethod: "CASH",
    items: [
      {
        productId: perfume.id,
        quantity: 10,
        packagingProductId: bottle.id,
      },
    ],
  });

  console.log("BEFORE sale:", {
    bottleQty: bottleBefore,
    revenue: dashBefore.today.revenue,
    expenses: dashBefore.today.expenses,
    net: dashBefore.today.netProfit,
  });
  console.log("SALE:", {
    id: sale.id,
    finalAmount: sale.finalAmount,
    itemCount: sale.items.length,
    items: sale.items.map((i) => ({
      productId: i.productId,
      name: i.product?.name,
      qty: decimalToNumber(i.quantity as never),
      price: decimalToNumber(i.salePrice as never),
      packagingProductId: (i as { packagingProductId?: string | null })
        .packagingProductId,
    })),
  });

  const saleDb = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  assert.equal(saleDb.items.length, 1);
  assert.equal(saleDb.items[0].productId, perfume.id);
  assert.equal(saleDb.items[0].packagingProductId, bottle.id);
  assert.equal(decimalToNumber(saleDb.items[0].packagingQuantity!), 1);
  console.log("✓ DB SaleItem: perfume line + packagingProductId attribute (not separate line)");

  assert.equal(sale.items.length, 1, "receipt must have exactly 1 line");
  assert.equal(sale.items[0].productId, perfume.id);
  assert.ok(
    !sale.items.some((i) => i.productId === bottle.id),
    "bottle must not be a receipt line"
  );
  assert.ok(Math.abs(sale.finalAmount - 200) < 0.02, "client pays perfume only 200");

  const bottleAfter = await getPackagingQtyAtStore(bottle.id, store.id);
  assert.equal(bottleAfter, bottleBefore - 1, "bottle stock −1");

  const perfumeQty = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      },
    },
  });
  assert.ok(perfumeQty);
  assert.equal(decimalToNumber(perfumeQty.quantity), 40, "perfume −10ml");

  const bottleType = await prisma.expenseType.findFirst({
    where: { companyId: company.id, name: "Флаконы" },
  });
  assert.ok(bottleType);
  const opex = await prisma.expense.findFirst({
    where: {
      storeId: store.id,
      expenseTypeId: bottleType.id,
      amount: 3,
      createdAt: { gte: new Date(Date.now() - 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(opex, "bottle opex expense missing");

  const dashAfter = await getDashboardPayload(company.id);
  const dRev = dashAfter.today.revenue - dashBefore.today.revenue;
  const dExp = (dashAfter.today.expenses ?? 0) - (dashBefore.today.expenses ?? 0);
  const dNet =
    (dashAfter.today.netProfit ?? 0) - (dashBefore.today.netProfit ?? 0);

  console.log("AFTER sale:", {
    bottleQty: bottleAfter,
    revenue: dashAfter.today.revenue,
    expenses: dashAfter.today.expenses,
    net: dashAfter.today.netProfit,
    dRev,
    dExp,
    dNet,
  });

  assert.ok(Math.abs(dRev - 200) < 0.02, `revenue +200 got ${dRev}`);
  assert.ok(dExp >= 2.99, `expenses include bottle ≥3 got ${dExp}`);
  // gross Δ = 200 − 50 = 150; net Δ ≈ 150 − bottleExp
  assert.ok(
    Math.abs(dNet - (dRev - 50 - dExp)) < 0.1 ||
      Math.abs(dNet - (150 - dExp)) < 0.1,
    `net should drop by bottle opex vs gross; dNet=${dNet} dExp=${dExp}`
  );

  const bottleRow = await prisma.product.findUnique({ where: { id: bottle.id } });
  assert.equal(bottleRow?.kind, ProductKind.PACKAGING);
  assert.equal(decimalToNumber(bottleRow!.salePrice), 0, "bottle salePrice must be 0");

  console.log(
    "\nPASS: bottle not sellable · WEIGHT 10ml receipt perfume-only · stock−1 · opex+3 · net impacted"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
