/**
 * Part 3: Flakony catalog → receive 1000 WH → transfer 100 store → sales → notify <5.
 * Run: npx tsx scripts/zt-packaging-part3-proof.ts
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
import {
  createStoreTransfer,
  createTransfer,
} from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  BOTTLE_LOW_STOCK_THRESHOLD,
  createPackagingSku,
  getPackagingQtyAtStore,
  listPackagingSkus,
} from "../src/lib/services/packaging.service";
import { labelAction, labelEntity } from "../src/lib/i18n/labels";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Packaging Part 3 proof ===\n");
  assert.equal(BOTTLE_LOW_STOCK_THRESHOLD, 5);

  const tRu = (k: string) => {
    const map: Record<string, string> = {
      "actions.packagingSkuCreate": "Флакон создан",
      "entities.packagingSku": "Флакон",
    };
    return map[k] ?? k;
  };
  assert.equal(labelAction("PACKAGING_SKU_CREATE", tRu), "Флакон создан");
  assert.equal(labelEntity("PackagingSku", tRu), "Флакон");
  assert.notEqual(labelEntity("PackagingSku", tRu), "Тара");
  assert.notEqual(labelEntity("PackagingSku", tRu), "PackagingSku");
  console.log("✓ labels PackagingSku / PACKAGING_SKU_CREATE → Флакон");

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

  const stamp = Date.now();
  const { sku, product: bottle } = await createPackagingSku({
    companyId: company.id,
    actorId: owner.id,
    data: {
      name: `ZT P3 ${stamp}`,
      volumeMl: 12 + (stamp % 1000) / 10000,
      material: "glass",
      color: `c${stamp}`,
      defaultCost: 3,
    },
  });
  assert.equal(bottle.kind, ProductKind.PACKAGING);
  assert.equal(Number(bottle.salePrice), 0);
  const listed0 = await listPackagingSkus(company.id);
  const row0 = listed0.find((s) => s.id === sku.id);
  assert.ok(row0);
  assert.equal("cap" in row0, false);
  console.log("✓ create SKU (no cap in list, salePrice=0)", {
    volumeMl: row0.volumeMl,
    material: row0.material,
    color: row0.color,
    planCost: row0.defaultCost,
  });

  // Receive 1000 → central warehouse
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: bottle.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 1000,
        costPerUnit: 3,
        notes: "zt-p3-receive-1000",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
  const afterRecv = await listPackagingSkus(company.id);
  const recvRow = afterRecv.find((s) => s.id === sku.id)!;
  assert.equal(recvRow.warehouseQty, 1000);
  console.log("✓ receive 1000 → warehouse", recvRow.warehouseQty);

  // Transfer 100 → store A
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: bottle.id, quantity: 100 }],
  });
  const afterXfer = await listPackagingSkus(company.id);
  const xferRow = afterXfer.find((s) => s.id === sku.id)!;
  assert.equal(xferRow.warehouseQty, 900);
  const storeLine = xferRow.storeQtys.find((s) => s.storeId === store.id);
  assert.ok(storeLine);
  assert.equal(storeLine.qty, 100);
  console.log("✓ transfer 100 → store", {
    wh: xferRow.warehouseQty,
    store: storeLine.qty,
  });

  // Perfume stock for decant sales
  const perfume = await prisma.product.create({
    data: {
      name: `ZT P3 perfume ${stamp}`,
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
        quantity: 500,
        costPerUnit: 5,
        notes: "zt-p3-perfume",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  // Leave 6 at store A via store→store move (keeps transfer-100 proof intact)
  let storeB = await prisma.store.findFirst({
    where: {
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      id: { not: store.id },
    },
  });
  if (!storeB) {
    storeB = await prisma.store.create({
      data: {
        name: `ZT P3 B ${stamp}`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
        address: "zt-p3",
      },
    });
  }

  await createStoreTransfer({
    companyId: company.id,
    fromStoreId: store.id,
    toStoreId: storeB.id,
    createdById: owner.id,
    items: [{ productId: bottle.id, quantity: 94 }],
    notes: "zt-p3-leave-6-for-notify",
  });
  assert.equal(await getPackagingQtyAtStore(bottle.id, store.id), 6);

  // Sell 2 → qty 4 < threshold 5
  for (let i = 0; i < 2; i++) {
    await createSale({
      companyId: company.id,
      sellerId: seller.id,
      storeId: store.id,
      paymentMethod: "CASH",
      items: [
        {
          productId: perfume.id,
          quantity: 1,
          packagingProductId: bottle.id,
        },
      ],
    });
  }

  const qtyAfter = await getPackagingQtyAtStore(bottle.id, store.id);
  assert.equal(qtyAfter, 4);
  assert.ok(qtyAfter < BOTTLE_LOW_STOCK_THRESHOLD);
  console.log("✓ after sales store qty", qtyAfter);

  const notif = await prisma.notification.findFirst({
    where: {
      userId: owner.id,
      type: "LOW_STOCK",
      entityId: bottle.id,
      title: "Мало флаконов",
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(notif, "owner low-stock notification missing");
  assert.ok(
    notif.message.includes(store.name),
    `notify must name store: ${notif.message}`
  );
  assert.ok(
    notif.message.includes(sku.name) || notif.message.includes("ZT P3"),
    `notify must name bottle: ${notif.message}`
  );
  console.log("✓ low-stock notify", notif.message);

  // Per-store list still correct (other stores not inflated)
  const finalList = await listPackagingSkus(company.id);
  const finalRow = finalList.find((s) => s.id === sku.id)!;
  assert.equal(finalRow.warehouseQty, 900);
  assert.equal(
    finalRow.storeQtys.find((s) => s.storeId === store.id)?.qty,
    4
  );

  console.log(
    "\nPASS: Part 3 — create→1000 WH→100 store→sales→qty 4→owner notify"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
