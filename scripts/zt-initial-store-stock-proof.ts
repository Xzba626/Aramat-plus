/**
 * Proof: INITIAL_STORE_STOCK via WH→Store FIFO (no phantom purchase).
 * Run: npx tsx scripts/zt-initial-store-stock-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  BatchOrigin,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createInitialStoreStock } from "../src/lib/services/initial-store-stock.service";
import { deductBatchesFifo } from "../src/lib/services/stock.service";
import { BATCH_NOTE_MARKERS } from "../src/lib/i18n/labels";

const prisma = new PrismaClient();

async function main() {
  console.log("=== INITIAL_STORE_STOCK proof ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  let stores = await prisma.store.findMany({
    where: {
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      isArchived: false,
    },
    take: 2,
  });
  const createdStoreIds: string[] = [];
  while (stores.length < 2) {
    const s = await prisma.store.create({
      data: {
        name: `ZT Init Store ${Date.now()}-${stores.length}`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
      },
    });
    createdStoreIds.push(s.id);
    stores = [...stores, s];
  }
  const [storeA, storeB] = stores;
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);

  const stamp = Date.now();
  const product = await prisma.product.create({
    data: {
      name: `ZT InitStock ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 3,
      defaultCostPerUnit: 1,
    },
  });

  // Warehouse layers: 1000@1 + 1000@2 = 2000
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 1000,
      costPerUnit: 1,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-layer-1",
      createdById: owner.id,
    });
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 1000,
      costPerUnit: 2,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-layer-2",
      createdById: owner.id,
    });
  });

  // Insufficient on empty product — separate throw path
  const empty = await prisma.product.create({
    data: {
      name: `ZT InitEmpty ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 5,
    },
  });
  await assert.rejects(
    () =>
      createInitialStoreStock({
        companyId: company.id,
        storeId: storeA.id,
        actorId: owner.id,
        quantity: 10,
        productId: empty.id,
      }),
    (e: unknown) => e instanceof Error && e.message === "INSUFFICIENT_STOCK"
  );
  console.log("OK: insufficient warehouse → INSUFFICIENT_STOCK");

  // Store A: 500 — must take from cost=1 layer only
  await createInitialStoreStock({
    companyId: company.id,
    storeId: storeA.id,
    actorId: owner.id,
    quantity: 500,
    productId: product.id,
  });

  // Store B: 700 — 500@1 + 200@2
  await createInitialStoreStock({
    companyId: company.id,
    storeId: storeB.id,
    actorId: owner.id,
    quantity: 700,
    productId: product.id,
  });

  const whQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const aQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: storeA.id,
  });
  const bQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: storeB.id,
  });
  assert.equal(whQty, 800, `warehouse expected 800 got ${whQty}`);
  assert.equal(aQty, 500);
  assert.equal(bQty, 700);
  console.log("OK: WH 800 / A 500 / B 700 (one Product)");

  const storeBatchesA = await prisma.batch.findMany({
    where: {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: storeA.id,
    },
    orderBy: { receivedAt: "asc" },
  });
  assert.ok(storeBatchesA.length >= 1);
  assert.equal(Number(storeBatchesA[0].costPerUnit), 1);
  assert.ok(
    storeBatchesA.every(
      (b) =>
        b.notes?.startsWith(BATCH_NOTE_MARKERS.INITIAL_STORE_STOCK) &&
        b.origin === BatchOrigin.INITIAL
    )
  );
  console.log("OK: store batches marked INITIAL_STORE_STOCK + cost layers");

  const transfers = await prisma.transfer.findMany({
    where: {
      toStoreId: { in: [storeA.id, storeB.id] },
      notes: BATCH_NOTE_MARKERS.INITIAL_STORE_STOCK,
    },
  });
  assert.ok(transfers.length >= 2);
  const logs = await prisma.activityLog.findMany({
    where: {
      action: "INITIAL_STORE_STOCK",
      entityId: { in: transfers.map((t) => t.id) },
    },
  });
  assert.equal(logs.length, transfers.length);
  console.log("OK: ActivityLog INITIAL_STORE_STOCK (not TRANSFER_CREATE)");

  // FIFO sale from store A: 500 available @1 — sell 100
  await prisma.$transaction(async (tx) => {
    const consumed = await deductBatchesFifo(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: storeA.id,
      quantity: 100,
    });
    assert.equal(consumed.length, 1);
    assert.equal(Number(consumed[0].costPerUnit), 1);
  });
  console.log("OK: FIFO sale from initial store batch @ cost 1");

  // New-product atomic path
  const created = await createInitialStoreStock({
    companyId: company.id,
    storeId: storeA.id,
    actorId: owner.id,
    quantity: 40,
    forceCreate: true,
    newProduct: {
      name: `ZT InitNew ${stamp}`,
      accountingType: AccountingType.PIECE,
      salePrice: 9,
      costPerUnit: 4,
    },
  });
  assert.equal(created.mode, "created");
  const newWh = await getQtyAtLocation({
    productId: created.productId,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const newSt = await getQtyAtLocation({
    productId: created.productId,
    locationType: LocationType.STORE,
    locationId: storeA.id,
  });
  assert.equal(newWh, 0, "all moved to store");
  assert.equal(newSt, 40);
  console.log("OK: atomic new Product + WH batch + transfer");

  // Similar warning
  await assert.rejects(
    () =>
      createInitialStoreStock({
        companyId: company.id,
        storeId: storeA.id,
        actorId: owner.id,
        quantity: 5,
        newProduct: {
          name: `ZT InitNew ${stamp}`,
          accountingType: AccountingType.PIECE,
          salePrice: 9,
          costPerUnit: 4,
        },
      }),
    (e: unknown) => e instanceof Error && e.message === "PRODUCT_SIMILAR"
  );
  console.log("OK: PRODUCT_SIMILAR without forceCreate");

  // Exact checklist: WH 1000@1 + 1000@2 → move 500 → WH 1500 / Store 500 @cost 1
  const fifoProd = await prisma.product.create({
    data: {
      name: `ZT InitFifoExact ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 10,
      defaultCostPerUnit: 1,
    },
  });
  const salePriceBefore = Number(
    (await prisma.product.findUniqueOrThrow({ where: { id: fifoProd.id } }))
      .salePrice
  );
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: fifoProd.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 1000,
      costPerUnit: 1,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-exact-1",
      createdById: owner.id,
    });
    await addBatch(tx, {
      productId: fifoProd.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 1000,
      costPerUnit: 2,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-exact-2",
      createdById: owner.id,
    });
  });
  await createInitialStoreStock({
    companyId: company.id,
    storeId: storeA.id,
    actorId: owner.id,
    quantity: 500,
    productId: fifoProd.id,
  });
  const fifoWh = await getQtyAtLocation({
    productId: fifoProd.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const fifoSt = await getQtyAtLocation({
    productId: fifoProd.id,
    locationType: LocationType.STORE,
    locationId: storeA.id,
  });
  assert.equal(fifoWh, 1500);
  assert.equal(fifoSt, 500);
  const fifoStoreBatch = await prisma.batch.findFirst({
    where: {
      productId: fifoProd.id,
      locationType: LocationType.STORE,
      locationId: storeA.id,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
  });
  assert.equal(Number(fifoStoreBatch!.costPerUnit), 1);
  const salePriceAfter = Number(
    (await prisma.product.findUniqueOrThrow({ where: { id: fifoProd.id } }))
      .salePrice
  );
  assert.equal(salePriceAfter, salePriceBefore, "salePrice must not change");
  // Top up store so we can sell 600; FIFO must still start at cost 1
  await createInitialStoreStock({
    companyId: company.id,
    storeId: storeA.id,
    actorId: owner.id,
    quantity: 200,
    productId: fifoProd.id,
  });
  await prisma.$transaction(async (tx) => {
    const consumed = await deductBatchesFifo(tx, {
      productId: fifoProd.id,
      locationType: LocationType.STORE,
      locationId: storeA.id,
      quantity: 600,
    });
    const total = consumed.reduce((s, c) => s + Number(c.quantity), 0);
    assert.equal(total, 600);
    assert.equal(Number(consumed[0].costPerUnit), 1);
    assert.ok(
      consumed.every((c) => Number(c.costPerUnit) === 1),
      "first warehouse layer (cost 1) must be consumed before cost 2"
    );
  });
  console.log("OK: exact FIFO 2000→500→1500/500, sale 600 from cost-1 layers");

  // 10 products (piece + weight), same Product across 2 stores
  const multiIds: string[] = [];
  for (let i = 0; i < 10; i++) {
    const p = await prisma.product.create({
      data: {
        name: `ZT InitMulti ${stamp}-${i}`,
        companyId: company.id,
        accountingType:
          i % 2 === 0 ? AccountingType.PIECE : AccountingType.WEIGHT,
        salePrice: 5 + i,
        defaultCostPerUnit: 1 + (i % 3),
      },
    });
    multiIds.push(p.id);
    // Keep quantities small — Neon round-trips; coverage is diversity not volume.
    const qty = i % 2 === 0 ? 10 + i : 25 + i;
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: p.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: qty * 3,
        costPerUnit: 1 + (i % 3),
        origin: BatchOrigin.PURCHASE,
        notes: `zt-multi-${i}`,
        createdById: owner.id,
      });
    });
    await createInitialStoreStock({
      companyId: company.id,
      storeId: storeA.id,
      actorId: owner.id,
      quantity: qty,
      productId: p.id,
    });
    await createInitialStoreStock({
      companyId: company.id,
      storeId: storeB.id,
      actorId: owner.id,
      quantity: qty,
      productId: p.id,
    });
    const a = await getQtyAtLocation({
      productId: p.id,
      locationType: LocationType.STORE,
      locationId: storeA.id,
    });
    const b = await getQtyAtLocation({
      productId: p.id,
      locationType: LocationType.STORE,
      locationId: storeB.id,
    });
    const wh = await getQtyAtLocation({
      productId: p.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
    });
    assert.equal(a, qty);
    assert.equal(b, qty);
    assert.equal(wh, qty);
    assert.equal(p.id, multiIds[i]);
  }
  const twinCount = await prisma.product.count({
    where: {
      companyId: company.id,
      name: { startsWith: `ZT InitMulti ${stamp}-` },
    },
  });
  assert.equal(twinCount, 10, "must be exactly 10 products, not 20 store twins");
  console.log("OK: 10 products × 2 stores, one Product each");

  // New product: net WH must be 0 (no leftover phantom warehouse stock)
  assert.equal(newWh, 0);
  console.log("OK: new-product path leaves WH at 0 (batch+transfer atomic)");

  // Cleanup
  const ids = [product.id, empty.id, created.productId, fifoProd.id, ...multiIds];
  await prisma.notification.deleteMany({
    where: { entityId: { in: ids } },
  });
  await prisma.saleItem.deleteMany({ where: { productId: { in: ids } } });
  const allTransfers = await prisma.transfer.findMany({
    where: { items: { some: { productId: { in: ids } } } },
    select: { id: true },
  });
  const transferIds = allTransfers.map((t) => t.id);
  await prisma.transferItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.inventoryItem.deleteMany({ where: { productId: { in: ids } } }).catch(() => undefined);
  await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
  await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: ids } },
        { entityId: { in: transferIds } },
      ],
    },
  });
  await prisma.transfer.deleteMany({ where: { id: { in: transferIds } } });
  for (const id of ids) {
    await prisma.product.delete({ where: { id } }).catch(() => undefined);
  }
  for (const id of createdStoreIds) {
    await prisma.store.delete({ where: { id } }).catch(() => undefined);
  }

  console.log("\nPASS initial-store-stock proof");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
