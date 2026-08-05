/**
 * P0: revision approve adjusts store stock via FIFO
 * Run: npx tsx scripts/test-revision.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
  InventoryStatus,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import {
  createInventorySession,
  updateInventoryCounts,
  submitInventoryForApproval,
  approveInventorySession,
} from "../src/lib/services/revision.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Revision → FIFO stock adjust ===\n");

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
      name: `Revision Test ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 50,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 10,
      costPerUnit: 20,
      salePrice: 100,
      notes: "revision-test",
    });
  });

  let qty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(qty === 10, `start qty 10 got ${qty}`);

  const session = await createInventorySession({
    companyId: company.id,
    storeId: store.id,
    createdById: owner.id,
    comment: "test-revision",
  });
  console.log("✓ Session created", session.id);

  await updateInventoryCounts({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
    items: (
      await prisma.inventoryItem.findMany({ where: { sessionId: session.id } })
    ).map((line) => ({
      productId: line.productId,
      countedQty:
        line.productId === product.id ? 7 : Number(line.expectedQty),
    })),
  });
  console.log("✓ Counted 7 (shortage 3)");

  await submitInventoryForApproval({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
  });
  console.log("✓ Submitted for approval");

  await approveInventorySession({
    companyId: company.id,
    sessionId: session.id,
    approvedById: owner.id,
  });

  qty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(qty === 7, `after approve qty 7 got ${qty}`);
  console.log("✓ Stock adjusted to 7 via FIFO");

  const log = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "REVISION_APPROVE",
      entityId: session.id,
    },
  });
  assert(log, "REVISION_APPROVE logged");
  console.log("✓ ActivityLog REVISION_APPROVE");

  // Cleanup
  await prisma.inventoryItem.deleteMany({ where: { sessionId: session.id } });
  await prisma.inventorySession.delete({ where: { id: session.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.store.update({
    where: { id: store.id },
    data: { status: "ACTIVE" },
  });

  console.log("\nALL REVISION TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
