/**
 * Zero-trust: revision blind count + empty fact + owner-only discrepancies.
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
  submitInventoryForApproval,
  approveInventorySession,
  getInventorySessionDetail,
} from "../src/lib/services/revision.service";
import { getStoreRevisions } from "../src/lib/services/stores-detail.service";

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
  const fact = 8; // −2 vs expected

  // Fresh session: fact must be null (not prefilled with expected)
  const fresh = await prisma.inventoryItem.findFirst({
    where: { sessionId: session.id, productId: product.id },
  });
  assert.ok(fresh);
  assert.equal(fresh.countedQty, null, "countedQty must start null");
  assert.equal(Number(fresh.difference), 0);

  // While IN_PROGRESS: Manager blind; Owner sees system stock (docs + UX).
  const ownerInProgress = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.OWNER
  );
  assert.equal(ownerInProgress.blind, false, "Owner sees expected during count");
  const ownerIpItem = ownerInProgress.items.find(
    (i) => i.productId === product.id
  );
  assert.ok(ownerIpItem);
  assert.equal("expectedQty" in ownerIpItem, true);
  assert.equal(ownerIpItem.expectedQty, expected);
  assert.equal("difference" in ownerIpItem, false);
  assert.equal(ownerIpItem.countedQty, null);

  const mgrInProgress = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.MANAGER
  );
  assert.equal(mgrInProgress.blind, true);
  const mgrIpItem = mgrInProgress.items.find((i) => i.productId === product.id);
  assert.ok(mgrIpItem);
  assert.equal("expectedQty" in mgrIpItem, false);
  assert.equal(mgrIpItem.countedQty, null);

  // Approve while still IN_PROGRESS must fail (needs PENDING_APPROVAL)
  await assert.rejects(
    () =>
      approveInventorySession({
        companyId: company.id,
        sessionId: session.id,
        approvedById: owner.id,
      }),
    (err: unknown) => err instanceof Error && err.message === "NOT_FOUND"
  );

  // Fill every line: target product = fact (−2), others = their expected (0 variance)
  const sessionLines = await prisma.inventoryItem.findMany({
    where: { sessionId: session.id },
  });
  await updateInventoryCounts({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
    items: sessionLines.map((line) => ({
      productId: line.productId,
      countedQty:
        line.productId === product.id
          ? fact
          : Number(line.expectedQty),
    })),
  });

  // Owner still sees expected while counting; manager remains blind
  const ownerStillBlind = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.OWNER
  );
  assert.equal(ownerStillBlind.blind, false);
  assert.equal(
    ownerStillBlind.items.find((i) => i.productId === product.id)?.countedQty,
    fact
  );
  assert.equal(
    ownerStillBlind.items.find((i) => i.productId === product.id)?.expectedQty,
    expected
  );

  await submitInventoryForApproval({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
  });

  const pending = await prisma.inventorySession.findUnique({
    where: { id: session.id },
  });
  assert.equal(pending?.status, InventoryStatus.PENDING_APPROVAL);

  // Owner sees diffs while pending; manager does not
  const ownerPending = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.OWNER
  );
  assert.equal(ownerPending.blind, false);
  assert.equal(
    ownerPending.items.find((i) => i.productId === product.id)?.difference,
    fact - expected
  );
  const mgrPending = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.MANAGER
  );
  assert.equal(mgrPending.blind, true);
  assert.equal(mgrPending.items.length, 0);

  // Counts immutable: update while pending must fail
  await assert.rejects(
    () =>
      updateInventoryCounts({
        companyId: company.id,
        sessionId: session.id,
        userId: owner.id,
        items: [{ productId: product.id, countedQty: fact }],
      }),
    (err: unknown) => err instanceof Error && err.message === "NOT_FOUND"
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

  const ownerDone = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.OWNER
  );
  assert.equal(ownerDone.blind, false);
  const ownerItem = ownerDone.items.find((i) => i.productId === product.id);
  assert.ok(ownerItem);
  assert.equal(ownerItem.expectedQty, expected);
  assert.equal(ownerItem.countedQty, fact);
  assert.equal(ownerItem.difference, fact - expected); // −2

  const mgrDone = await getInventorySessionDetail(
    company.id,
    session.id,
    Role.MANAGER
  );
  assert.equal(mgrDone.blind, true);
  assert.equal(mgrDone.items.length, 0, "Manager must not see discrepancy lines");

  const storeRevsOwner = await getStoreRevisions(
    company.id,
    store.id,
    Role.OWNER
  );
  const storeRevsMgr = await getStoreRevisions(
    company.id,
    store.id,
    Role.MANAGER
  );
  const ownRow = storeRevsOwner.find((r) => r.id === session.id);
  const mgrRow = storeRevsMgr.find((r) => r.id === session.id);
  assert.ok(ownRow && ownRow.blind === false);
  assert.ok(mgrRow && mgrRow.blind === true);
  assert.equal(mgrRow.items.length, 0);

  const sess = await prisma.inventorySession.findUnique({
    where: { id: session.id },
    include: { items: true },
  });
  assert.equal(sess?.status, InventoryStatus.COMPLETED);
  const item = sess?.items.find((i) => i.productId === product.id);
  assert.ok(item);
  assert.equal(Number(item.expectedQty), expected);
  assert.equal(Number(item.countedQty), fact);
  assert.equal(Number(item.difference), fact - expected);

  console.log(
    "\nPASS: ZT Revision — empty fact → manager blind / owner expected → submit pending → owner diffs → approve FIFO / manager metadata-only"
  );
  console.log(`  expected=${expected} fact=${fact} diff=${fact - expected} finalStock=${qty}`);

  // Cleanup proof artifacts so they never pollute owner analytics / notifications
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { entityId: product.id },
        { message: { contains: product.name } },
        { message: { contains: "ZT Rev" } },
      ],
    },
  });
  await prisma.inventoryItem.deleteMany({ where: { productId: product.id } });
  await prisma.inventorySession.delete({ where: { id: session.id } }).catch(() => undefined);
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.transferItem.deleteMany({ where: { productId: product.id } });
  await prisma.saleItem.deleteMany({ where: { productId: product.id } });
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { entityId: product.id },
        { comment: { contains: product.name } },
      ],
    },
  });
  await prisma.product.delete({ where: { id: product.id } }).catch(async () => {
    await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false },
    });
  });
  console.log("  cleaned up ZT Rev product", product.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
