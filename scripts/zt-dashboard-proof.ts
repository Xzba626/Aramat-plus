/**
 * Zero-trust: Dashboard net = gross − ALL opex including bottle expenses.
 * Run: npx tsx scripts/zt-dashboard-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  ExpensePeriodicity,
  LocationType,
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
} from "../src/lib/services/packaging.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { createExpense } from "../src/lib/services/expense.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Dashboard proof ===\n");

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
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);
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

  await ensureDefaultPackagingSkus(company.id);
  const sku = await prisma.packagingSku.findFirst({
    where: { companyId: company.id, volumeMl: 10 },
  });
  assert.ok(sku);
  const bottle = await ensurePackagingProduct(sku.id);
  await prisma.product.update({
    where: { id: bottle.id },
    data: { defaultCostPerUnit: 3 },
  });

  const perfume = await prisma.product.create({
    data: {
      name: `ZT Dash perfume ${Date.now()}`,
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
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 200,
        costPerUnit: 5,
      salePrice: 100,
        notes: "zt-dash",
      });
      await addBatch(tx, {
        productId: bottle.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 50,
        costPerUnit: 3,
      salePrice: 100,
        notes: "zt-dash-bottle",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [
      { productId: perfume.id, quantity: 50 },
      { productId: bottle.id, quantity: 20 },
    ],
  });

  const expenseType = await prisma.expenseType.findFirst({
    where: { companyId: company.id },
  });
  assert.ok(expenseType);
  await createExpense({
    companyId: company.id,
    createdById: owner.id,
    expenseTypeId: expenseType.id,
    amount: 10,
    storeId: store.id,
    periodicity: ExpensePeriodicity.ONCE,
    description: "zt-dash-rent",
  });

  const before = await getDashboardPayload(company.id);
  const beforeRev = before.today.revenue;
  const beforeGross = before.today.grossProfit ?? before.today.profit;
  const beforeNet = before.today.netProfit ?? before.today.profit;
  const beforeExp = before.today.expenses ?? 0;

  // Sell 10 ml @ 20 = 200 revenue; COGS 10*5=50; gross=150; bottle opex=3
  await createSale({
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

  const after = await getDashboardPayload(company.id);

  const dRev = after.today.revenue - beforeRev;
  const dGross = (after.today.grossProfit ?? after.today.profit) - beforeGross;
  const dNet = (after.today.netProfit ?? after.today.profit) - beforeNet;
  const dExp = (after.today.expenses ?? 0) - beforeExp;

  console.log({
    dRev,
    dGross,
    dNet,
    dExp,
    beforeExp,
    afterExp: after.today.expenses,
  });

  assert.ok(Math.abs(dRev - 200) < 0.02, `revenue Δ expect ~200 got ${dRev}`);
  assert.ok(Math.abs(dGross - 150) < 0.02, `gross Δ expect ~150 got ${dGross}`);
  assert.ok(dExp >= 2.99, `expenses Δ should include bottle ≥3 got ${dExp}`);
  assert.ok(
    Math.abs(dNet - (dGross - dExp)) < 0.05,
    `net Δ ${dNet} !== grossΔ ${dGross} − expΔ ${dExp}`
  );

  assert.ok(
    typeof after.today.deltas.revenue.abs === "number",
    "revenue abs delta missing"
  );
  assert.ok(
    after.pulse?.netSparkline && after.pulse.netSparkline.length === 7,
    "7-day net sparkline missing"
  );

  const activeBranches = await prisma.store.count({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(
    after.stores.length >= activeBranches,
    `dashboard stores ${after.stores.length} < branches ${activeBranches}`
  );

  for (let i = 1; i < after.stores.length; i++) {
    const a = after.stores[i - 1].netProfit ?? after.stores[i - 1].profit;
    const b = after.stores[i].netProfit ?? after.stores[i].profit;
    assert.ok(a >= b - 0.001, "stores not sorted by net desc");
  }

  const sale = await prisma.sale.findFirst({
    where: { storeId: store.id, items: { some: { productId: perfume.id } } },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  assert.ok(sale);
  const perfumeItem = sale.items.find((i) => i.productId === perfume.id);
  assert.ok(perfumeItem);
  const cogs =
    decimalToNumber(perfumeItem.costPerUnit) *
    decimalToNumber(perfumeItem.quantity);
  assert.ok(Math.abs(cogs - 50) < 0.02, `perfume COGS expect 50 got ${cogs}`);

  const bottleType = await prisma.expenseType.findFirst({
    where: { companyId: company.id, name: "Флаконы" },
  });
  assert.ok(bottleType, "expense type Флаконы missing");
  const bottleExpense = await prisma.expense.findFirst({
    where: {
      storeId: store.id,
      expenseTypeId: bottleType.id,
      createdAt: { gte: new Date(Date.now() - 120_000) },
      amount: 3,
    },
    orderBy: { createdAt: "desc" },
  });
  console.log(
    "bottle expense row:",
    bottleExpense?.id,
    bottleExpense?.amount?.toString(),
    bottleExpense?.description
  );
  assert.ok(bottleExpense, "bottle opex expense row missing");

  console.log(
    "\nPASS: ZT Dashboard — abs Δ, net after opex+bottle, store ranking, sparkline"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
