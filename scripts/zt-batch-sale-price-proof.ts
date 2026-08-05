/**
 * Phase 3+ proofs S1–S5: Batch.salePrice FIFO, transfer, receive immutability, multi-store.
 * Run: npx tsx scripts/zt-batch-sale-price-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  BatchOrigin,
  InventoryStatus,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createInitialStoreStock } from "../src/lib/services/initial-store-stock.service";
import {
  createInventorySession,
  getInventorySessionDetail,
  updateInventoryCounts,
  submitInventoryForApproval,
} from "../src/lib/services/revision.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Batch.salePrice Phase 3+ proof ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);

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
        name: `ZT Price Store ${Date.now()}-${stores.length}`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
      },
    });
    createdStoreIds.push(s.id);
    stores = [...stores, s];
  }
  const [shop1, shop2] = stores;
  const stamp = Date.now();

  // ── S1: FIFO sale 20@120 + 100@140 → sell 25 ─────────────────────────────
  const p1 = await prisma.product.create({
    data: {
      name: `ZT Price S1 ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 140,
      defaultCostPerUnit: 80,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p1.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 20,
      costPerUnit: 80,
      salePrice: 120,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-s1-a",
      createdById: owner.id,
    });
    await addBatch(tx, {
      productId: p1.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 90,
      salePrice: 140,
      origin: BatchOrigin.PURCHASE,
      notes: "zt-s1-b",
      createdById: owner.id,
    });
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop1.id,
    createdById: owner.id,
    items: [{ productId: p1.id, quantity: 120 }],
  });

  const sale = await createSale({
    companyId: company.id,
    storeId: shop1.id,
    sellerId: owner.id,
    items: [{ productId: p1.id, quantity: 25 }],
  });
  const items = await prisma.saleItem.findMany({
    where: { saleId: sale.id },
    orderBy: { salePrice: "asc" },
  });
  assert.equal(items.length, 2);
  assert.equal(Number(items[0].quantity), 20);
  assert.equal(Number(items[0].salePrice), 120);
  assert.equal(Number(items[1].quantity), 5);
  assert.equal(Number(items[1].salePrice), 140);
  const revenue = items.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.salePrice),
    0
  );
  assert.equal(revenue, 3100);
  const storeBatches = await prisma.batch.findMany({
    where: {
      productId: p1.id,
      locationType: LocationType.STORE,
      locationId: shop1.id,
    },
    orderBy: { receivedAt: "asc" },
  });
  const qty120 = storeBatches
    .filter((b) => Number(b.salePrice) === 120)
    .reduce((s, b) => s + Number(b.quantity), 0);
  const qty140 = storeBatches
    .filter((b) => Number(b.salePrice) === 140)
    .reduce((s, b) => s + Number(b.quantity), 0);
  assert.equal(qty120, 0);
  assert.equal(qty140, 95);
  console.log("OK S1: sell 25 → 20×120 + 5×140; remain 95@140");

  // ── S2: Transfer copies salePrice ────────────────────────────────────────
  const p2 = await prisma.product.create({
    data: {
      name: `ZT Price S2 ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 999,
      defaultCostPerUnit: 80,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p2.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 80,
      salePrice: 120,
      createdById: owner.id,
    });
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop1.id,
    createdById: owner.id,
    items: [{ productId: p2.id, quantity: 50 }],
  });
  const wh2 = await getQtyAtLocation({
    productId: p2.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const st2 = await getQtyAtLocation({
    productId: p2.id,
    locationType: LocationType.STORE,
    locationId: shop1.id,
  });
  assert.equal(wh2, 50);
  assert.equal(st2, 50);
  const storeBatch2 = await prisma.batch.findFirst({
    where: {
      productId: p2.id,
      locationType: LocationType.STORE,
      locationId: shop1.id,
      quantity: { gt: 0 },
    },
  });
  assert.equal(Number(storeBatch2!.salePrice), 120);
  assert.notEqual(Number(storeBatch2!.salePrice), 999);
  console.log("OK S2: transfer 50 keeps salePrice 120 (not Product 999)");

  // ── S3: new receive does not change old batch price ──────────────────────
  const p3 = await prisma.product.create({
    data: {
      name: `ZT Price S3 ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 120,
      defaultCostPerUnit: 80,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p3.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 80,
      salePrice: 120,
      createdById: owner.id,
    });
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p3.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 50,
      costPerUnit: 90,
      salePrice: 150,
      createdById: owner.id,
    });
  });
  await prisma.product.update({
    where: { id: p3.id },
    data: { salePrice: 150 },
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop1.id,
    createdById: owner.id,
    items: [{ productId: p3.id, quantity: 20 }],
  });
  const sale3 = await createSale({
    companyId: company.id,
    storeId: shop1.id,
    sellerId: owner.id,
    items: [{ productId: p3.id, quantity: 20 }],
  });
  const items3 = await prisma.saleItem.findMany({ where: { saleId: sale3.id } });
  assert.equal(items3.length, 1);
  assert.equal(Number(items3[0].salePrice), 120);
  console.log("OK S3: after new @150 receive, sell 20 still @120");

  // ── S5: two shops get batch salePrice not Product ────────────────────────
  const p5 = await prisma.product.create({
    data: {
      name: `ZT Price S5 ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 150,
      defaultCostPerUnit: 80,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p5.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 80,
      salePrice: 120,
      createdById: owner.id,
    });
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop1.id,
    createdById: owner.id,
    items: [{ productId: p5.id, quantity: 50 }],
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop2.id,
    createdById: owner.id,
    items: [{ productId: p5.id, quantity: 30 }],
  });
  for (const shop of [shop1, shop2]) {
    const b = await prisma.batch.findFirst({
      where: {
        productId: p5.id,
        locationType: LocationType.STORE,
        locationId: shop.id,
        quantity: { gt: 0 },
      },
    });
    assert.equal(Number(b!.salePrice), 120);
  }
  console.log("OK S5: Shop1 50@120 and Shop2 30@120 (Product catalog 150)");

  // Initial store stock copies WH FIFO salePrice
  const pInit = await prisma.product.create({
    data: {
      name: `ZT Price Init ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 200,
      defaultCostPerUnit: 50,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: pInit.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 1000,
      costPerUnit: 50,
      salePrice: 100,
      createdById: owner.id,
    });
  });
  await createInitialStoreStock({
    companyId: company.id,
    storeId: shop1.id,
    actorId: owner.id,
    quantity: 500,
    productId: pInit.id,
  });
  const initWh = await getQtyAtLocation({
    productId: pInit.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const initSt = await getQtyAtLocation({
    productId: pInit.id,
    locationType: LocationType.STORE,
    locationId: shop1.id,
  });
  assert.equal(initWh, 500);
  assert.equal(initSt, 500);
  const initBatch = await prisma.batch.findFirst({
    where: {
      productId: pInit.id,
      locationType: LocationType.STORE,
      locationId: shop1.id,
      quantity: { gt: 0 },
    },
  });
  assert.equal(Number(initBatch!.salePrice), 100);
  console.log("OK INITIAL_STORE_STOCK: Store 500@100 (not Product 200)");


  // ── S4: revision IN_PROGRESS blind for OWNER ─────────────────────────────
  await prisma.inventorySession.updateMany({
    where: { storeId: shop1.id, status: InventoryStatus.IN_PROGRESS },
    data: { status: InventoryStatus.CANCELLED, completedAt: new Date() },
  });
  const p4 = await prisma.product.create({
    data: {
      name: `ZT Price S4 ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 80,
      defaultCostPerUnit: 40,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: p4.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 40,
      costPerUnit: 40,
      salePrice: 80,
      createdById: owner.id,
    });
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: shop1.id,
    createdById: owner.id,
    items: [{ productId: p4.id, quantity: 20 }],
  });
  const rev = await createInventorySession({
    companyId: company.id,
    storeId: shop1.id,
    createdById: owner.id,
    comment: "zt-s4",
  });
  const detailIp = await getInventorySessionDetail(
    company.id,
    rev.id,
    Role.OWNER
  );
  assert.equal(detailIp.blind, true);
  const row = detailIp.items.find((i) => i.productId === p4.id);
  assert.ok(row);
  assert.equal("expectedQty" in row, false);
  const allLines = await prisma.inventoryItem.findMany({
    where: { sessionId: rev.id },
  });
  await updateInventoryCounts({
    companyId: company.id,
    sessionId: rev.id,
    userId: owner.id,
    items: allLines.map((line) => ({
      productId: line.productId,
      countedQty:
        line.productId === p4.id ? 18 : Number(line.expectedQty),
    })),
  });
  await submitInventoryForApproval({
    companyId: company.id,
    sessionId: rev.id,
    userId: owner.id,
  });
  const detailPend = await getInventorySessionDetail(
    company.id,
    rev.id,
    Role.OWNER
  );
  assert.equal(detailPend.blind, false);
  const pendRow = detailPend.items.find((i) => i.productId === p4.id);
  assert.equal(pendRow?.expectedQty, 20);
  assert.equal(pendRow?.difference, -2);
  console.log("OK S4: IN_PROGRESS blind; PENDING shows SYSTEM/FACT/DIFF");

  // Cleanup
  const ids = [p1.id, p2.id, p3.id, p4.id, p5.id, pInit.id];
  await prisma.inventoryItem.deleteMany({ where: { sessionId: rev.id } });
  await prisma.inventorySession.delete({ where: { id: rev.id } }).catch(() => undefined);

  await prisma.saleItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.sale.deleteMany({
    where: { items: { some: { productId: { in: ids } } } },
  });
  const tr = await prisma.transfer.findMany({
    where: { items: { some: { productId: { in: ids } } } },
    select: { id: true },
  });
  await prisma.transferItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
  await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { entityId: { in: ids } },
        { entityId: { in: tr.map((t) => t.id) } },
      ],
    },
  });
  await prisma.transfer.deleteMany({ where: { id: { in: tr.map((t) => t.id) } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  for (const id of createdStoreIds) {
    await prisma.store.delete({ where: { id } }).catch(() => undefined);
  }

  console.log("\nPASS batch-sale-price proofs S1–S5 + INITIAL");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
