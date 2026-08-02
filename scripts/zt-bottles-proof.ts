/**
 * Zero-trust: bottles subsystem — receive→WH stock→transfer→store stock→sale OPEX→low stock.
 * Run: npx tsx scripts/zt-bottles-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  LocationType,
  PrismaClient,
  ProductKind,
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
  listPackagingSkus,
} from "../src/lib/services/packaging.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Bottles subsystem proof ===\n");

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

  // Dedicated SKU so stock is isolated from prior tests
  const stamp = Date.now();
  const sku = await prisma.packagingSku.create({
    data: {
      companyId: company.id,
      name: `ZT Bottle ${stamp}`,
      volumeMl: 7 + (stamp % 1000) / 10000,
      material: "glass",
      color: `zt${stamp}`,
      cap: "",
      defaultCost: 2,
      isActive: true,
    },
  });
  const bottle = await ensurePackagingProduct(sku.id);
  await prisma.product.update({
    where: { id: bottle.id },
    data: { defaultCostPerUnit: 2 },
  });

  // Receive 10 to warehouse
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: bottle.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 10,
        costPerUnit: 2,
        notes: "zt-bottles-receive",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const beforeList = await listPackagingSkus(company.id);
  const beforeRow = beforeList.find((s) => s.id === sku.id);
  assert.ok(beforeRow);
  assert.ok(Array.isArray(beforeRow.storeQtys), "storeQtys required");
  assert.ok(
    beforeRow.storeQtys.some((s) => s.storeId === store.id),
    "every active branch must appear in storeQtys"
  );
  assert.equal(beforeRow.warehouseQty, 10);
  console.log("✓ receive + listPackagingSkus storeQtys");

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: bottle.id, quantity: 5 }],
  });

  const afterTransferList = await listPackagingSkus(company.id);
  const afterRow = afterTransferList.find((s) => s.id === sku.id);
  assert.ok(afterRow);
  const storeLine = afterRow.storeQtys.find((s) => s.storeId === store.id);
  assert.ok(storeLine);
  assert.equal(storeLine.qty, 5);
  assert.equal(afterRow.warehouseQty, 5);
  console.log("✓ transfer updates warehouse + storeQtys");

  const perfume = await prisma.product.create({
    data: {
      name: `ZT Bottle perfume ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 25,
      defaultCostPerUnit: 8,
    },
  });
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 20,
        costPerUnit: 8,
        notes: "zt-bottles-perfume",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  // 5 bottles at store → sell 1 → 4 ≤ threshold → notify
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

  const storeBottleAfter = await getPackagingQtyAtStore(bottle.id, store.id);
  assert.equal(storeBottleAfter, 4, "sale must leave 4 bottles at store");

  const bottleType = await prisma.expenseType.findFirst({
    where: { companyId: company.id, name: "Флаконы" },
  });
  assert.ok(bottleType);
  const opex = await prisma.expense.findFirst({
    where: {
      storeId: store.id,
      expenseTypeId: bottleType.id,
      createdAt: { gte: new Date(Date.now() - 120_000) },
      amount: 2,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(opex, "bottle OPEX expense missing");
  console.log("✓ sale deduct + OPEX", opex.amount.toString());

  const notif = await prisma.notification.findFirst({
    where: {
      userId: owner.id,
      type: "LOW_STOCK",
      entityId: bottle.id,
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(notif, "Owner low-stock bottle notification missing");
  assert.equal(notif.title, "Мало флаконов");
  console.log("✓ low-stock notify", notif.title, notif.message);

  const kindCheck = await prisma.product.findUnique({
    where: { id: bottle.id },
  });
  assert.equal(kindCheck?.kind, ProductKind.PACKAGING);

  console.log(
    "\nPASS: ZT Bottles — receive→stock→transfer→storeQtys→sale→OPEX→notify"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
