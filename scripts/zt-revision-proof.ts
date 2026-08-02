/**
 * Zero-trust: revision chain + Manager API blind (no expected qty).
 * Run: npx tsx scripts/zt-revision-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  InventoryStatus,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import {
  createInventorySession,
  updateInventoryCounts,
  approveInventorySession,
  getInventorySessionDetail,
} from "../src/lib/services/revision.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Revision proof ===\n");

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
  let manager = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.MANAGER, isActive: true },
  });
  if (!manager) {
    manager = await prisma.user.create({
      data: {
        email: `zt-mgr-${Date.now()}@test.local`,
        name: "ZT Manager",
        role: Role.MANAGER,
        companyId: company.id,
        passwordHash: "unused",
        isActive: true,
      },
    });
    console.log("created temp manager", manager.id);
  }
  assert.ok(manager);

  // Close any open revision on this store
  await prisma.inventorySession.updateMany({
    where: { storeId: store.id, status: InventoryStatus.IN_PROGRESS },
    data: { status: InventoryStatus.CANCELLED, completedAt: new Date() },
  });
  await prisma.store.update({
    where: { id: store.id },
    data: { status: "ACTIVE" },
  });

  const product = await prisma.product.create({
    data: {
      name: `ZT Rev ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 50,
      defaultCostPerUnit: 20,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 30,
        costPerUnit: 20,
        notes: "zt-rev",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 10 }],
  });

  const session = await createInventorySession({
    companyId: company.id,
    storeId: store.id,
    createdById: owner.id,
    comment: "zt-revision",
  });

  const expected = 10;
  const fact = 7;
  await updateInventoryCounts({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
    items: [{ productId: product.id, countedQty: fact }],
  });

  const ownerDetail = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.OWNER
  );
  assert.equal(ownerDetail.blind, false);
  const ownerItem = ownerDetail.items.find((i) => i.productId === product.id);
  assert.ok(ownerItem);
  assert.equal(ownerItem.expectedQty, expected);

  const mgrDetail = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.MANAGER
  );
  assert.equal(mgrDetail.blind, true, "Manager payload must be blind");
  const mgrItem = mgrDetail.items.find((i) => i.productId === product.id);
  assert.ok(mgrItem);
  assert.equal(
    "expectedQty" in mgrItem,
    false,
    "Manager must not receive expectedQty"
  );
  assert.equal(
    "difference" in mgrItem,
    false,
    "Manager must not receive difference"
  );

  await approveInventorySession({
    companyId: company.id,
    sessionId: session.id,
    approvedById: owner.id,
  });

  const qty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(qty, fact, `after revision stock must be fact=${fact}, got ${qty}`);

  const sess = await prisma.inventorySession.findUnique({
    where: { id: session.id },
    include: { items: true },
  });
  assert.equal(sess?.status, InventoryStatus.COMPLETED);
  const item = sess?.items.find((i) => i.productId === product.id);
  assert.ok(item);
  assert.equal(Number(item.expectedQty), expected);
  assert.equal(Number(item.countedQty), fact);

  const log = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "REVISION_APPROVE",
      entityId: session.id,
    },
  });
  assert.ok(log, "REVISION_APPROVE activity log");

  console.log("\nPASS: ZT Revision — start→count→approve→FIFO stock→journal + Manager blind API");
  console.log(`  expected=${expected} fact=${fact} finalStock=${qty}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
